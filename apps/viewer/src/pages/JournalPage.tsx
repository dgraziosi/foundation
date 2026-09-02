import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ApiError, fetchNode, saveJournal, type NodeDetail } from "../api";
import {
  isUuid,
  journalApplyLandedWrite,
  journalDayLabel,
  journalDraftQuiet,
  journalEditorMountKey,
  journalEntryDayTitle,
  journalLeaveKeepDraft,
  journalLeaveWrite,
  journalMayPaintSaved,
  journalPayloadBody,
  journalSaveCopy,
  journalSaveResultApplies,
  journalSaveWhenQuiet,
  journalShouldAdoptVault,
  journalShouldRetryDirty,
  journalWriteTitle,
  type JournalLeaveRecord,
  type JournalLeaveWrite,
  type JournalSaveStatus,
  type JournalSnapshot,
} from "../format";
import { LoadError, Placeholders, Quiet } from "../ui/States";

const LiveMarkdown = lazy(async () => {
  const { LiveMarkdown: Editor } = await import("../journal/LiveMarkdown");
  return { default: Editor };
});

export function JournalPage({ id: forcedId, initial }: { id?: string; initial?: NodeDetail } = {}) {
  const { id: routeId } = useParams();
  const id = forcedId ?? routeId;
  const queryClient = useQueryClient();
  const invalid = Boolean(id && !isUuid(id));
  const node = useQuery({
    queryKey: ["node", id],
    queryFn: () => fetchNode(id!),
    enabled: Boolean(id) && !invalid,
    retry: false,
    initialData: initial && id && initial.node.id === id ? initial : undefined,
  });
  const seeded = id && node.data && node.data.node.id === id ? node.data : undefined;
  const [title, setTitle] = useState(() => seeded?.node.title ?? "");
  const [body, setBody] = useState(() => seeded?.node.payload.body ?? "");
  const [base, setBase] = useState(() => seeded?.node.updated_at ?? "");
  const [draftId, setDraftId] = useState<string | null>(() => (seeded && id ? id : null));
  const [saveStatus, setSaveStatus] = useState<JournalSaveStatus>("quiet");
  const [kick, setKick] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const skip = useRef(
    seeded
      ? {
          title: seeded.node.title,
          body: seeded.node.payload.body ?? "",
          base: seeded.node.updated_at ?? "",
        }
      : { title: "", body: "", base: "" },
  );
  const saveGen = useRef(0);
  const settled = useRef<"quiet" | "saved">("quiet");
  const writesInFlight = useRef(0);
  const retriedKey = useRef<string | null>(null);
  const flushAfterWrite = useRef(false);
  const leavePending = useRef<{
    id: string;
    draft: { title: string; body: string };
    skip: JournalSnapshot;
    base: string;
  } | null>(null);
  const holdLeave = useRef(false);
  const idRef = useRef(id);
  idRef.current = id;
  const baseRef = useRef(base);
  baseRef.current = base;

  useEffect(() => {
    const detail = node.data;
    if (!id || !detail) {
      return;
    }
    const leave = queryClient.getQueryData<JournalLeaveRecord>(["journal-leave", id]);
    if (leave) {
      queryClient.removeQueries({ queryKey: ["journal-leave", id] });
      setTitle(leave.draft.title);
      setBody(leave.draft.body);
      setBase(leave.skip.base);
      skip.current = leave.skip;
      baseRef.current = leave.skip.base;
      setDraftId(id);
      setEditorKey((n) => n + 1);
      saveGen.current += 1;
      retriedKey.current = null;
      flushAfterWrite.current = false;
      settled.current = "quiet";
      holdLeave.current = true;
      setSaveStatus(leave.status);
      return;
    }
    const incoming = {
      title: detail.node.title,
      body: detail.node.payload.body ?? "",
      base: detail.node.updated_at ?? "",
    };
    if (draftId === id) {
      if (
        !journalShouldAdoptVault({
          draft: draftRef.current,
          skip: skip.current,
          incoming,
        })
      ) {
        return;
      }
      setEditorKey((n) => n + 1);
    } else {
      setEditorKey(0);
    }
    setTitle(incoming.title);
    setBody(incoming.body);
    setBase(incoming.base);
    skip.current = incoming;
    baseRef.current = incoming.base;
    setDraftId(id);
    saveGen.current += 1;
    retriedKey.current = null;
    flushAfterWrite.current = false;
    settled.current = draftId === id ? "saved" : "quiet";
    setSaveStatus(draftId === id ? "saved" : "quiet");
  }, [id, node.data, draftId, queryClient]);

  const createdAt = seeded?.node.created_at ?? node.data?.node.created_at;
  const dayTitle = journalEntryDayTitle(createdAt);
  const written = journalWriteTitle(title, dayTitle);
  const saveCopy = journalSaveCopy(saveStatus, written.keepTitle);
  const draftRef = useRef({ title: written.title, body });
  draftRef.current = { title: written.title, body };
  const titleRef = useRef(title);
  titleRef.current = title;

  function applyLanded(mine: number, saved: NodeDetail): boolean {
    rememberLanded(saved);
    if (leavePending.current?.id === saved.node.id) {
      const landed = {
        title: saved.node.title,
        body: saved.node.payload.body ?? "",
        base: saved.node.updated_at ?? "",
      };
      leavePending.current = {
        ...leavePending.current,
        skip: landed,
        base: landed.base,
      };
    }
    if (saved.node.id !== idRef.current) {
      return false;
    }
    const applied = journalApplyLandedWrite({
      generation: mine,
      current: saveGen.current,
      draft: draftRef.current,
      landed: {
        title: saved.node.title,
        body: saved.node.payload.body ?? "",
        base: saved.node.updated_at ?? "",
      },
    });
    skip.current = applied.skip;
    baseRef.current = applied.skip.base;
    setBase(applied.skip.base);
    settled.current = "saved";
    return applied.showSaved;
  }

  function rememberLanded(saved: NodeDetail) {
    queryClient.setQueryData(["node", saved.node.id], saved);
    const today = queryClient.getQueryData<NodeDetail>(["journal-today"]);
    if (today?.node.id === saved.node.id) {
      queryClient.setQueryData(["journal-today"], saved);
    }
    const peek = queryClient.getQueryData<{ node: NodeDetail["node"] | null }>(["journal-today-peek"]);
    if (peek?.node?.id === saved.node.id) {
      queryClient.setQueryData(["journal-today-peek"], { node: saved.node });
    }
  }

  function paintIfCurrent(saved: NodeDetail) {
    if (saved.node.id !== idRef.current) {
      return;
    }
    const landed = {
      title: saved.node.title,
      body: saved.node.payload.body ?? "",
    };
    if (!journalMayPaintSaved(draftRef.current, landed)) {
      return;
    }
    if (titleRef.current.trim()) {
      setTitle(saved.node.title);
    }
    setSaveStatus("saved");
  }

  function kickDirtyRetry(clash: boolean): boolean {
    const draft = draftRef.current;
    if (!journalShouldRetryDirty(draft, skip.current, clash)) {
      return false;
    }
    const key = `${draft.title}\n${journalPayloadBody(draft.body)}`;
    if (retriedKey.current === key) {
      return false;
    }
    retriedKey.current = key;
    setKick((n) => n + 1);
    return true;
  }

  function rememberLeaveDraft(
    journalId: string,
    draft: { title: string; body: string },
    skipSnap: JournalSnapshot,
    status: "clash" | "failed",
  ) {
    queryClient.setQueryData<JournalLeaveRecord>(["journal-leave", journalId], {
      draft,
      skip: skipSnap,
      status,
    });
  }

  function flushLeave(snap: {
    id: string;
    draft: { title: string; body: string };
    skip: JournalSnapshot;
    base: string;
  }) {
    const pending = journalLeaveWrite(snap);
    if (!pending) {
      return;
    }
    void writeLeave(pending, snap.draft, snap.skip);
  }

  function writeLeave(
    pending: JournalLeaveWrite,
    draft: { title: string; body: string },
    skipSnap: JournalSnapshot,
  ) {
    void saveJournal({
      id: pending.id,
      title: pending.title,
      body: pending.body,
      base_updated_at: pending.base,
    })
      .then((saved) => {
        rememberLanded(saved);
      })
      .catch((error) => {
        const clash = error instanceof ApiError && error.status === 409;
        rememberLeaveDraft(pending.id, draft, skipSnap, journalLeaveKeepDraft(clash));
      });
  }

  async function refreshLists(journalId: string) {
    await queryClient.invalidateQueries({ queryKey: ["node", journalId] });
    await queryClient.invalidateQueries({ queryKey: ["journal-today-peek"] });
    await queryClient.invalidateQueries({ queryKey: ["recents"] });
  }

  useEffect(() => {
    const journalId = id;
    return () => {
      if (!journalId) {
        return;
      }
      const snap = {
        id: journalId,
        draft: { ...draftRef.current },
        skip: { ...skip.current },
        base: baseRef.current,
      };
      if (writesInFlight.current > 0) {
        leavePending.current = snap;
        flushAfterWrite.current = true;
        return;
      }
      flushLeave(snap);
    };
  }, [id]);

  useEffect(() => {
    if (!id || !base || draftId !== id) {
      return;
    }
    if (saveStatus === "clash") {
      return;
    }
    if (holdLeave.current && saveStatus === "failed") {
      holdLeave.current = false;
      return;
    }
    const inFlight = writesInFlight.current > 0;
    if (journalDraftQuiet({ title: written.title, body }, { title: skip.current.title, body: skip.current.body })) {
      if (!inFlight) {
        saveGen.current += 1;
      }
      const next = journalSaveWhenQuiet({
        status: saveStatus,
        writeInFlight: inFlight,
        settled: settled.current,
      });
      if (next) {
        setSaveStatus(next);
      }
      return;
    }
    if (inFlight) {
      setSaveStatus("saving");
      return;
    }
    const mine = ++saveGen.current;
    setSaveStatus("saving");
    const handle = window.setTimeout(() => {
      void (async () => {
        writesInFlight.current += 1;
        let saved: NodeDetail | undefined;
        let clash = false;
        try {
          saved = await saveJournal({
            id,
            title: written.title,
            body: journalPayloadBody(body),
            base_updated_at: baseRef.current,
          });
          applyLanded(mine, saved);
          retriedKey.current = null;
          paintIfCurrent(saved);
        } catch (error) {
          clash = error instanceof ApiError && error.status === 409;
          if (journalSaveResultApplies(mine, saveGen.current)) {
            if (journalDraftQuiet(draftRef.current, { title: skip.current.title, body: skip.current.body })) {
              const next = journalSaveWhenQuiet({
                status: "saving",
                writeInFlight: writesInFlight.current > 1,
                settled: settled.current,
              });
              if (next) {
                setSaveStatus(next);
              }
            } else if (kickDirtyRetry(clash)) {
              setSaveStatus("saving");
            } else if (clash) {
              setSaveStatus("clash");
            } else {
              setSaveStatus("failed");
            }
          }
        } finally {
          writesInFlight.current -= 1;
          if (flushAfterWrite.current) {
            flushAfterWrite.current = false;
            const pending = leavePending.current;
            leavePending.current = null;
            if (pending) {
              flushLeave(pending);
            }
          }
        }
        if (saved) {
          void refreshLists(id);
        }
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [id, title, body, base, draftId, written.title, queryClient, kick]);

  async function reloadKeepDraft() {
    if (!id) {
      return;
    }
    const mine = ++saveGen.current;
    setSaveStatus("saving");
    writesInFlight.current += 1;
    let saved: NodeDetail | undefined;
    let clash = false;
    try {
      const latest = await fetchNode(id);
      if (!journalSaveResultApplies(mine, saveGen.current)) {
        return;
      }
      saved = await saveJournal({
        id,
        title: written.title,
        body: journalPayloadBody(body),
        base_updated_at: latest.node.updated_at ?? "",
      });
      applyLanded(mine, saved);
      retriedKey.current = null;
      paintIfCurrent(saved);
    } catch (error) {
      clash = error instanceof ApiError && error.status === 409;
      if (!journalSaveResultApplies(mine, saveGen.current)) {
        return;
      }
      if (kickDirtyRetry(clash)) {
        setSaveStatus("saving");
        return;
      }
      if (clash) {
        setSaveStatus("clash");
        return;
      }
      setSaveStatus("failed");
      return;
    } finally {
      writesInFlight.current -= 1;
      if (flushAfterWrite.current) {
        flushAfterWrite.current = false;
        const pending = leavePending.current;
        leavePending.current = null;
        if (pending) {
          flushLeave(pending);
        }
      }
    }
    if (saved) {
      void refreshLists(id);
    }
  }

  if (!id || invalid) {
    return (
      <div className="p-lg">
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isLoading && !seeded) {
    return <Placeholders />;
  }
  if (node.isError) {
    return <LoadError onRetry={() => void node.refetch()} />;
  }
  const detail = node.data;
  if (!detail) {
    return <Quiet>Not found.</Quiet>;
  }
  if (draftId !== id && !seeded) {
    return <Placeholders />;
  }

  const shownTitle = draftId === id ? title : detail.node.title;
  const shownBody = draftId === id ? body : (detail.node.payload.body ?? "");

  return (
    <div className="journal-page" data-surface="journal-page">
      <div className="journal-page-column">
        <div className="journal-day">{journalDayLabel(detail.node.created_at)}</div>
        <input
          className="journal-title"
          value={shownTitle}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Title"
        />
        {saveCopy.keepTitle || saveCopy.status ? (
          <div className="journal-save" data-save={saveStatus}>
            {saveCopy.keepTitle ? <span>Keep a title</span> : null}
            {saveCopy.status ? <span>{saveCopy.status}</span> : null}
            {saveCopy.reload ? (
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => void reloadKeepDraft()}>Reload</Button>
            ) : null}
          </div>
        ) : null}
        {typeof document === "undefined" ? (
          <textarea
            data-editor="live-markdown"
            value={shownBody}
            onChange={(event) => setBody(event.target.value)}
          />
        ) : (
          <Suspense fallback={<p className="journal-loading">Opening the page…</p>}>
            <LiveMarkdown
              key={journalEditorMountKey(id, editorKey)}
              value={shownBody}
              onChange={setBody}
              autofocus={shownBody.trim() === ""}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
