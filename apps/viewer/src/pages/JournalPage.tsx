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
  journalEntryDayTitle,
  journalPayloadBody,
  journalSaveCopy,
  journalSaveResultApplies,
  journalSaveWhenQuiet,
  journalWriteTitle,
  type JournalSaveStatus,
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
  const idRef = useRef(id);
  idRef.current = id;
  const baseRef = useRef(base);
  baseRef.current = base;

  useEffect(() => {
    const detail = node.data;
    if (!id || !detail || draftId === id) {
      return;
    }
    const nextTitle = detail.node.title;
    const nextBody = detail.node.payload.body ?? "";
    setTitle(nextTitle);
    setBody(nextBody);
    setBase(detail.node.updated_at ?? "");
    skip.current = { title: nextTitle, body: nextBody, base: detail.node.updated_at ?? "" };
    baseRef.current = detail.node.updated_at ?? "";
    setDraftId(id);
    saveGen.current += 1;
    settled.current = "quiet";
    setSaveStatus("quiet");
  }, [id, node.data, draftId]);

  const createdAt = seeded?.node.created_at ?? node.data?.node.created_at;
  const dayTitle = journalEntryDayTitle(createdAt);
  const written = journalWriteTitle(title, dayTitle);
  const saveCopy = journalSaveCopy(saveStatus, written.keepTitle);
  const draftRef = useRef({ title: written.title, body });
  draftRef.current = { title: written.title, body };

  function applyLanded(mine: number, saved: NodeDetail): boolean {
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

  async function refreshLists(journalId: string) {
    await queryClient.invalidateQueries({ queryKey: ["node", journalId] });
    await queryClient.invalidateQueries({ queryKey: ["journal-today-peek"] });
    await queryClient.invalidateQueries({ queryKey: ["recents"] });
  }

  useEffect(() => {
    if (!id || !base || draftId !== id) {
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
        let showSaved = false;
        try {
          saved = await saveJournal({
            id,
            title: written.title,
            body: journalPayloadBody(body),
            base_updated_at: baseRef.current,
          });
          showSaved = applyLanded(mine, saved);
        } catch (error) {
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
            } else if (error instanceof ApiError && error.status === 409) {
              setSaveStatus("clash");
            } else {
              setSaveStatus("failed");
            }
          }
          return;
        } finally {
          writesInFlight.current -= 1;
        }
        await refreshLists(id);
        if (!showSaved || !saved) {
          return;
        }
        if (title.trim()) {
          setTitle(saved.node.title);
        }
        setSaveStatus("saved");
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [id, title, body, base, draftId, written.title, queryClient]);

  async function reloadKeepDraft() {
    if (!id) {
      return;
    }
    const mine = ++saveGen.current;
    setSaveStatus("saving");
    writesInFlight.current += 1;
    let saved: NodeDetail | undefined;
    let showSaved = false;
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
      showSaved = applyLanded(mine, saved);
    } catch (error) {
      if (!journalSaveResultApplies(mine, saveGen.current)) {
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        setSaveStatus("clash");
        return;
      }
      setSaveStatus("failed");
      return;
    } finally {
      writesInFlight.current -= 1;
    }
    await refreshLists(id);
    if (!showSaved || !saved) {
      return;
    }
    if (title.trim()) {
      setTitle(saved.node.title);
    }
    setSaveStatus("saved");
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
        <Suspense fallback={<p className="journal-loading">Opening the page…</p>}>
          <LiveMarkdown
            key={id}
            value={shownBody}
            onChange={setBody}
            autofocus={shownBody.trim() === ""}
          />
        </Suspense>
      </div>
    </div>
  );
}
