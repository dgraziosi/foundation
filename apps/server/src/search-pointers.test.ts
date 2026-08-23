import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  CODE_KEY_REFUSED_SUGGESTION,
  LINK_HIT_SUGGESTION,
  LIVING_KEY_REFUSED_SUGGESTION,
  ORIGIN_KEY_REFUSED_SUGGESTION,
  REPO_HIT_SUGGESTION,
  REPO_MISS_SUGGESTION,
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
  "link, repo, and url write / get / search / twin-refuse / url-not-identity",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_filters_link_repo");
    try {
      await t.test("link plus url writes, get returns both, search link hits", async () => {
        const sheet = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway link sheet",
          data: {
            link: { system: "drive", id: "file-fixture-1" },
            url: URL_FIXTURE,
          },
        });
        assert.equal(isToolError(sheet), false);
        if (isToolError(sheet)) {
          return;
        }
        assert.deepEqual(sheet.node.data.link, { system: "drive", id: "file-fixture-1" });
        assert.equal(sheet.node.data.url, URL_FIXTURE);

        const got = await getGraphNode(pool, sheet.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.deepEqual(got.node.data.link, { system: "drive", id: "file-fixture-1" });
        assert.equal(got.node.data.url, URL_FIXTURE);

        const hit = await searchGraphNodes(pool, {
          link: { system: "drive", id: "file-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, sheet.node.id);
        assert.equal(hit.suggestion, LINK_HIT_SUGGESTION);
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

      await t.test("link refuses github; repo refuses drive", async () => {
        const linkGithub = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway link github",
          data: { link: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(linkGithub), true);
        if (isToolError(linkGithub)) {
          assert.match(linkGithub.error, /Unknown link.system "github"/);
          assert.match(linkGithub.suggestion ?? "", /data.repo/i);
        }

        const repoDrive = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway repo drive",
          data: { repo: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(repoDrive), true);
        if (isToolError(repoDrive)) {
          assert.match(repoDrive.error, /Unknown repo.system "drive"/);
          assert.match(repoDrive.suggestion ?? "", /data.link/i);
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

        const linkMiss = await searchGraphNodes(pool, {
          link: { system: "drive", id: "file-fixture-url-only" },
        });
        assert.equal(isToolError(linkMiss), false);
        if (!isToolError(linkMiss)) {
          assert.deepEqual(linkMiss.nodes, []);
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

      await t.test("leftover living / code / origin writes refuse; leftover search is not a selector", async () => {
        const leftoverOrigin = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover origin",
          data: { origin: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(leftoverOrigin), true);
        if (isToolError(leftoverOrigin)) {
          assert.match(leftoverOrigin.error, /data.origin is not a Foundation key/);
          assert.equal(leftoverOrigin.suggestion, ORIGIN_KEY_REFUSED_SUGGESTION);
        }

        const leftoverLiving = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover living",
          data: { living: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(leftoverLiving), true);
        if (isToolError(leftoverLiving)) {
          assert.match(leftoverLiving.error, /data.living is not a Foundation key/);
          assert.equal(leftoverLiving.suggestion, LIVING_KEY_REFUSED_SUGGESTION);
        }

        const leftoverCode = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover code",
          data: { code: { system: "github", id: "repo-fixture-1" } },
        });
        assert.equal(isToolError(leftoverCode), true);
        if (isToolError(leftoverCode)) {
          assert.match(leftoverCode.error, /data.code is not a Foundation key/);
          assert.equal(leftoverCode.suggestion, CODE_KEY_REFUSED_SUGGESTION);
        }

        for (const leftover of [
          { origin: { system: "gmail", id: "msg-fixture-1" } },
          { living: { system: "gmail", id: "msg-fixture-1" } },
          { code: { system: "github", id: "repo-fixture-1" } },
        ]) {
          const parsed = SearchInputSchema.parse(leftover);
          assert.equal("origin" in parsed, false);
          assert.equal("living" in parsed, false);
          assert.equal("code" in parsed, false);
          const noSelector = await searchGraphNodes(pool, parsed);
          assert.equal(isToolError(noSelector), true);
          if (isToolError(noSelector)) {
            assert.match(noSelector.error, /query or a filter/);
            assert.equal(noSelector.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);
          }
        }
      });
    } finally {
      await pool.end();
    }
  },
);
