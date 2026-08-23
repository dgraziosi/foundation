import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  CODE_HIT_SUGGESTION,
  CODE_MISS_SUGGESTION,
  LIVING_HIT_SUGGESTION,
  ORIGIN_KEY_REFUSED_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  SearchInputSchema,
  URL_FIXTURE,
  isToolError,
} from "@foundation/schema";
import { getGraphNode, searchGraphNodes, upsertGraphNode } from "./graph.js";

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
  "living, code, and url write / get / search / twin-refuse / url-not-identity",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_filters_pointers");
    try {
      await t.test("living plus url writes, get returns both, search living hits", async () => {
        const sheet = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway living sheet",
          data: {
            living: { system: "drive", id: "file-fixture-1" },
            url: URL_FIXTURE,
          },
        });
        assert.equal(isToolError(sheet), false);
        if (isToolError(sheet)) {
          return;
        }
        assert.deepEqual(sheet.node.data.living, { system: "drive", id: "file-fixture-1" });
        assert.equal(sheet.node.data.url, URL_FIXTURE);

        const got = await getGraphNode(pool, sheet.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.deepEqual(got.node.data.living, { system: "drive", id: "file-fixture-1" });
        assert.equal(got.node.data.url, URL_FIXTURE);

        const hit = await searchGraphNodes(pool, {
          living: { system: "drive", id: "file-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, sheet.node.id);
        assert.equal(hit.suggestion, LIVING_HIT_SUGGESTION);
      });

      await t.test("code writes, search code hits, twins refuse", async () => {
        const repo = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway github object",
          data: { code: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(repo), false);
        if (isToolError(repo)) {
          return;
        }
        assert.deepEqual(repo.node.data.code, { system: "github", id: "repo-fixture-1" });

        const hit = await searchGraphNodes(pool, {
          code: { system: "github", id: "repo-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, repo.node.id);
        assert.equal(hit.suggestion, CODE_HIT_SUGGESTION);

        const twin = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway github twin",
          data: { code: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(twin), true);
        if (!isToolError(twin)) {
          return;
        }
        assert.match(twin.error, /github:repo-fixture-1/);
        assert.match(twin.error, new RegExp(repo.node.id));
        assert.match(twin.suggestion ?? "", /do not create a twin/i);

        const miss = await searchGraphNodes(pool, {
          code: { system: "github", id: "no-such-repo" },
        });
        assert.equal(isToolError(miss), false);
        if (!isToolError(miss)) {
          assert.deepEqual(miss.nodes, []);
          assert.equal(miss.suggestion, CODE_MISS_SUGGESTION);
        }
      });

      await t.test("living refuses github; code refuses drive", async () => {
        const livingGithub = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway living github",
          data: { living: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(livingGithub), true);
        if (isToolError(livingGithub)) {
          assert.match(livingGithub.error, /Unknown living.system "github"/);
          assert.match(livingGithub.suggestion ?? "", /data.code/i);
        }

        const codeDrive = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway code drive",
          data: { code: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(codeDrive), true);
        if (isToolError(codeDrive)) {
          assert.match(codeDrive.error, /Unknown code.system "drive"/);
          assert.match(codeDrive.suggestion ?? "", /data.living/i);
        }
      });

      await t.test("url is not unique and not identity; null clears; bad hrefs refuse", async () => {
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

        const livingMiss = await searchGraphNodes(pool, {
          living: { system: "drive", id: "file-fixture-url-only" },
        });
        assert.equal(isToolError(livingMiss), false);
        if (!isToolError(livingMiss)) {
          assert.deepEqual(livingMiss.nodes, []);
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

      await t.test("leftover origin write refuses; search origin is not a selector", async () => {
        const leftover = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover origin",
          data: { origin: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(leftover), true);
        if (isToolError(leftover)) {
          assert.match(leftover.error, /data.origin is not a Foundation key/);
          assert.equal(leftover.suggestion, ORIGIN_KEY_REFUSED_SUGGESTION);
        }

        const parsed = SearchInputSchema.parse({
          origin: { system: "gmail", id: "msg-fixture-1" },
        });
        assert.equal("origin" in parsed, false);
        const noSelector = await searchGraphNodes(pool, parsed);
        assert.equal(isToolError(noSelector), true);
        if (isToolError(noSelector)) {
          assert.match(noSelector.error, /query or a filter/);
          assert.equal(noSelector.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);
        }
      });
    } finally {
      await pool.end();
    }
  },
);
