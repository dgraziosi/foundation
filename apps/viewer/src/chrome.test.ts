import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

async function src(file: string): Promise<string> {
  return readFile(join(root, file), "utf8");
}

test("chrome is Home + Search; Search is an overlay; Recents is not a rail item", async () => {
  const rail = await src("shell/Rail.tsx");
  assert.match(rail, /Home/);
  assert.match(rail, /Search/);
  assert.match(rail, /openSearch/);
  assert.match(rail, /w-14/);
  assert.match(rail, /w-rail/);
  assert.doesNotMatch(rail, /Recents/);
  assert.doesNotMatch(rail, /Graph/);
  assert.doesNotMatch(rail, /Tasks/);
  assert.doesNotMatch(rail, /Today/);
  const app = await src("App.tsx");
  assert.match(app, /path="\/" element=\{<HomePage/);
  assert.match(app, /DetailPage/);
  assert.doesNotMatch(app, /path="\/graph"/);
  assert.doesNotMatch(app, /Inspector/);
  const shell = await src("shell/Shell.tsx");
  assert.match(shell, /ViewStrip/);
  assert.match(shell, /SearchOverlay/);
  assert.doesNotMatch(shell, /Inspector/);
});

test("Home is Recents, open tasks, and type folders — not the graph", async () => {
  const home = await src("pages/HomePage.tsx");
  assert.doesNotMatch(home, /GraphCanvas/);
  assert.doesNotMatch(home, /fetchGraph/);
  assert.doesNotMatch(home, /HOME_GRAPH_FRAME_CLASS/);
  assert.match(home, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(home, /100dvh-3rem/);
  assert.match(home, /View all/);
  assert.match(home, /HOME_WIDGET_LIMIT/);
  assert.match(home, /fetchRecents\(HOME_WIDGET_LIMIT\)/);
  assert.match(home, /fetchTasks\(HOME_WIDGET_LIMIT\)/);
  assert.match(home, /compareOpenTasks/);
  assert.match(home, /compareRecentRows/);
  assert.match(home, /openCollection\("task"/);
  assert.match(home, /type\.count > 0/);
  assert.match(home, /data-surface="home-today"/);
  assert.match(home, /Write today/);
  assert.match(home, /\/journal\/today/);
  assert.match(home, /peekTodayJournal/);
  assert.match(home, /journalHomeToday/);
  assert.doesNotMatch(home, /MCP|API key|nodes/);
  assert.match(home, /No open tasks/);
  assert.doesNotMatch(home, /status === "active"/);
  assert.doesNotMatch(home, /status !== "completed"/);
  assert.doesNotMatch(home, /Show completed|readShowCompleted|writeShowCompleted/);
  assert.doesNotMatch(home, /h-\[160px\]/);
  assert.doesNotMatch(home, /h-\[256px\]/);
  const format = await src("format.ts");
  assert.match(format, /HOME_WIDGET_LIMIT = 5/);
  const canvas = await src("graph/GraphCanvas.tsx");
  assert.match(canvas, /min-h-\[460px\]/);
  assert.doesNotMatch(canvas, /flex-1/);
  assert.match(canvas, /enableZoomInteraction=\{!passPageScroll\}/);
  assert.match(canvas, /enablePanInteraction=\{!passPageScroll\}/);
  assert.match(canvas, /passPageScroll \? "pointer-events-none"/);
  assert.match(canvas, /linkWidth=\{\(link\) => \(link\.kind === "hierarchy" \? 1 : 0\.6\)\}/);
  assert.match(canvas, /linkLineDash=\{\(link\) => \(link\.kind === "hierarchy" \? \[\] : \[2, 2\]\)\}/);
  assert.match(canvas, /onNodeRightClick/);
  assert.match(canvas, /Depth \{depth\}/);
  assert.match(canvas, /nodeLabel=\{\(node\) => String\(node\.title\)\}/);
  assert.match(canvas, /Nothing yet\./);
  assert.doesNotMatch(canvas, /Search the graph, or wait for a node to land/);
  const frame = await src("graph/frame.ts");
  assert.match(frame, /h-\[max\(460px,100%\)\] min-h-\[460px\] w-full shrink-0/);
  assert.match(frame, /GRAPH_FLOOR_PX = 460/);
});

test("journal page is a document; today is the start path", async () => {
  const journal = await src("pages/JournalPage.tsx");
  assert.match(journal, /data-surface="journal-page"/);
  assert.match(journal, /journal-day/);
  assert.match(journal, /journal-title/);
  assert.match(journal, /LiveMarkdown/);
  assert.match(journal, /saveJournal/);
  assert.match(journal, /journalDraftQuiet/);
  assert.match(journal, /draftId !== id/);
  assert.doesNotMatch(journal, /Properties/);
  assert.doesNotMatch(journal, /StatusTag/);
  const live = await src("journal/LiveMarkdown.tsx");
  assert.match(live, /Write a first sentence/);
  assert.match(live, /Crepe.Feature.BlockEdit/);
  assert.match(live, /Crepe.Feature.Placeholder/);
  assert.match(live, /if \(!ready\)/);
  assert.match(live, /if \(cancelled\)/);
  assert.match(live, /ready = true/);
  assert.doesNotMatch(live, /Crepe.Feature.AI]: true/);
  const today = await src("pages/TodayJournalPage.tsx");
  assert.match(today, /fetchTodayJournal/);
  assert.match(today, /JournalPage/);
  assert.doesNotMatch(today, /openDetail/);
  assert.doesNotMatch(today, /<Placeholders/);
  assert.match(journal, /journalSaveCopy/);
  assert.match(journal, /journalEntryDayTitle/);
  assert.match(journal, /journalSaveWhenQuiet/);
  assert.match(journal, /journalSaveResultApplies/);
  assert.match(journal, /journalApplyLandedWrite/);
  assert.match(journal, /journalMayPaintSaved/);
  assert.match(journal, /journalShouldRetryDirty/);
  assert.match(journal, /journalShouldAdoptVault/);
  assert.match(journal, /journalLeaveWrite/);
  assert.match(journal, /journalLeaveKeepDraft/);
  assert.match(journal, /journalShouldKeepLeave/);
  assert.match(journal, /leaveSkip: leave.skip, landedAt/);
  assert.match(journal, /leaveSkip: skipSnap, landedAt/);
  assert.match(journal, /leaveSnap/);
  assert.match(journal, /journal-leave/);
  assert.match(journal, /journal-landed/);
  assert.match(journal, /flushLeave/);
  assert.match(journal, /leavePending/);
  assert.match(journal, /holdLeave/);
  assert.match(journal, /saveStatus === "clash"/);
  assert.match(journal, /journalEditorMountKey/);
  assert.match(journal, /setEditorKey/);
  assert.doesNotMatch(journal, /<LiveMarkdown\s+key=\{id\}/);
  assert.match(journal, /paintIfCurrent\(saved\)/);
  assert.match(journal, /kickDirtyRetry\(clash\)/);
  assert.match(journal, /rememberLanded/);
  assert.match(journal, /setQueryData/);
  assert.match(journal, /writesInFlight/);
  assert.match(journal, /\}, \[id\]\);/);
  assert.doesNotMatch(journal, /flushDirty/);
  assert.doesNotMatch(journal, /writeInFlight: false/);
  assert.doesNotMatch(journal, /todayInNewYork/);
  assert.match(journal, /Keep a title/);
  assert.match(journal, />Reload</);
  assert.match(journal, /data-save=/);
  const saveCopy = await src("format.ts");
  assert.match(saveCopy, /Saving/);
  assert.match(saveCopy, /Saved/);
  assert.match(saveCopy, /Couldn't save/);
  assert.match(saveCopy, /landedAt\?: string/);
  assert.doesNotMatch(saveCopy, /incoming\.base > input\.leaveSkip\.base/);
  const typeView = await src("pages/TypeViewPage.tsx");
  assert.match(typeView, /slug === "journal"/);
  assert.match(typeView, /\/journal\/today/);
  const detail = await src("pages/DetailPage.tsx");
  assert.match(detail, /JournalPage/);
  const app = await src("App.tsx");
  assert.match(app, /path="\/journal\/today"/);
});

test("click from graph / Recents / collection / search opens a detail page", async () => {
  const home = await src("pages/HomePage.tsx");
  assert.match(home, /openDetail/);
  const recents = await src("pages/RecentsPage.tsx");
  assert.match(recents, /openDetail\(row\.id/);
  assert.doesNotMatch(recents, /limit=\{10\}|fetchRecents\(10\)|fetchRecents\(5\)|HOME_WIDGET_LIMIT/);
  const search = await src("pages/SearchPage.tsx");
  assert.match(search, /openDetail\(hit\.id/);
  assert.match(search, /data-surface="search-overlay"/);
  const typeView = await src("pages/TypeViewPage.tsx");
  assert.match(typeView, /openDetail\(id/);
  assert.match(typeView, /graph\.data\?\.nodes/);
  const detail = await src("pages/DetailPage.tsx");
  assert.match(detail, /data-surface="detail-page"/);
  assert.match(detail, /min-w-\[240px\]/);
  assert.doesNotMatch(detail, /Sheet/);
  assert.match(detail, /Properties/);
  assert.match(detail, /openDetail\(row\.neighbor\.id/);
  assert.match(detail, /ancestors\.map/);
  assert.match(detail, /data-ancestors="root-to-parent"/);
  assert.doesNotMatch(detail, /ancestors\.reverse/);
  assert.match(detail, /openableUrl/);
  assert.match(detail, />\s*Open\s*</);
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noreferrer"/);
});

test("tab sync does not loop setState; collection titles stay the type label", async () => {
  const shell = await src("shell/Shell.tsx");
  assert.match(shell, /useMemo\(\(\) => pathTab/);
  assert.match(shell, /syncHostTabs\(existing, current\)/);
  assert.match(shell, /\[pathname, slug, nodeId\]/);
  const tabs = await src("shell/tabs.ts");
  assert.match(tabs, /return existing/);
  assert.match(tabs, /nextLabel === slug && prev\.label !== slug/);
  const typeView = await src("pages/TypeViewPage.tsx");
  assert.match(typeView, /syncCollectionLabel\(slug, label\)/);
  assert.doesNotMatch(typeView, /openCollection\(slug, label\)/);
  assert.match(
    shell,
    /syncCollectionLabel = useCallback\(\(nextSlug: string, label: string\) => \{\s*setTabs\(\(existing\) => upsertCollectionTab\(existing, nextSlug, label\)\);\s*\}, \[\]\)/,
  );
});

test("type identity is read from the ontology with a quiet fallback", async () => {
  const meta = await src("type-meta.ts");
  assert.match(meta, /NEUTRAL_INK/);
  assert.match(meta, /GENERIC_MARK/);
  assert.doesNotMatch(meta, /SEED_TYPE_META/);
  assert.match(meta, /identity\?\.hue/);
  assert.match(meta, /identity\?\.glyph/);
  const home = await src("pages/HomePage.tsx");
  assert.match(home, /typeIcon\(type\)/);
  assert.match(home, /typeColors\(type/);
});

test("collection empty copy and board width", async () => {
  const views = await src("views/TypeViews.tsx");
  assert.match(views, /Nothing yet\./);
  assert.doesNotMatch(views, /No tasks yet/);
  assert.match(views, /resolveBindValue\(node, fields, groupBind\) === column/);
  assert.doesNotMatch(views, /node\.status === column/);
  assert.match(views, /if \(columns\.length === 0\) \{\s*return <Quiet>\{empty\}<\/Quiet>;/);
  assert.doesNotMatch(views, /if \(columns\.length === 0\) \{\s*return <Quiet>Nothing yet\.<\/Quiet>;/);
  assert.match(views, /<BoardView[\s\S]*empty=\{empty\}/);
  assert.match(views, /w-\[233px\]/);
  assert.match(views, /collection-preview/);
  const typeView = await src("pages/TypeViewPage.tsx");
  assert.match(
    typeView,
    /unfiltered === 0 \? "Nothing yet\." : queried\.length === 0 \? "Nothing matches your filters\." : "Nothing yet\."/,
  );
  assert.match(typeView, /Nothing yet\./);
  assert.match(typeView, /Nothing matches your filters\./);
  assert.match(typeView, /count = activeView \? queried.length/);
  assert.doesNotMatch(typeView, /const count = typeQuery.data\?\.nodes.length/);
});

test("Unlock copy is the vault key, not a staff door", async () => {
  const unlock = await src("pages/UnlockPage.tsx");
  assert.match(unlock, />Unlock\.</);
  assert.match(unlock, /Vault key/);
  assert.match(unlock, /That key did not unlock\./);
  assert.doesNotMatch(unlock, /MCP|API key|agent|nodes/i);
  const fallback = await src("../../server/src/view.ts");
  assert.match(fallback, /<h1>Unlock\.<\/h1>/);
  assert.match(fallback, /Vault key/);
  assert.match(fallback, /That key did not unlock\./);
  assert.match(fallback, /json\(\{ error: UNLOCK_REJECT \}\)/);
  assert.doesNotMatch(fallback, /Same key as MCP/);
  assert.doesNotMatch(fallback, /Unlock the vault window/);
  assert.doesNotMatch(fallback, /wantsJson\(req\)[\s\S]{0,120}API key required/);
});

test("chrome uses shadcn primitives, not homemade fields", async () => {
  const files = [
    "pages/UnlockPage.tsx",
    "graph/GraphCanvas.tsx",
    "pages/SearchPage.tsx",
    "pages/RecentsPage.tsx",
    "pages/HomePage.tsx",
    "pages/TypeViewPage.tsx",
    "pages/DetailPage.tsx",
    "shell/Rail.tsx",
    "ui/Tags.tsx",
    "ui/States.tsx",
    "views/TypeViews.tsx",
  ];
  for (const file of files) {
    const text = await src(file);
    assert.match(text, /@\/components\/ui\//, `${file} should import a shadcn primitive`);
    assert.doesNotMatch(text, /className="field"/, `${file} still has a homemade field`);
    assert.doesNotMatch(text, /<select[\s>]/, `${file} still has a raw select`);
  }
  const rail = await src("shell/Rail.tsx");
  assert.match(rail, /ToggleGroup/);
  const board = await src("views/TypeViews.tsx");
  assert.match(board, /from "@\/components\/ui\/card"/);
});

test("Search snippets render FTS highlights instead of raw <b> tags", async () => {
  const search = await src("pages/SearchPage.tsx");
  assert.match(search, /parseSearchSnippet/);
  assert.match(search, /<SearchSnippet text=\{hit\.snippet\} \/>/);
  assert.doesNotMatch(search, />\{hit\.snippet\}</);
});

test("type Select viewport can grow past the trigger height", async () => {
  const select = await src("components/ui/select.tsx");
  assert.doesNotMatch(select, /(?<!min-)h-\[var\(--radix-select-trigger-height\)\]/);
  assert.match(select, /min-h-\[var\(--radix-select-trigger-height\)\]/);
  assert.match(select, /max-h-96/);
});

test("shell uses canvas ground and a 224px rail", async () => {
  const config = await src("../tailwind.config.js");
  assert.match(config, /md:\s*"900px"/);
  assert.match(config, /xl:\s*"1280px"/);
  assert.match(config, /rail:\s*"14rem"/);
  const shell = await src("shell/Shell.tsx");
  assert.match(shell, /bg-canvas/);
  const rail = await src("shell/Rail.tsx");
  assert.match(rail, /max-md:fixed/);
});

test("inspector leftovers are gone", async () => {
  await assert.rejects(() => access(join(root, "components/ui/sheet.tsx")));
  const config = await src("../tailwind.config.js");
  assert.doesNotMatch(config, /inspector:/);
  const css = await src("styles.css");
  assert.doesNotMatch(css, /--radius-sheet/);
});

test("row chrome wraps titles without changing every Button", async () => {
  const button = await src("components/ui/button.tsx");
  assert.match(button, /whitespace-nowrap/);
  assert.match(button, /row:\s*"h-auto min-h-row whitespace-normal/);
  for (const file of ["pages/SearchPage.tsx", "pages/RecentsPage.tsx", "pages/HomePage.tsx", "views/TypeViews.tsx"]) {
    const text = await src(file);
    assert.match(text, /size="row"/, `${file} should use the row Button size`);
  }
});

test("Inter 400/500 only; no mono face and no weight 600", async () => {
  const main = await src("main.tsx");
  assert.match(main, /@fontsource\/inter\/400/);
  assert.match(main, /@fontsource\/inter\/500/);
  assert.doesNotMatch(main, /inter\/600/);
  assert.doesNotMatch(main, /ibm-plex-mono/);
  const css = await src("styles.css");
  assert.doesNotMatch(css, /--mono/);
});

test("graph canvas marks use Lucide glyph fill, not a first-letter circle", async () => {
  const canvas = await src("graph/GraphCanvas.tsx");
  const marks = await src("graph/marks.ts");
  assert.match(canvas, /paintGraphMark/);
  assert.match(marks, /typeIcon/);
  assert.match(marks, /GRAPH_GLYPH_PX = 16/);
  assert.doesNotMatch(`${canvas}\n${marks}`, /slice\(\s*0\s*,\s*1\s*\)/);
});

test("window writes journal only", async () => {
  const api = await src("api.ts");
  const posts = [...api.matchAll(/method:\s*"POST"/g)];
  assert.equal(posts.length, 2);
  assert.match(api, /\/view\/unlock/);
  assert.match(api, /\/view\/api\/journals\/today/);
  assert.match(api, /method:\s*"PATCH"/);
  assert.match(api, /saveJournal/);
  assert.doesNotMatch(api, /manage_type/);
});

test("no-views copy is honest and Home is the landing surface", async () => {
  const typeView = await src("pages/TypeViewPage.tsx");
  assert.match(typeView, /No views declared for this type/);
  assert.match(typeView, /resolveActiveView/);
  assert.match(typeView, /Show completed/);
  const views = await src("views/TypeViews.tsx");
  assert.match(views, /No date field on this type/);
  const app = await src("App.tsx");
  assert.match(app, /path="\/" element=\{<HomePage/);
  assert.doesNotMatch(app, /TasksPage/);
});
