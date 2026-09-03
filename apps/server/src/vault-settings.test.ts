import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, updateVaultSettings, type Pool } from "@foundation/db";
import { DUE_TIMEZONE, isToolError, todayInVault, type Node } from "@foundation/schema";
import { linkGraphNodes, searchGraphNodes, upsertGraphNode } from "./graph.js";
import { workingSetGraph } from "./working-set.js";

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

async function created(pool: Pool, input: Parameters<typeof upsertGraphNode>[1]): Promise<Node> {
  const result = await upsertGraphNode(pool, input);
  assert.equal(isToolError(result), false);
  if (isToolError(result)) {
    throw new Error(result.error);
  }
  return result.node;
}

function zoneWhereTodayDiffers(from: string): string {
  const today = todayInVault(from);
  for (const zone of ["Pacific/Auckland", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati"]) {
    if (todayInVault(zone) !== today) {
      return zone;
    }
  }
  throw new Error("no IANA zone differs from the vault clock today");
}

test(
  "search due today and overdue follow the vault settings timezone",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("vault_settings_due");
    try {
      const nyToday = todayInVault(DUE_TIMEZONE);
      const otherZone = zoneWhereTodayDiffers(DUE_TIMEZONE);
      const otherToday = todayInVault(otherZone);

      const nyTask = await created(pool, {
        type: "task",
        title: "Throwaway NY today",
        data: { due: nyToday },
      });
      const otherTask = await created(pool, {
        type: "task",
        title: "Throwaway other today",
        data: { due: otherToday },
      });

      const nyDue = await searchGraphNodes(pool, { type: "task", due: "today" });
      assert.equal(isToolError(nyDue), false);
      if (isToolError(nyDue)) {
        return;
      }
      assert.ok(nyDue.nodes.some((node) => node.id === nyTask.id));
      assert.equal(
        nyDue.nodes.some((node) => node.id === otherTask.id),
        false,
      );

      await updateVaultSettings(pool, { timezone: otherZone });
      const moved = await searchGraphNodes(pool, { type: "task", due: "today" });
      assert.equal(isToolError(moved), false);
      if (isToolError(moved)) {
        return;
      }
      assert.ok(moved.nodes.some((node) => node.id === otherTask.id));
      assert.equal(
        moved.nodes.some((node) => node.id === nyTask.id),
        false,
      );

      const overdue = await searchGraphNodes(pool, { type: "task", due: "overdue" });
      assert.equal(isToolError(overdue), false);
      if (isToolError(overdue)) {
        return;
      }
      if (nyToday < otherToday) {
        assert.ok(overdue.nodes.some((node) => node.id === nyTask.id));
      }
      if (otherToday < nyToday) {
        assert.ok(overdue.nodes.some((node) => node.id === otherTask.id));
      }
    } finally {
      await pool.end();
    }
  },
);

test(
  "working_set reads timezone and default caps from the settings row",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("vault_settings_ws");
    try {
      const area = await created(pool, { type: "area", title: "Throwaway settings area" });
      const children: Node[] = [];
      for (const title of ["Alpha", "Bravo", "Charlie"]) {
        children.push(await created(pool, { type: "project", title: `Throwaway ${title}` }));
      }
      for (const child of children) {
        const linked = await linkGraphNodes(pool, {
          from_id: child.id,
          to_id: area.id,
          relation_type: "child_of",
          from_base_updated_at: child.updated_at,
          to_base_updated_at: area.updated_at,
        });
        assert.equal(isToolError(linked), false);
      }

      const first = await workingSetGraph(pool, { id: area.id, depth: 1 });
      assert.equal(isToolError(first), false);
      if (isToolError(first)) {
        return;
      }
      assert.deepEqual(first.walk.due_window, { days: 14, timezone: DUE_TIMEZONE });
      assert.equal(first.items.length, 3);

      const otherZone = zoneWhereTodayDiffers(DUE_TIMEZONE);
      await updateVaultSettings(pool, {
        timezone: otherZone,
        working_set_limit_default: 2,
        working_set_due_within_days: 7,
      });
      const moved = await workingSetGraph(pool, { id: area.id, depth: 1 });
      assert.equal(isToolError(moved), false);
      if (isToolError(moved)) {
        return;
      }
      assert.deepEqual(moved.walk.due_window, { days: 7, timezone: otherZone });
      assert.equal(moved.items.length, 2);
      assert.equal(moved.truncated, true);
    } finally {
      await pool.end();
    }
  },
);
