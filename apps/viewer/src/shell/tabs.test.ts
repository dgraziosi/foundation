import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pathTab,
  syncHostTabs,
  upsertCollectionTab,
  upsertDetailTab,
} from "./tabs.js";

const noteId = "11111111-1111-4111-8111-111111111111";

test("opening a collection or detail does not loop setState", () => {
  const collection = pathTab("/types/task", { slug: "task" });
  const added = syncHostTabs([], collection);
  assert.equal(added.length, 1);
  const again = syncHostTabs(added, collection);
  assert.equal(again, added);

  const labeled = upsertCollectionTab(added, "task", "Task");
  assert.equal(labeled[0] && labeled[0].kind === "collection" ? labeled[0].label : "", "Task");
  const slugSync = syncHostTabs(labeled, collection);
  assert.equal(slugSync, labeled);
  const slugUpsert = upsertCollectionTab(labeled, "task", "task");
  assert.equal(slugUpsert, labeled);

  const opened = upsertDetailTab([], noteId, "Fixture note");
  const fromPath = pathTab(`/nodes/${noteId}`, { id: noteId });
  const synced = syncHostTabs(opened, fromPath);
  assert.equal(synced, opened);
  const placeholder = upsertDetailTab(opened, noteId, "Detail");
  assert.equal(placeholder, opened);
  const sameTitle = upsertDetailTab(opened, noteId, "Fixture note");
  assert.equal(sameTitle, opened);
});

test("collection tab titles stay the type label, not the raw slug", () => {
  const fromClick = upsertCollectionTab([], "task", "Task");
  assert.equal(fromClick[0] && fromClick[0].kind === "collection" ? fromClick[0].label : "", "Task");
  const fromPath = syncHostTabs(fromClick, pathTab("/types/task", { slug: "task" }));
  assert.equal(fromPath, fromClick);
  assert.equal(fromPath[0] && fromPath[0].kind === "collection" ? fromPath[0].label : "", "Task");
});
