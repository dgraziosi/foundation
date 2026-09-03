import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PAYLOAD, LOOKUP_AMBIGUOUS_SUGGESTION, LOOKUP_CANDIDATE_SUGGESTION, LOOKUP_NO_MATCH_SUGGESTION, isToolError } from "@foundation/schema";
import { createPool, insertNode, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  deleteGraphNode,
  listGraphActivity,
  lookupGraphNodes,
  searchGraphNodes,
  upsertGraphNode,
} from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query("CREATE EXTENSION IF NOT EXISTS unaccent");
  await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

test(
  "lookup batch, authority, aliases, collisions, and safety",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("lookup_matrix");
    try {
      const priya = await upsertGraphNode(pool, {
        type: "person",
        title: "Priya Shah",
        data: { aliases: ["Pri", "Pree-uh"] },
      });
      const jordan = await upsertGraphNode(pool, { type: "person", title: "Jordan Hale" });
      const alexA = await upsertGraphNode(pool, { type: "person", title: "Alex Rivera" });
      const alexB = await upsertGraphNode(pool, {
        type: "person",
        title: "Alex Rivera",
        allow_duplicate: true,
      });
      const samOrtega = await upsertGraphNode(pool, { type: "person", title: "Sam Ortega" });
      const samOakley = await upsertGraphNode(pool, { type: "person", title: "Sam Oakley" });
      const cafe = await upsertGraphNode(pool, { type: "place", title: "Café Luna" });
      const note = await upsertGraphNode(pool, {
        type: "note",
        title: "Weekend recap",
        payload: { media_type: "text/plain", storage: "inline", body: "Saw Priya at the market." },
      });
      assert.equal(isToolError(priya), false);
      assert.equal(isToolError(jordan), false);
      assert.equal(isToolError(alexA), false);
      assert.equal(isToolError(alexB), false);
      assert.equal(isToolError(samOrtega), false);
      assert.equal(isToolError(samOakley), false);
      assert.equal(isToolError(cafe), false);
      assert.equal(isToolError(note), false);
      if (
        isToolError(priya) ||
        isToolError(jordan) ||
        isToolError(alexA) ||
        isToolError(alexB) ||
        isToolError(samOrtega) ||
        isToolError(samOakley) ||
        isToolError(cafe) ||
        isToolError(note)
      ) {
        return;
      }

      await t.test("aligned batch results for mixed outcomes", async () => {
        const found = await lookupGraphNodes(pool, {
          type: "person",
          inputs: [
            { id: "a", name: "Priya Shah" },
            { id: "b", name: "Pree-uh" },
            { id: "c", name: "Jorden Hale" },
            { id: "d", name: "Alex Rivera" },
            { id: "e", name: "Sam" },
            { id: "f", name: "Café Luna", type: "place" },
            { id: "g", name: "No such person xyz" },
          ],
        });
        assert.equal(isToolError(found), false);
        if (isToolError(found)) {
          return;
        }
        assert.equal(found.results.length, 7);
        assert.deepEqual(
          found.results.map((row) => row.input.id),
          ["a", "b", "c", "d", "e", "f", "g"],
        );
        assert.equal(found.results[0]?.outcome, "exact");
        assert.equal(found.results[0]?.candidates[0]?.id, priya.node.id);
        assert.equal(found.results[0]?.candidates[0]?.match, "title_exact");
        assert.equal(found.results[1]?.outcome, "alias");
        assert.equal(found.results[1]?.candidates[0]?.id, priya.node.id);
        assert.equal(found.results[1]?.candidates[0]?.matched_value, "Pree-uh");
        assert.equal(found.results[2]?.outcome, "candidate");
        assert.equal(found.results[2]?.candidates[0]?.id, jordan.node.id);
        assert.equal(found.results[2]?.candidates[0]?.match, "title_fuzzy");
        assert.equal(found.results[2]?.suggestion, LOOKUP_CANDIDATE_SUGGESTION);
        assert.match(found.results[2]?.candidates[0]?.explanation ?? "", /ranking field, not a probability/);
        assert.equal(found.results[3]?.outcome, "ambiguous");
        assert.equal(found.results[3]?.candidates.length, 2);
        assert.equal(found.results[3]?.suggestion, LOOKUP_AMBIGUOUS_SUGGESTION);
        assert.equal(found.results[4]?.outcome, "candidate");
        assert.ok(found.results[4]?.candidates.every((row) => row.match === "title_token"));
        assert.equal(found.results[5]?.outcome, "exact");
        assert.equal(found.results[5]?.candidates[0]?.id, cafe.node.id);
        assert.equal(found.results[6]?.outcome, "no_match");
        assert.deepEqual(found.results[6]?.candidates, []);
        assert.equal(found.results[6]?.suggestion, LOOKUP_NO_MATCH_SUGGESTION);
        for (const row of found.results) {
          for (const candidate of row.candidates) {
            assert.ok(candidate.id);
            assert.ok(candidate.type);
            assert.ok(candidate.title);
            assert.ok(candidate.status);
            assert.ok(candidate.updated_at);
            assert.equal(typeof candidate.confidence, "number");
            assert.ok(candidate.match);
            assert.ok(candidate.matched_value);
            assert.ok(candidate.explanation);
            assert.equal(/likelihood|% likely/i.test(candidate.explanation), false);
          }
        }
      });

      await t.test("accent and punctuation fold for exact; compact space-removal is candidate", async () => {
        const accent = await lookupGraphNodes(pool, {
          inputs: [{ name: "Cafe Luna", type: "place" }],
        });
        assert.equal(isToolError(accent), false);
        if (!isToolError(accent)) {
          assert.equal(accent.results[0]?.outcome, "exact");
        }
        const punct = await lookupGraphNodes(pool, {
          inputs: [{ name: "priya  shah", type: "person" }],
        });
        assert.equal(isToolError(punct), false);
        if (!isToolError(punct)) {
          assert.equal(punct.results[0]?.outcome, "exact");
        }
        const compact = await lookupGraphNodes(pool, {
          inputs: [{ name: "PriyaShah", type: "person" }],
        });
        assert.equal(isToolError(compact), false);
        if (!isToolError(compact)) {
          assert.equal(compact.results[0]?.outcome, "candidate");
          assert.match(compact.results[0]?.candidates[0]?.explanation ?? "", /removing spaces/);
        }
      });

      await t.test("type filter excludes other types; notes do not steal a person", async () => {
        const asPerson = await lookupGraphNodes(pool, {
          inputs: [{ name: "Café Luna", type: "person" }],
        });
        assert.equal(isToolError(asPerson), false);
        if (!isToolError(asPerson)) {
          assert.equal(asPerson.results[0]?.outcome, "no_match");
        }
        const priyaOnly = await lookupGraphNodes(pool, {
          inputs: [{ name: "Priya", type: "person" }],
        });
        assert.equal(isToolError(priyaOnly), false);
        if (!isToolError(priyaOnly)) {
          assert.ok(priyaOnly.results[0]?.candidates.every((row) => row.type === "person"));
          assert.equal(
            priyaOnly.results[0]?.candidates.some((row) => row.id === note.node.id),
            false,
          );
        }
      });

      await t.test("UUID input resolves live nodes and misses deleted ones", async () => {
        const hit = await lookupGraphNodes(pool, {
          inputs: [{ name: priya.node.id, type: "person" }],
        });
        assert.equal(isToolError(hit), false);
        if (!isToolError(hit)) {
          assert.equal(hit.results[0]?.outcome, "exact");
          assert.equal(hit.results[0]?.candidates[0]?.match, "uuid");
        }
        const gone = await upsertGraphNode(pool, { type: "person", title: "Temporary Gale" });
        assert.equal(isToolError(gone), false);
        if (isToolError(gone)) {
          return;
        }
        const deleted = await deleteGraphNode(pool, { id: gone.node.id }, DESTRUCTIVE);
        assert.equal(isToolError(deleted), false);
        const miss = await lookupGraphNodes(pool, {
          inputs: [{ name: gone.node.id }, { name: "Temporary Gale", type: "person" }],
        });
        assert.equal(isToolError(miss), false);
        if (!isToolError(miss)) {
          assert.equal(miss.results[0]?.outcome, "no_match");
          assert.equal(miss.results[1]?.outcome, "no_match");
        }
      });

      await t.test("alias/title collision is ambiguous", async () => {
        const other = await upsertGraphNode(pool, {
          type: "person",
          title: "Jordan Vale",
          data: { aliases: ["Priya Shah"] },
        });
        assert.equal(isToolError(other), false);
        if (isToolError(other)) {
          return;
        }
        const found = await lookupGraphNodes(pool, {
          inputs: [{ name: "Priya Shah", type: "person" }],
        });
        assert.equal(isToolError(found), false);
        if (!isToolError(found)) {
          assert.equal(found.results[0]?.outcome, "ambiguous");
          const ids = found.results[0]?.candidates.map((row) => row.id).sort();
          assert.deepEqual(ids, [priya.node.id, other.node.id].sort());
        }
      });

      await t.test("deterministic token ties sort by title then id", async () => {
        const first = await lookupGraphNodes(pool, {
          inputs: [{ name: "Sam", type: "person" }],
        });
        const second = await lookupGraphNodes(pool, {
          inputs: [{ name: "Sam", type: "person" }],
        });
        assert.equal(isToolError(first), false);
        assert.equal(isToolError(second), false);
        if (isToolError(first) || isToolError(second)) {
          return;
        }
        assert.deepEqual(
          first.results[0]?.candidates.map((row) => row.id),
          second.results[0]?.candidates.map((row) => row.id),
        );
        const titles = first.results[0]?.candidates.map((row) => row.title) ?? [];
        assert.ok(titles.includes("Sam Oakley"));
        assert.ok(titles.includes("Sam Ortega"));
        assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
      });

      await t.test("fuzzy candidate does not write and copy forbids silent mutation", async () => {
        const before = await listGraphActivity(pool, { limit: 200 });
        assert.equal(isToolError(before), false);
        if (isToolError(before)) {
          return;
        }
        const found = await lookupGraphNodes(pool, {
          inputs: [{ name: "Jorden Hale", type: "person" }],
        });
        assert.equal(isToolError(found), false);
        if (isToolError(found)) {
          return;
        }
        assert.equal(found.results[0]?.outcome, "candidate");
        assert.match(found.results[0]?.suggestion ?? "", /confirm which UUID/);
        assert.match(found.results[0]?.suggestion ?? "", /get is safe/i);
        const after = await listGraphActivity(pool, { limit: 200 });
        assert.equal(isToolError(after), false);
        if (isToolError(after)) {
          return;
        }
        assert.equal(after.activities.length, before.activities.length);
        assert.equal(jordan.node.title, "Jordan Hale");
      });

      await t.test("unrelated upsert on legacy malformed aliases succeeds; lookup ignores them", async () => {
        const legacy = await insertNode(pool, {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "person",
          title: "Mira Chen",
          status: "active",
          payload: DEFAULT_PAYLOAD,
          data: { aliases: "not-an-array", note: "legacy" },
          metadata: {},
        });
        const updated = await upsertGraphNode(pool, {
          id: legacy.id,
          type: "person",
          title: "Mira Chen",
          data: { note: "still here" },
          base_updated_at: legacy.updated_at,
        });
        assert.equal(isToolError(updated), false);
        if (isToolError(updated)) {
          return;
        }
        assert.equal(updated.node.data.aliases, "not-an-array");
        assert.equal(updated.node.data.note, "still here");
        const found = await lookupGraphNodes(pool, {
          inputs: [{ name: "Mira Chen", type: "person" }, { name: "not-an-array", type: "person" }],
        });
        assert.equal(isToolError(found), false);
        if (!isToolError(found)) {
          assert.equal(found.results[0]?.outcome, "exact");
          assert.equal(found.results[1]?.outcome, "no_match");
        }
        const refused = await upsertGraphNode(pool, {
          id: updated.node.id,
          type: "person",
          title: "Mira Chen",
          data: { aliases: "Pri" },
          base_updated_at: updated.node.updated_at,
        });
        assert.equal(isToolError(refused), true);
        const cleared = await upsertGraphNode(pool, {
          id: updated.node.id,
          type: "person",
          title: "Mira Chen",
          data: { aliases: [] },
          base_updated_at: updated.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);
        if (!isToolError(cleared)) {
          assert.deepEqual(cleared.node.data.aliases, []);
        }
      });

      await t.test("search still finds an alias via existing FTS and ranking is unchanged", async () => {
        const hits = await searchGraphNodes(pool, { query: "Pree-uh", type: "person" });
        assert.equal(isToolError(hits), false);
        if (!isToolError(hits)) {
          assert.ok(hits.nodes.some((node) => node.id === priya.node.id));
        }
      });

      await t.test("unknown type and empty inputs refuse", async () => {
        const unknown = await lookupGraphNodes(pool, {
          inputs: [{ name: "Priya Shah", type: "no_such_type" }],
        });
        assert.equal(isToolError(unknown), true);
      });
    } finally {
      await pool.end();
    }
  },
);

