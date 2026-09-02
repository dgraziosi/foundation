import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dueTone,
  isUuid,
  journalDayLabel,
  journalApplyLandedWrite,
  journalDayTitle,
  journalDraftQuiet,
  journalEditorMountKey,
  journalEntryDayTitle,
  journalLeaveKeepDraft,
  journalLeaveWrite,
  journalShouldKeepLeave,
  journalMayPaintSaved,
  journalShouldAdoptVault,
  journalShouldRetryDirty,
  journalFirstSentence,
  journalHomeToday,
  journalPayloadBody,
  journalSaveCopy,
  journalSaveResultApplies,
  journalSaveWhenQuiet,
  journalWriteTitle,
  todayInNewYork,
  parseSearchSnippet,
  relativeTime,
  truncate,
  compareOpenTasks,
  compareRecentRows,
  HOME_WIDGET_LIMIT,
} from "./format";

test("journal day label and payload stay one markdown body", () => {
  assert.equal(journalDayLabel("2026-09-01T16:00:00.000Z"), "Tuesday, September 1, 2026");
  assert.equal(journalDayTitle("2026-09-01"), "September 1, 2026");
  assert.equal(journalPayloadBody("# Morning\n\nHi."), "# Morning\n\nHi.");
  assert.equal(
    journalPayloadBody("Hi.\n\n<br />\n\n## Light\n"),
    "Hi.\n\n## Light\n",
  );
});

test("Home Today stays visible at an empty body and shows the first sentence after a write", () => {
  assert.deepEqual(journalHomeToday("", "September 1, 2026"), {
    invite: "Write today",
    day: "September 1, 2026",
    prose: null,
  });
  assert.deepEqual(journalHomeToday(undefined, "September 1, 2026"), {
    invite: "Write today",
    day: "September 1, 2026",
    prose: null,
  });
  assert.deepEqual(journalHomeToday("First light.\n\nMore later.", "September 1, 2026"), {
    invite: "September 1, 2026",
    day: "September 1, 2026",
    prose: "First light.",
  });
  assert.equal(journalFirstSentence("# Morning\n\nHello."), "Morning");
});

test("empty title keeps the calendar day and save copy is visible", () => {
  assert.deepEqual(journalWriteTitle("  ", "September 1, 2026"), {
    title: "September 1, 2026",
    keepTitle: true,
  });
  assert.deepEqual(journalWriteTitle("Morning", "September 1, 2026"), {
    title: "Morning",
    keepTitle: false,
  });
  assert.deepEqual(journalSaveCopy("quiet", true), {
    status: null,
    reload: false,
    keepTitle: true,
  });
  assert.deepEqual(journalSaveCopy("saving", false), {
    status: "Saving",
    reload: false,
    keepTitle: false,
  });
  assert.deepEqual(journalSaveCopy("saved", false), {
    status: "Saved",
    reload: false,
    keepTitle: false,
  });
  assert.deepEqual(journalSaveCopy("clash", false), {
    status: "Couldn't save",
    reload: true,
    keepTitle: false,
  });
  assert.deepEqual(journalSaveCopy("failed", false), {
    status: "Couldn't save",
    reload: false,
    keepTitle: false,
  });
});

test("undoing a draft change inside debounce does not leave Saving stuck", () => {
  assert.equal(
    journalSaveWhenQuiet({ status: "saving", writeInFlight: false, settled: "quiet" }),
    "quiet",
  );
  assert.equal(
    journalSaveWhenQuiet({ status: "saving", writeInFlight: false, settled: "saved" }),
    "saved",
  );
  assert.equal(
    journalSaveWhenQuiet({ status: "saving", writeInFlight: true, settled: "saved" }),
    null,
  );
  assert.equal(
    journalSaveWhenQuiet({ status: "clash", writeInFlight: false, settled: "saved" }),
    "saved",
  );
  assert.equal(
    journalSaveWhenQuiet({ status: "failed", writeInFlight: false, settled: "quiet" }),
    "quiet",
  );
  assert.equal(
    journalSaveWhenQuiet({ status: "saved", writeInFlight: false, settled: "saved" }),
    null,
  );
});

