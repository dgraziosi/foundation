import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import {
  getGraphNode,
  inspectOntology,
  linkGraphNodes,
  manageType,
  searchGraphNodes,
  upsertGraphNode,
} from "./graph.js";

const databaseUrl = process.env.DATABASE_URL;

const FIXTURE_SPEND = {
  amount: 12.5,
  currency: "USD",
  due: "2026-08-20",
  vendor: "Fixture vendor",
  stage: "quoted" as const,
};

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
  "spend seed, project budget fields, upsert, search, and get",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_spend");
    try {
      await t.test("inspect_ontology shows spend and project budget fields", async () => {
        const ontology = await inspectOntology(pool, "types");
        const spend = ontology.types.find((type) => type.slug === "spend");
        const project = ontology.types.find((type) => type.slug === "project");
        assert.ok(spend);
        assert.equal(spend.kind, "artifact");
        assert.deepEqual(spend.parent_types, ["project"]);
        assert.deepEqual(spend.fields?.map((field) => field.name), [
          "amount",
          "currency",
          "due",
          "vendor",
          "stage",
        ]);
        assert.equal(spend.fields?.find((field) => field.name === "due")?.display, "Date");
        assert.equal(spend.fields?.find((field) => field.name === "due")?.role, "date");
        assert.deepEqual(spend.fields?.find((field) => field.name === "stage")?.enum_values, [
          "quoted",
          "paid",
        ]);
        assert.deepEqual(spend.views?.map((view) => view.id), ["list"]);
        assert.equal(spend.default_view, "list");
        assert.equal(spend.hue, "teal");
        assert.equal(spend.glyph, "Receipt");
        assert.ok(project?.fields?.some((field) => field.name === "budget_amount"));
        assert.ok(project?.fields?.some((field) => field.name === "budget_currency"));
      });

      await t.test("seed apply fills missing project budget fields and keeps an operator edit", async () => {
        const ontology = await inspectOntology(pool, "types");
        const project = ontology.types.find((type) => type.slug === "project");
        assert.ok(project);
        const edited = await manageType(pool, {
          action: "update",
          slug: "project",
          fields: [
            { name: "budget_amount", kind: "number", display: "Envelope", needed: false },
            { name: "note", kind: "string", display: "Note", needed: false },
          ],
        });
        assert.equal(isToolError(edited), false);
        await seedSystemOntology(pool);
        const again = (await inspectOntology(pool, "types")).types.find((type) => type.slug === "project");
        const amount = again?.fields?.find((field) => field.name === "budget_amount");
        assert.equal(amount?.display, "Envelope");
        assert.ok(again?.fields?.some((field) => field.name === "note"));
        assert.ok(again?.fields?.some((field) => field.name === "budget_currency"));
      });

      const area = await upsertGraphNode(pool, { type: "area", title: "Throwaway area" });
      const project = await upsertGraphNode(pool, {
        type: "project",
        title: "Throwaway project",
        data: { budget_amount: 100, budget_currency: "USD" },
      });
      const goal = await upsertGraphNode(pool, { type: "goal", title: "Throwaway goal" });
      assert.equal(isToolError(area), false);
      assert.equal(isToolError(project), false);
      assert.equal(isToolError(goal), false);
      if (isToolError(area) || isToolError(project) || isToolError(goal)) {
        return;
      }

      await t.test("upsert spend under a project succeeds; child_of area or goal refuses", async () => {
        const spend = await upsertGraphNode(pool, {
          type: "spend",
          title: "Materials bid",
          data: FIXTURE_SPEND,
        });
        assert.equal(isToolError(spend), false);
        if (isToolError(spend)) {
          return;
        }
        assert.equal(spend.node.title, "Materials bid");
        assert.equal(spend.node.data.amount, 12.5);
        assert.equal(spend.node.data.currency, "USD");
        assert.equal(spend.node.data.vendor, "Fixture vendor");
        assert.equal(spend.node.data.stage, "quoted");
        assert.equal(spend.node.data.due, "2026-08-20");

        const toProject = await linkGraphNodes(pool, {
          from_id: spend.node.id,
          to_id: project.node.id,
          relation_type: "child_of",
          from_base_updated_at: spend.node.updated_at,
          to_base_updated_at: project.node.updated_at,
        });
        assert.equal(isToolError(toProject), false);
        if (!isToolError(toProject)) {
          assert.equal(toProject.edge.relation_type, "child_of");
          assert.equal(toProject.edge.to_id, project.node.id);
        }

        const underArea = await upsertGraphNode(pool, {
          type: "spend",
          title: "Materials bid",
          data: { ...FIXTURE_SPEND, stage: "quoted" },
          allow_duplicate: true,
        });
        assert.equal(isToolError(underArea), false);
        if (isToolError(underArea)) {
          return;
        }
        const toArea = await linkGraphNodes(pool, {
          from_id: underArea.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
          from_base_updated_at: underArea.node.updated_at,
          to_base_updated_at: area.node.updated_at,
        });
        assert.equal(isToolError(toArea), true);
        if (isToolError(toArea)) {
          assert.match(toArea.error, /cannot be child_of/);
          assert.ok(toArea.suggestion);
        }

        const underGoal = await upsertGraphNode(pool, {
          type: "spend",
          title: "Materials bid",
          data: { ...FIXTURE_SPEND },
          allow_duplicate: true,
        });
        assert.equal(isToolError(underGoal), false);
        if (isToolError(underGoal)) {
          return;
        }
        const toGoal = await linkGraphNodes(pool, {
          from_id: underGoal.node.id,
          to_id: goal.node.id,
          relation_type: "child_of",
          from_base_updated_at: underGoal.node.updated_at,
          to_base_updated_at: goal.node.updated_at,
        });
        assert.equal(isToolError(toGoal), true);
        if (isToolError(toGoal)) {
          assert.match(toGoal.error, /cannot be child_of/);
          assert.ok(toGoal.suggestion);
        }
      });

      await t.test("invalid stage and bad date refuse with error and suggestion", async () => {
        const badStage = await upsertGraphNode(pool, {
          type: "spend",
          title: "Materials bid",
          data: { ...FIXTURE_SPEND, stage: "invoiced" },
          allow_duplicate: true,
        });
        assert.equal(isToolError(badStage), true);
        if (isToolError(badStage)) {
          assert.match(badStage.error, /does not match json_schema for type "spend"/);
          assert.ok(badStage.suggestion);
        }

        const badDate = await upsertGraphNode(pool, {
          type: "spend",
          title: "Materials bid",
          data: { ...FIXTURE_SPEND, due: "tomorrow" },
          allow_duplicate: true,
        });
        assert.equal(isToolError(badDate), true);
        if (isToolError(badDate)) {
          assert.match(badDate.error, /data.due must be an ISO date|does not match json_schema/);
          assert.ok(badDate.suggestion);
        }
      });

      const quoted = await upsertGraphNode(pool, {
        type: "spend",
        title: "Materials bid",
        data: FIXTURE_SPEND,
        allow_duplicate: true,
      });
      const paid = await upsertGraphNode(pool, {
        type: "spend",
        title: "Materials bid",
        data: { ...FIXTURE_SPEND, stage: "paid" },
        allow_duplicate: true,
      });
      assert.equal(isToolError(quoted), false);
      assert.equal(isToolError(paid), false);
      if (isToolError(quoted) || isToolError(paid)) {
        return;
      }
      const quotedLink = await linkGraphNodes(pool, {
        from_id: quoted.node.id,
        to_id: project.node.id,
        relation_type: "child_of",
        from_base_updated_at: quoted.node.updated_at,
        to_base_updated_at: project.node.updated_at,
      });
      const paidParent = await getGraphNode(pool, project.node.id);
      assert.equal(isToolError(quotedLink), false);
      assert.equal(isToolError(paidParent), false);
      if (isToolError(paidParent)) {
        return;
      }
      const paidLink = await linkGraphNodes(pool, {
        from_id: paid.node.id,
        to_id: project.node.id,
        relation_type: "child_of",
        from_base_updated_at: paid.node.updated_at,
        to_base_updated_at: paidParent.node.updated_at,
      });
      assert.equal(isToolError(paidLink), false);

      await t.test("search lists spend under the project and filters stage", async () => {
        const under = await searchGraphNodes(pool, { type: "spend", under: project.node.id });
        assert.equal(isToolError(under), false);
        if (isToolError(under)) {
          return;
        }
        const underIds = under.nodes.map((node) => node.id);
        assert.ok(underIds.includes(quoted.node.id));
        assert.ok(underIds.includes(paid.node.id));
        assert.ok(under.nodes.every((node) => node.type === "spend"));

        const paidHits = await searchGraphNodes(pool, {
          type: "spend",
          data_equals: { stage: "paid" },
        });
        assert.equal(isToolError(paidHits), false);
        if (isToolError(paidHits)) {
          return;
        }
        assert.ok(paidHits.nodes.some((node) => node.id === paid.node.id));
        assert.equal(
          paidHits.nodes.some((node) => node.id === quoted.node.id),
          false,
        );

        const quotedHits = await searchGraphNodes(pool, {
          type: "spend",
          data_equals: { stage: "quoted" },
        });
        assert.equal(isToolError(quotedHits), false);
        if (!isToolError(quotedHits)) {
          assert.ok(quotedHits.nodes.some((node) => node.id === quoted.node.id));
        }

        const usd = await searchGraphNodes(pool, {
          type: "spend",
          data_equals: { currency: "USD" },
        });
        assert.equal(isToolError(usd), false);
        if (!isToolError(usd)) {
          assert.ok(usd.nodes.some((node) => node.id === quoted.node.id));
        }

        const dated = await searchGraphNodes(pool, {
          type: "spend",
          due_on_or_before: "2026-08-20",
          due_on_or_after: "2026-08-20",
        });
        assert.equal(isToolError(dated), false);
        if (!isToolError(dated)) {
          assert.ok(dated.nodes.some((node) => node.id === quoted.node.id));
          assert.ok(dated.nodes.every((node) => node.due === "2026-08-20"));
        }
      });

      await t.test("get returns spend data fields and no blob bytes", async () => {
        const got = await getGraphNode(pool, quoted.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.equal(got.node.data.amount, 12.5);
        assert.equal(got.node.data.currency, "USD");
        assert.equal(got.node.data.due, "2026-08-20");
        assert.equal(got.node.data.vendor, "Fixture vendor");
        assert.equal(got.node.data.stage, "quoted");
        assert.equal(got.blob, undefined);
        assert.notEqual(got.node.payload.storage, "blob");
        assert.equal(got.node.payload.blob_id, undefined);
      });

      await t.test("a quoted line patched to paid stays one node", async () => {
        const patched = await upsertGraphNode(pool, {
          id: quoted.node.id,
          type: "spend",
          title: "Materials bid",
          data: { stage: "paid" },
          base_updated_at: quoted.node.updated_at,
        });
        assert.equal(isToolError(patched), false);
        if (isToolError(patched)) {
          return;
        }
        assert.equal(patched.node.id, quoted.node.id);
        assert.equal(patched.node.data.stage, "paid");
        assert.equal(patched.node.data.amount, 12.5);
        assert.equal(patched.node.data.vendor, "Fixture vendor");
        const got = await getGraphNode(pool, quoted.node.id);
        assert.equal(isToolError(got), false);
        if (!isToolError(got)) {
          assert.equal(got.node.id, quoted.node.id);
          assert.equal(got.node.data.stage, "paid");
        }
      });
    } finally {
      await pool.end();
    }
  },
);
