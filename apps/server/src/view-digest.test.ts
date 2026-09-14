import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo, Server } from "node:net";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { createApp } from "./app.js";
import { HOME_LOOKED_COOKIE, homeLookedCookieHeader, readHomeLooked } from "./auth.js";
import { upsertGraphNode } from "./graph.js";
import { digestWindow, HOME_DIGEST_LIMIT, viewHomeDigest } from "./view-digest.js";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = "test-foundation-key";

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

async function listenOrigin(server: Server): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  }
  const address = server.address() as AddressInfo | null;
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function cookieJar(res: Response, existing = ""): string {
  const headers =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
  let jar = existing;
  for (const header of headers) {
    const pair = header.split(";")[0]?.trim() ?? "";
    if (!pair.includes("=")) {
      continue;
    }
    const name = pair.slice(0, pair.indexOf("="));
    const parts = jar.split("; ").filter((item) => item && !item.startsWith(`${name}=`));
    parts.push(pair);
    jar = parts.filter(Boolean).join("; ");
  }
  return jar;
}

test("digest window is last 24h on first visit and exclusive after a look", () => {
  const now = new Date("2026-09-14T16:00:00.000Z");
  const first = digestWindow({ now });
  assert.equal(first.exclusive, false);
  assert.equal(first.since.toISOString(), "2026-09-13T16:00:00.000Z");
  const looked = digestWindow({ lookedAt: now, now });
  assert.equal(looked.exclusive, true);
  assert.equal(looked.since.toISOString(), now.toISOString());
});

test("home looked cookie is Path=/view and parses an ISO stamp", () => {
  const iso = "2026-09-14T16:00:00.000Z";
  const header = homeLookedCookieHeader(iso);
  assert.match(header, new RegExp(`^${HOME_LOOKED_COOKIE}=`));
  assert.match(header, /Path=\/view/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.equal(readHomeLooked(`${HOME_LOOKED_COOKIE}=${encodeURIComponent(iso)}`)?.toISOString(), iso);
  assert.equal(readHomeLooked(`${HOME_LOOKED_COOKIE}=nope`), undefined);
});

test("Home digest lists bot activity since the look watermark", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("view_home_digest");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-digest-"));
  const bindings = {
    FOUNDATION_API_KEY: apiKey,
    DATABASE_URL: databaseUrl,
    FOUNDATION_DATA: dataDir,
    PORT: 0,
    HOST: "127.0.0.1",
    VIEW_PORT: 0,
    VIEW_HOST: "0.0.0.0",
  };
  const viewApp = createApp(pool, bindings, "view");
  const viewServer = viewApp.listen(0);
  const viewOrigin = await listenOrigin(viewServer);

  try {
    const unlock = await fetch(`${viewOrigin}/view/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    assert.equal(unlock.status, 200);
    let cookie = cookieJar(unlock);
    assert.match(cookie, /foundation_key=/);

    const first = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { rows: unknown[]; looked_at: string };
    assert.deepEqual(firstBody.rows, []);
    assert.ok(firstBody.looked_at);
    cookie = cookieJar(first, cookie);
    assert.match(cookie, new RegExp(`${HOME_LOOKED_COOKIE}=`));
    const looked = readHomeLooked(cookie);
    assert.ok(looked);

    const bot = await upsertGraphNode(pool, { type: "note", title: "Digest bot note" });
    assert.equal(isToolError(bot), false);
    if (isToolError(bot)) {
      return;
    }

    const afterBot = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(afterBot.status, 200);
    const afterBotBody = (await afterBot.json()) as {
      rows: Array<{ title: string; actor: string; actor_label: string | null; summary: string; target_id: string }>;
    };
    assert.equal(afterBotBody.rows.length, 1);
    assert.equal(afterBotBody.rows[0]?.title, "Digest bot note");
    assert.equal(afterBotBody.rows[0]?.actor, "agent");
    assert.equal(afterBotBody.rows[0]?.target_id, bot.node.id);
    assert.equal(afterBotBody.rows[0]?.summary, "Created");
    cookie = cookieJar(afterBot, cookie);

    const second = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { rows: unknown[] };
    assert.deepEqual(secondBody.rows, []);
    cookie = cookieJar(second, cookie);

    const userWrite = await fetch(`${viewOrigin}/view/api/nodes/${bot.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Digest user title",
        base_updated_at: bot.node.updated_at,
      }),
    });
    assert.equal(userWrite.status, 200);
    const userBody = (await userWrite.json()) as { node: { title: string; updated_at: string } };
    assert.equal(userBody.node.title, "Digest user title");

    const afterUser = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(afterUser.status, 200);
    const afterUserBody = (await afterUser.json()) as { rows: unknown[] };
    assert.deepEqual(afterUserBody.rows, []);
    cookie = cookieJar(afterUser, cookie);

    const botAgain = await upsertGraphNode(pool, {
      id: bot.node.id,
      type: "note",
      title: "Digest bot again",
      base_updated_at: userBody.node.updated_at,
    });
    assert.equal(isToolError(botAgain), false);
    if (isToolError(botAgain)) {
      return;
    }

    const afterSecondBot = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(afterSecondBot.status, 200);
    const afterSecondBotBody = (await afterSecondBot.json()) as {
      rows: Array<{ title: string; actor: string; summary: string; target_id: string }>;
    };
    assert.equal(afterSecondBotBody.rows.length, 1);
    assert.equal(afterSecondBotBody.rows[0]?.title, "Digest bot again");
    assert.equal(afterSecondBotBody.rows[0]?.actor, "agent");
    assert.match(afterSecondBotBody.rows[0]?.summary ?? "", /title/);
    assert.equal(afterSecondBotBody.rows[0]?.target_id, bot.node.id);
    cookie = cookieJar(afterSecondBot, cookie);

    const gone = await upsertGraphNode(pool, { type: "note", title: "Digest will vanish" });
    assert.equal(isToolError(gone), false);
    if (isToolError(gone)) {
      return;
    }
    const removed = await fetch(`${viewOrigin}/view/api/nodes/${gone.node.id}`, {
      method: "DELETE",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: gone.node.updated_at }),
    });
    assert.equal(removed.status, 200);

    const skipDeleted = await fetch(`${viewOrigin}/view/api/digest`, { headers: { cookie } });
    assert.equal(skipDeleted.status, 200);
    const skipDeletedBody = (await skipDeleted.json()) as { rows: Array<{ title: string }> };
    assert.equal(
      skipDeletedBody.rows.some((row) => row.title === "Digest will vanish"),
      false,
    );

    for (let i = 0; i < HOME_DIGEST_LIMIT + 1; i += 1) {
      const created = await upsertGraphNode(pool, { type: "note", title: `Digest cap ${i}` });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) {
        return;
      }
    }
    const capped = await viewHomeDigest(pool, { since: looked ?? new Date(0), exclusive: true, limit: 99 });
    assert.equal(capped.rows.length, HOME_DIGEST_LIMIT);
    assert.equal(capped.rows[0]?.title, `Digest cap ${HOME_DIGEST_LIMIT}`);
  } finally {
    viewServer.close();
    await pool.end();
  }
});