test("blank title on a past journal uses that entry's day", () => {
  const past = "2026-08-19T16:00:00.000Z";
  const wall = new Date("2026-09-01T16:00:00.000Z");
  assert.equal(journalEntryDayTitle(past, wall), "August 19, 2026");
  assert.notEqual(journalEntryDayTitle(past, wall), journalDayTitle(todayInNewYork(wall)));
  assert.equal(journalEntryDayTitle(undefined, wall), journalDayTitle(todayInNewYork(wall)));
  assert.equal(journalEntryDayTitle("2026-09-01T16:00:00.000Z"), journalDayTitle(todayInNewYork(new Date("2026-09-01T16:00:00.000Z"))));
  assert.deepEqual(journalWriteTitle("  ", journalEntryDayTitle(past, wall)), {
    title: "August 19, 2026",
    keepTitle: true,
  });
});

test("a stale failed save cannot clobber a later Saved", () => {
  assert.equal(journalSaveResultApplies(1, 2), false);
  assert.equal(journalSaveResultApplies(2, 2), true);
  const later = "saved" as const;
  const incoming = journalSaveResultApplies(1, 2) ? "clash" : later;
  assert.equal(incoming, "saved");
});

test("pause then keep typing refreshes the base and does not show Saved", () => {
  const landed = journalApplyLandedWrite({
    generation: 1,
    current: 2,
    draft: { title: "Morning", body: "First light.\nKeep going." },
    landed: { title: "Morning", body: "First light.", base: "2026-09-01T12:00:01.000Z" },
  });
  assert.equal(landed.skip.base, "2026-09-01T12:00:01.000Z");
  assert.equal(landed.skip.body, "First light.");
  assert.equal(landed.showSaved, false);
});

test("undo after a write has started does not show Saved for the typed body", () => {
  const landed = journalApplyLandedWrite({
    generation: 1,
    current: 1,
    draft: { title: "Morning", body: "" },
    landed: { title: "Morning", body: "Typed and sent.", base: "2026-09-01T12:00:01.000Z" },
  });
  assert.equal(landed.skip.base, "2026-09-01T12:00:01.000Z");
  assert.equal(landed.showSaved, false);
  assert.equal(
    journalApplyLandedWrite({
      generation: 1,
      current: 1,
      draft: { title: "Morning", body: "Typed and sent." },
      landed: { title: "Morning", body: "Typed and sent.", base: "2026-09-01T12:00:01.000Z" },
    }).showSaved,
    true,
  );
});

test("quiet revert with a write still in flight does not settle to quiet", () => {
  assert.equal(
    journalSaveWhenQuiet({ status: "saving", writeInFlight: true, settled: "quiet" }),
    null,
  );
});

test("Saved is not painted after the draft has already changed", () => {
  const landed = { title: "Morning", body: "First light." };
  assert.equal(journalMayPaintSaved({ title: "Morning", body: "First light." }, landed), true);
  assert.equal(
    journalMayPaintSaved({ title: "Evening", body: "First light." }, landed),
    false,
  );
  assert.equal(
    journalMayPaintSaved({ title: "Morning", body: "First light.\nKeep going." }, landed),
    false,
  );
});

test("a failed write still retries a newer draft", () => {
  const skip = { title: "Morning", body: "First light." };
  const later = { title: "Morning", body: "First light.\nKeep going." };
  assert.equal(journalShouldRetryDirty(later, skip, false), true);
  assert.equal(journalShouldRetryDirty(later, skip, true), false);
  assert.equal(journalShouldRetryDirty(skip, skip, false), false);
});

test("reopen after leave flush adopts the vault body, not the stale cache", () => {
  const skip = { title: "Morning", body: "First light.", base: "2026-09-01T12:00:00.000Z" };
  const draft = { title: "Morning", body: "First light." };
  const flushed = {
    title: "Morning",
    body: "First light.\nKept on leave.",
    base: "2026-09-01T12:00:01.000Z",
  };
  assert.equal(journalShouldAdoptVault({ draft, skip, incoming: flushed }), true);
  assert.equal(
    journalShouldAdoptVault({
      draft: { title: "Morning", body: "First light.\nTyped after reopen." },
      skip,
      incoming: flushed,
    }),
    false,
  );
  assert.equal(journalShouldAdoptVault({ draft, skip: flushed, incoming: flushed }), false);
});

