import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, fetchNode, saveJournal } from "../api";
import { isUuid, journalDayLabel, journalDraftQuiet, journalPayloadBody } from "../format";
import { LoadError, Placeholders, Quiet } from "../ui/States";

const LiveMarkdown = lazy(async () => {
  const { LiveMarkdown: Editor } = await import("../journal/LiveMarkdown");
  return { default: Editor };
});

export function JournalPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const invalid = Boolean(id && !isUuid(id));
  const node = useQuery({
    queryKey: ["node", id],
    queryFn: () => fetchNode(id!),
    enabled: Boolean(id) && !invalid,
    retry: false,
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const skip = useRef({ title: "", body: "", base: "" });

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
  }, [id, node.data, draftId]);

  useEffect(() => {
    if (!id || !base || !title.trim()) {
      return;
    }
    if (journalDraftQuiet({ title, body }, skip.current)) {
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveJournal({
            id,
            title: title.trim(),
            body: journalPayloadBody(body),
            base_updated_at: base,
          });
          skip.current = {
            title: saved.node.title,
            body: saved.node.payload.body ?? "",
            base: saved.node.updated_at ?? "",
          };
          setBase(saved.node.updated_at ?? "");
          await queryClient.invalidateQueries({ queryKey: ["node", id] });
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            return;
          }
        }
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [id, title, body, base, queryClient]);

  if (!id || invalid) {
    return (
      <div className="p-lg">
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isLoading) {
    return <Placeholders />;
  }
  if (node.isError) {
    return <LoadError onRetry={() => void node.refetch()} />;
  }
  const detail = node.data;
  if (!detail) {
    return <Quiet>Not found.</Quiet>;
  }
  if (draftId !== id) {
    return <Placeholders />;
  }

  return (
    <div className="journal-page" data-surface="journal-page">
      <div className="journal-page-column">
        <div className="journal-day">{journalDayLabel(detail.node.created_at)}</div>
        <input
          className="journal-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Title"
        />
        <Suspense fallback={<p className="journal-loading">Opening the page…</p>}>
          <LiveMarkdown
            key={id}
            value={body}
            onChange={setBody}
            autofocus={body.trim() === ""}
          />
        </Suspense>
      </div>
    </div>
  );
}
