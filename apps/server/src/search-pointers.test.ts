import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  CODE_KEY_REFUSED_SUGGESTION,
  LINK_KEY_REFUSED_SUGGESTION,
  LIVING_KEY_REFUSED_SUGGESTION,
  ORIGIN_KEY_REFUSED_SUGGESTION,
  REPO_HIT_SUGGESTION,
  REPO_MISS_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  SearchInputSchema,
  URL_FIXTURE,
  URL_HIT_SUGGESTION,
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

      await t.test("leftover living / code / origin / link writes refuse; leftover search is not a selector", async () => {
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

        const leftoverLink = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway leftover link",
          data: { link: { system: "drive", id: "file-fixture-1" } },
        });
        assert.equal(isToolError(leftoverLink), true);
        if (isToolError(leftoverLink)) {
          assert.match(leftoverLink.error, /data.link is not a Foundation key/);
          assert.equal(leftoverLink.suggestion, LINK_KEY_REFUSED_SUGGESTION);
        }

        const hrefOnly = SearchInputSchema.parse({ url: URL_FIXTURE });
        assert.equal(hrefOnly.url, undefined);
        const hrefSearch = await searchGraphNodes(pool, hrefOnly);
        assert.equal(isToolError(hrefSearch), true);
        if (isToolError(hrefSearch)) {
          assert.match(hrefSearch.error, /query or a filter/);
          assert.equal(hrefSearch.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);
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
    } finally {
      await pool.end();
    }
  },
);
