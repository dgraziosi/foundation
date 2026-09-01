import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ApiError, fetchNode, saveJournal, type NodeDetail } from "../api";
import {
  isUuid,
  journalDayLabel,
  journalDayTitle,
  journalDraftQuiet,
  journalPayloadBody,
  journalSaveCopy,
  journalWriteTitle,
  todayInNewYork,
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
    setDraftId(id);
    setSaveStatus("quiet");
  }, [id, node.data, draftId]);

  const dayTitle = journalDayTitle(todayInNewYork());
  const written = journalWriteTitle(title, dayTitle);
  const saveCopy = journalSaveCopy(saveStatus, written.keepTitle);

  useEffect(() => {
    if (!id || !base || draftId !== id) {
      return;
    }
    if (journalDraftQuiet({ title: written.title, body }, { title: skip.current.title, body: skip.current.body })) {
      return;
    }
    setSaveStatus("saving");
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveJournal({
            id,
            title: written.title,
            body: journalPayloadBody(body),
            base_updated_at: base,
          });
          skip.current = {
            title: saved.node.title,
            body: saved.node.payload.body ?? "",
            base: saved.node.updated_at ?? "",
          };
          setBase(saved.node.updated_at ?? "");
          if (title.trim()) {
            setTitle(saved.node.title);
          }
          setSaveStatus("saved");
          await queryClient.invalidateQueries({ queryKey: ["node", id] });
          await queryClient.invalidateQueries({ queryKey: ["journal-today-peek"] });
          await queryClient.invalidateQueries({ queryKey: ["recents"] });
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            setSaveStatus("clash");
            return;
          }
          setSaveStatus("failed");
        }
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [id, title, body, base, draftId, written.title, queryClient]);

  async function reloadKeepDraft() {
    if (!id) {
      return;
    }
    try {
      const latest = await fetchNode(id);
      const nextBase = latest.node.updated_at ?? "";
      setBase(nextBase);
      skip.current = { ...skip.current, base: nextBase };
      setSaveStatus("saving");
      const saved = await saveJournal({
        id,
        title: written.title,
        body: journalPayloadBody(body),
        base_updated_at: nextBase,
      });
      skip.current = {
        title: saved.node.title,
        body: saved.node.payload.body ?? "",
        base: saved.node.updated_at ?? "",
      };
      setBase(saved.node.updated_at ?? "");
      if (title.trim()) {
        setTitle(saved.node.title);
      }
      setSaveStatus("saved");
      await queryClient.invalidateQueries({ queryKey: ["node", id] });
      await queryClient.invalidateQueries({ queryKey: ["journal-today-peek"] });
      await queryClient.invalidateQueries({ queryKey: ["recents"] });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSaveStatus("clash");
        return;
      }
      setSaveStatus("failed");
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
