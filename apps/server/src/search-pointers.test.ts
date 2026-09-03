import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  REPO_HIT_SUGGESTION,
  REPO_MISS_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  SEARCH_URL_STRING_SUGGESTION,
  SearchInputSchema,
  URL_FIXTURE,
  URL_HIT_SUGGESTION,
  isToolError,
} from "@foundation/schema";
import { getGraphNode, searchGraphNodes, upsertGraphNode } from "./graph.js";

test("search.url string refuses with SEARCH_URL_STRING_SUGGESTION", () => {
  assert.throws(() => SearchInputSchema.parse({ url: URL_FIXTURE }));
  const hrefOnly = SearchInputSchema.safeParse({ url: URL_FIXTURE });
  assert.equal(hrefOnly.success, false);
  if (!hrefOnly.success) {
    assert.equal(hrefOnly.error.issues[0]?.message, SEARCH_URL_STRING_SUGGESTION);
  }
});

const databaseUrl = process.env.DATABASE_URL;

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

test(
  "url, repo, and data.url write / get / search / twin-refuse / https-not-identity",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_filters_url_repo");
    try {
      await t.test("url plus data.url writes, get returns both, search url hits", async () => {
        const sheet = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway url sheet",
          url: { system: "drive", id: "file-fixture-1" },
          data: {
            url: URL_FIXTURE,
          },
        });
        assert.equal(isToolError(sheet), false);
        if (isToolError(sheet)) {
          return;
        }
        assert.deepEqual(sheet.node.metadata.url, { system: "drive", id: "file-fixture-1" });
        assert.equal(sheet.node.data.url, URL_FIXTURE);
        assert.equal(sheet.node.data.link, undefined);

        const smashed = await upsertGraphNode(pool, {
          id: sheet.node.id,
          type: "note",
          title: "Throwaway url sheet",
          metadata: { url: { system: "gmail", id: "msg-fixture-smash" } },
          base_updated_at: sheet.node.updated_at,
        });
        assert.equal(isToolError(smashed), false);
        if (isToolError(smashed)) {
          return;
        }
        assert.deepEqual(smashed.node.metadata.url, { system: "drive", id: "file-fixture-1" });
        assert.equal(smashed.node.data.url, URL_FIXTURE);

        const got = await getGraphNode(pool, sheet.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.deepEqual(got.node.metadata.url, { system: "drive", id: "file-fixture-1" });
        assert.equal(got.node.data.url, URL_FIXTURE);

        const hit = await searchGraphNodes(pool, {
          url: { system: "drive", id: "file-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, sheet.node.id);
        assert.equal(hit.suggestion, URL_HIT_SUGGESTION);
      });

      await t.test("repo writes, search repo hits, twins refuse", async () => {
        const repo = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway github object",
          data: { repo: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(repo), false);
        if (isToolError(repo)) {
          return;
        }
        assert.deepEqual(repo.node.data.repo, { system: "github", id: "repo-fixture-1" });

        const hit = await searchGraphNodes(pool, {
          repo: { system: "github", id: "repo-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, repo.node.id);
        assert.equal(hit.suggestion, REPO_HIT_SUGGESTION);

        const twin = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway github twin",
          data: { repo: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(twin), true);
        if (!isToolError(twin)) {
          return;
        }
        assert.match(twin.error, /github:repo-fixture-1/);
        assert.match(twin.error, new RegExp(repo.node.id));
        assert.match(twin.suggestion ?? "", /do not create a twin/i);

        const miss = await searchGraphNodes(pool, {
          repo: { system: "github", id: "no-such-repo" },
        });
        assert.equal(isToolError(miss), false);
        if (!isToolError(miss)) {
          assert.deepEqual(miss.nodes, []);
          assert.equal(miss.suggestion, REPO_MISS_SUGGESTION);
        }
      });

      await t.test("url refuses github; repo refuses drive", async () => {
        const urlGithub = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway url github",
          // @ts-expect-error github is data.repo, not url
          url: { system: "github", id: "repo-fixture-1" },
        });
        assert.equal(isToolError(urlGithub), true);
        if (isToolError(urlGithub)) {
          assert.match(urlGithub.error, /Unknown url.system "github"/);
          assert.match(urlGithub.suggestion ?? "", /data.repo/i);
        }

        const repoDrive = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway repo drive",
          data: { repo: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(repoDrive), true);
        if (isToolError(repoDrive)) {
          assert.match(repoDrive.error, /Unknown repo.system "drive"/);
          assert.match(repoDrive.suggestion ?? "", /search \{ url \}/i);
        }
      });

      await t.test("data.url is not unique and not identity; null clears; bad hrefs refuse", async () => {
        const first = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway url first",
          data: { url: URL_FIXTURE },
        });
        const second = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway url second",
          data: { url: URL_FIXTURE },
        });
        assert.equal(isToolError(first), false);
        assert.equal(isToolError(second), false);
        if (isToolError(first) || isToolError(second)) {
          return;
        }
        assert.equal(first.node.data.url, URL_FIXTURE);
        assert.equal(second.node.data.url, URL_FIXTURE);
        assert.notEqual(first.node.id, second.node.id);

        const urlMiss = await searchGraphNodes(pool, {
          url: { system: "drive", id: "file-fixture-url-only" },
        });
        assert.equal(isToolError(urlMiss), false);
        if (!isToolError(urlMiss)) {
          assert.deepEqual(urlMiss.nodes, []);
        }

        for (const bad of [
          "javascript:alert(1)",
          "http://example.test/drive/file-fixture-1",
          "https://user:pass@example.test/drive/file-fixture-1",
        ]) {
          const refused = await upsertGraphNode(pool, {
            type: "note",
            title: "Throwaway bad url",
            data: { url: bad },
          });
          assert.equal(isToolError(refused), true, `expected refuse for ${bad}`);
        }

        const objectUrl = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway object data.url",
          data: { url: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(objectUrl), true);

        const cleared = await upsertGraphNode(pool, {
          id: first.node.id,
          type: "note",
          title: "Throwaway url first",
          data: { url: null },
          base_updated_at: first.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);
        if (!isToolError(cleared)) {
          assert.equal(cleared.node.data.url, undefined);
        }
      });

      await t.test("leftover living / code / origin / link writes migrate; leftover search is not a selector", async () => {
        const leftoverOrigin = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover origin",
          data: { origin: { system: "drive", id: "file-fixture-origin" } },
        });
        assert.equal(isToolError(leftoverOrigin), false);
        if (isToolError(leftoverOrigin)) {
          return;
        }
        assert.deepEqual(leftoverOrigin.node.metadata.url, {
          system: "drive",
          id: "file-fixture-origin",
        });
        assert.equal(leftoverOrigin.node.data.origin, undefined);

        const leftoverLiving = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover living",
          data: { living: { system: "gmail", id: "msg-fixture-living" } },
        });
        assert.equal(isToolError(leftoverLiving), false);
        if (isToolError(leftoverLiving)) {
          return;
        }
        assert.deepEqual(leftoverLiving.node.metadata.url, {
          system: "gmail",
          id: "msg-fixture-living",
        });
        assert.equal(leftoverLiving.node.data.living, undefined);

        const leftoverCode = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover code",
          data: { code: { system: "github", id: "repo-fixture-code" } },
        });
        assert.equal(isToolError(leftoverCode), false);
        if (isToolError(leftoverCode)) {
          return;
        }
        assert.deepEqual(leftoverCode.node.data.repo, {
          system: "github",
          id: "repo-fixture-code",
        });
        assert.equal(leftoverCode.node.data.code, undefined);

        const leftoverLink = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover link",
          data: { link: { system: "calendar", id: "evt-fixture-link" } },
        });
        assert.equal(isToolError(leftoverLink), false);
        if (isToolError(leftoverLink)) {
          return;
        }
        assert.deepEqual(leftoverLink.node.metadata.url, {
          system: "calendar",
          id: "evt-fixture-link",
        });
        assert.equal(leftoverLink.node.data.link, undefined);

        const originHit = await searchGraphNodes(pool, {
          url: { system: "drive", id: "file-fixture-origin" },
        });
        assert.equal(isToolError(originHit), false);
        if (!isToolError(originHit)) {
          assert.equal(originHit.nodes[0]?.id, leftoverOrigin.node.id);
        }
        const codeHit = await searchGraphNodes(pool, {
          repo: { system: "github", id: "repo-fixture-code" },
        });
        assert.equal(isToolError(codeHit), false);
        if (!isToolError(codeHit)) {
          assert.equal(codeHit.nodes[0]?.id, leftoverCode.node.id);
        }

        assert.throws(() => SearchInputSchema.parse({ url: URL_FIXTURE }));
        const hrefOnly = SearchInputSchema.safeParse({ url: URL_FIXTURE });
        assert.equal(hrefOnly.success, false);
        if (!hrefOnly.success) {
          assert.equal(hrefOnly.error.issues[0]?.message, SEARCH_URL_STRING_SUGGESTION);
        }

        for (const leftover of [
          { origin: { system: "gmail", id: "msg-fixture-1" } },
          { living: { system: "gmail", id: "msg-fixture-1" } },
          { code: { system: "github", id: "repo-fixture-1" } },
          { link: { system: "gmail", id: "msg-fixture-1" } },
        ]) {
          const parsed = SearchInputSchema.parse(leftover);
          assert.equal("origin" in parsed, false);
          assert.equal("living" in parsed, false);
          assert.equal("code" in parsed, false);
          assert.equal("link" in parsed, false);
          const noSelector = await searchGraphNodes(pool, parsed);
          assert.equal(isToolError(noSelector), true);
          if (isToolError(noSelector)) {
            assert.match(noSelector.error, /query or a filter/);
            assert.equal(noSelector.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);
          }
        }
      });

      await t.test("boot leftover row migrates into url and leftover keys are gone", async () => {
        await pool.query(
          `INSERT INTO nodes (type, title, status, payload, data)
           VALUES (
             'note',
             'Throwaway leftover fixture row',
             'active',
             '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
             '{"living":{"system":"drive","id":"file-fixture-boot"}}'::jsonb
           )`,
        );
        await pool.query("SELECT migrate_leftover_identity()");
        const { rows } = await pool.query<{
          data: Record<string, unknown>;
          metadata: Record<string, unknown>;
        }>(
          `SELECT data, metadata FROM nodes WHERE title = 'Throwaway leftover fixture row'`,
        );
        assert.deepEqual(rows[0]?.metadata.url, { system: "drive", id: "file-fixture-boot" });
        assert.equal(rows[0]?.data.living, undefined);
        const hit = await searchGraphNodes(pool, {
          url: { system: "drive", id: "file-fixture-boot" },
        });
        assert.equal(isToolError(hit), false);
        if (!isToolError(hit)) {
          assert.equal(hit.nodes.length, 1);
          assert.equal(hit.nodes[0]?.title, "Throwaway leftover fixture row");
        }
      });
    } finally {
      await pool.end();
    }
  },
);