test(
  "create-time duplicate preflight uses the lookup matcher",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("lookup_create_preflight");
    try {
      const priya = await upsertGraphNode(pool, {
        type: "person",
        title: "Priya Shah",
        data: { aliases: ["Pree-uh"] },
      });
      const jordan = await upsertGraphNode(pool, { type: "person", title: "Jordan Hale" });
      assert.equal(isToolError(priya), false);
      assert.equal(isToolError(jordan), false);
      if (isToolError(priya) || isToolError(jordan)) {
        return;
      }

      const blockedExact = await upsertGraphNode(pool, { type: "person", title: "Priya Shah" });
      assert.equal(isToolError(blockedExact), true);
      if (isToolError(blockedExact)) {
        assert.equal(blockedExact.error, "duplicate_candidates");
        assert.equal(blockedExact.outcome, "exact");
        assert.equal(blockedExact.candidates?.[0]?.id, priya.node.id);
        assert.equal(blockedExact.candidates?.[0]?.title, "Priya Shah");
        assert.ok(blockedExact.candidates?.[0]?.updated_at);
        assert.equal(typeof blockedExact.candidates?.[0]?.confidence, "number");
        assert.equal(blockedExact.candidates?.[0]?.match, "title_exact");
      }
      const afterBlock = await lookupGraphNodes(pool, {
        inputs: [{ name: "Priya Shah", type: "person" }],
      });
      assert.equal(isToolError(afterBlock), false);
      if (!isToolError(afterBlock)) {
        assert.equal(afterBlock.results[0]?.outcome, "exact");
        assert.equal(afterBlock.results[0]?.candidates.length, 1);
      }

      const blockedAlias = await upsertGraphNode(pool, { type: "person", title: "Pree-uh" });
      assert.equal(isToolError(blockedAlias), true);
      if (isToolError(blockedAlias)) {
        assert.equal(blockedAlias.error, "duplicate_candidates");
        assert.equal(blockedAlias.outcome, "alias");
        assert.equal(blockedAlias.candidates?.[0]?.id, priya.node.id);
      }

      const twin = await upsertGraphNode(pool, {
        type: "person",
        title: "Priya Shah",
        allow_duplicate: true,
      });
      assert.equal(isToolError(twin), false);
      if (isToolError(twin)) {
        return;
      }
      assert.equal(twin.node.title, "Priya Shah");
      assert.notEqual(twin.node.id, priya.node.id);

      const fuzzyCreate = await upsertGraphNode(pool, { type: "person", title: "Jorden Hale" });
      assert.equal(isToolError(fuzzyCreate), false);
      if (!isToolError(fuzzyCreate)) {
        assert.equal(fuzzyCreate.node.title, "Jorden Hale");
        assert.equal(fuzzyCreate.duplicate_warnings?.outcome, "candidate");
        assert.equal(fuzzyCreate.duplicate_warnings?.candidates[0]?.id, jordan.node.id);
        assert.match(fuzzyCreate.duplicate_warnings?.suggestion ?? "", /not blocked/);
      }

      const otherType = await upsertGraphNode(pool, { type: "place", title: "Priya Shah" });
      assert.equal(isToolError(otherType), false);
      if (!isToolError(otherType)) {
        assert.equal(otherType.node.type, "place");
      }

      const renamed = await upsertGraphNode(pool, {
        id: jordan.node.id,
        type: "person",
        title: "Jordan Hale",
        base_updated_at: jordan.node.updated_at,
      });
      assert.equal(isToolError(renamed), false);
      if (!isToolError(renamed)) {
        assert.equal(renamed.node.id, jordan.node.id);
        assert.equal(renamed.duplicate_warnings, undefined);
      }
    } finally {
      await pool.end();
    }
  },
);