test("leave flush writes the journal we left when the draft is still dirty", () => {
  const draft = { title: "Morning", body: "Kept on leave." };
  const skip = { title: "Morning", body: "First light." };
  assert.deepEqual(
    journalLeaveWrite({ id: "a", draft, skip, base: "2026-09-01T12:00:00.000Z" }),
    {
      id: "a",
      title: "Morning",
      body: "Kept on leave.",
      base: "2026-09-01T12:00:00.000Z",
    },
  );
  assert.equal(
    journalLeaveWrite({
      id: "a",
      draft: skip,
      skip,
      base: "2026-09-01T12:00:00.000Z",
    }),
    null,
  );
  assert.equal(journalLeaveKeepDraft(true), "clash");
  assert.equal(journalLeaveKeepDraft(false), "failed");
});

test("a later landed write drops an older leave draft", () => {
  const leaveSkip = { title: "Morning", body: "Old leave.", base: "2026-09-01T12:00:00.000Z" };
  const later = { title: "Morning", body: "Newer save.", base: "2026-09-01T12:00:03.000Z" };
  assert.equal(journalShouldKeepLeave({ leaveSkip, incoming: later }), false);
  assert.equal(journalShouldKeepLeave({ leaveSkip, incoming: leaveSkip }), true);
});

test("the writing box remounts when an adopted vault snapshot replaces the draft", () => {
  assert.equal(journalEditorMountKey("a", 0), "a:0");
  assert.notEqual(journalEditorMountKey("a", 1), journalEditorMountKey("a", 0));
});

test("autosave stays quiet when only editor breaks differ from the stored body", () => {
  const raw = "Hi.\n\n<br />\n\n## Light\n";
  const stored = journalPayloadBody(raw);
  assert.equal(journalDraftQuiet({ title: "Morning", body: raw }, { title: "Morning", body: stored }), true);
  assert.equal(
    journalDraftQuiet({ title: "Morning", body: `${raw}\nMore.\n` }, { title: "Morning", body: stored }),
    false,
  );
});

test("dueTone: overdue, today, future", () => {
  assert.equal(dueTone("2026-08-01", "2026-08-19"), "overdue");
  assert.equal(dueTone("2026-08-19", "2026-08-19"), "today");
  assert.equal(dueTone("2026-08-20", "2026-08-19"), "future");
});

test("relativeTime uses compact units", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  assert.equal(relativeTime("2026-08-19T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-08-19T11:10:00Z", now), "50m");
  assert.equal(relativeTime("2026-08-19T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-08-17T12:00:00Z", now), "2d");
});

test("truncate and uuid helpers", () => {
  assert.equal(truncate("short"), "short");
  assert.equal(truncate("abcdefghijklmnopqrstuvwxyz", 8), "abcdefg…");
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("Home widget sort is due-urgency then recency, capped at 5", () => {
  assert.equal(HOME_WIDGET_LIMIT, 5);
  const tasks = [
    { title: "Undated" },
    { title: "Soon", due: "2026-08-28", due_tone: "future" as const },
    { title: "Overdue new", due: "2026-08-10", due_tone: "overdue" as const },
    { title: "Today", due: "2026-08-21", due_tone: "today" as const },
    { title: "Overdue old", due: "2026-08-01", due_tone: "overdue" as const },
  ];
  assert.deepEqual(
    [...tasks].sort(compareOpenTasks).map((task) => task.title),
    ["Overdue old", "Overdue new", "Today", "Soon", "Undated"],
  );
  const recents = [
    { title: "Older", updated_at: "2026-08-20T12:00:00.000Z" },
    { title: "B same time", updated_at: "2026-08-21T12:00:00.000Z" },
    { title: "A same time", updated_at: "2026-08-21T12:00:00.000Z" },
  ];
  assert.deepEqual(
    [...recents].sort(compareRecentRows).map((row) => row.title),
    ["A same time", "B same time", "Older"],
  );
});

test("parseSearchSnippet turns FTS <b> marks into emphasis parts", () => {
  assert.deepEqual(parseSearchSnippet("note about <b>sample</b> text"), [
    { text: "note about ", hit: false },
    { text: "sample", hit: true },
    { text: " text", hit: false },
  ]);
  assert.deepEqual(parseSearchSnippet("no marks here"), [{ text: "no marks here", hit: false }]);
  assert.deepEqual(parseSearchSnippet("see <b>one</b> and <b>two</b>"), [
    { text: "see ", hit: false },
    { text: "one", hit: true },
    { text: " and ", hit: false },
    { text: "two", hit: true },
  ]);
  assert.deepEqual(parseSearchSnippet("raw <b>open"), [{ text: "raw open", hit: false }]);
  assert.deepEqual(parseSearchSnippet("stray </b> close"), [{ text: "stray  close", hit: false }]);
});