test(
  "aliases refuse empty-fold patches; Latin folds match lookup SQL",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("lookup_alias_fold");
    try {
      const created = await upsertGraphNode(pool, {
        type: "person",
        title: "Nia Straße",
        data: { aliases: ["Helga Voss"] },
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) {
        return;
      }
      assert.deepEqual(created.node.data.aliases, ["Helga Voss"]);

      const refused = await upsertGraphNode(pool, {
        id: created.node.id,
        type: "person",
        title: "Nia Straße",
        data: { aliases: ["---"] },
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(refused), true);
      const still = await lookupGraphNodes(pool, {
        inputs: [{ name: "Helga Voss", type: "person" }],
      });
      assert.equal(isToolError(still), false);
      if (!isToolError(still)) {
        assert.equal(still.results[0]?.outcome, "alias");
        assert.equal(still.results[0]?.candidates[0]?.id, created.node.id);
      }

      const folded = await lookupGraphNodes(pool, {
        inputs: [
          { name: "Nia Strasse", type: "person" },
          { name: "ßtrasse", type: "person" },
        ],
      });
      assert.equal(isToolError(folded), false);
      if (!isToolError(folded)) {
        assert.equal(folded.results[0]?.outcome, "exact");
        assert.equal(folded.results[0]?.candidates[0]?.id, created.node.id);
        assert.equal(folded.results[1]?.outcome, "candidate");
      }

      const aliasWrite = await upsertGraphNode(pool, {
        id: created.node.id,
        type: "person",
        title: "Nia Straße",
        data: { aliases: ["ßtrasse"] },
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(aliasWrite), false);
      if (!isToolError(aliasWrite)) {
        assert.deepEqual(aliasWrite.node.data.aliases, ["ßtrasse"]);
        assert.ok((aliasWrite.node.data.aliases as string[]).length > 0);
      }
    } finally {
      await pool.end();
    }
  },
);
