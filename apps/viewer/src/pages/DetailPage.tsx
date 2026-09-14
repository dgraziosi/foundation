import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiError, fetchNode, fetchOntology, moveNodeToTrash, saveNode, type NodeDetail, type TypeField } from "../api";
import {
  fieldInputValue,
  fieldSaveValue,
  isEditableTypeField,
  isUuid,
  journalSaveResultApplies,
  nodeDraftQuiet,
  nodeSaveCopy,
  relativeTime,
  type JournalSaveStatus,
  type NodeSaveDraft,
} from "../format";
import { openableUrl } from "../url";
import { MarkdownBody } from "../markdown";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { JournalPage } from "./JournalPage";

const STATUSES = ["active", "completed", "archived"] as const;

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function draftFromDetail(detail: NodeDetail, fields: TypeField[]): NodeSaveDraft {
  const data: Record<string, unknown> = {};
  for (const field of fields.filter(isEditableTypeField)) {
    data[field.name] = fieldSaveValue(field.kind, fieldInputValue(detail.node.data[field.name]));
  }
  return {
    title: detail.node.title,
    status: detail.node.status,
    data,
  };
}

function DocumentBody({ detail }: { detail: NodeDetail }) {
  const { node, blob } = detail;
  if (node.payload.storage === "blob") {
    const blobId = blob?.id ?? node.payload.blob_id ?? "";
    return (
      <div className="flex flex-col gap-sm text-meta">
        <div>{blob?.media_type ?? node.payload.media_type}</div>
        <div>{blob ? String(blob.byte_size) : "—"} bytes</div>
        <div className="break-all">{blob?.sha256 ?? "—"}</div>
        {blobId ? (
          <Button asChild variant="link" className="h-auto p-0">
            <a href={`/view/blobs/${encodeURIComponent(blobId)}`} download>
              Fetch bytes
            </a>
          </Button>
        ) : null}
      </div>
    );
  }
  const body = node.payload.body ?? "";
  if (node.payload.media_type === "text/markdown") {
    return <MarkdownBody source={body} />;
  }
  return <p className="m-0 whitespace-pre-wrap text-body leading-[1.625]">{body}</p>;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: TypeField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === "enum") {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger aria-label={field.display}>
          <SelectValue placeholder={field.display} />
        </SelectTrigger>
        <SelectContent>
          {(field.enum_values ?? []).map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      aria-label={field.display}
      type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openDetail, openTrash } = useShell();
  const lane = useThemeLane();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const invalid = Boolean(id && !isUuid(id));
  const node = useQuery({
    queryKey: ["node", id],
    queryFn: () => fetchNode(id!),
    enabled: Boolean(id) && !invalid,
    retry: false,
  });
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });

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
  if (node.error instanceof ApiError && node.error.status === 404) {
    return (
      <div className="p-lg">
        <h1 className="text-display-m">Not found</h1>
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isError) {
    return <LoadError onRetry={() => void node.refetch()} />;
  }
  if (node.data?.node.type === "journal" && node.data.node.payload.media_type === "text/markdown" && node.data.node.payload.storage === "inline") {
    return <JournalPage />;
  }
  const detail = node.data;
  if (!detail) {
    return <Quiet>Not found.</Quiet>;
  }
  return (
    <LiveDetail
      detail={detail}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      ontologyTypes={ontology.data?.types}
      ontologyRelations={ontology.data?.relations}
      openDetail={openDetail}
      openTrash={openTrash}
      navigate={navigate}
      lane={lane}
      queryClient={queryClient}
    />
  );
}

function LiveDetail({
  detail,
  collapsed,
  setCollapsed,
  ontologyTypes,
  ontologyRelations,
  openDetail,
  openTrash,
  navigate,
  lane,
  queryClient,
}: {
  detail: NodeDetail;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  ontologyTypes?: Array<{ slug: string; label: string }>;
  ontologyRelations?: Array<{ slug: string; target_types: string[] }>;
  openDetail: (id: string, label?: string) => void;
  openTrash: () => void;
  navigate: (path: string) => void;
  lane: "light" | "dark";
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const fields = detail.type?.fields ?? [];
  const editable = fields.filter(isEditableTypeField);
  const identity = detail.type ?? ontologyTypes?.find((type) => type.slug === detail.node.type);
  const Icon = typeIcon(identity);
  const colors = typeColors(identity, lane);
  const href = openableUrl(detail.node.data);
  const related = detail.related ?? detail.edges.map((edge) => ({
    relation_type: edge.relation_type,
    direction: edge.direction,
    neighbor: edge.neighbor,
  }));
  const byRelation = new Map<string, typeof related>();
  for (const row of related) {
    const list = byRelation.get(row.relation_type) ?? [];
    list.push(row);
    byRelation.set(row.relation_type, list);
  }
  const children = detail.children ?? [];
  const ancestors = detail.ancestors ?? [];
  const showStructure =
    children.length > 0 || ((detail.type?.parent_types?.length ?? 0) > 0 && ancestors.length > 0);

  const [title, setTitle] = useState(detail.node.title);
  const [status, setStatus] = useState(detail.node.status);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const field of editable) {
      next[field.name] = fieldInputValue(detail.node.data[field.name]);
    }
    return next;
  });
  const [base, setBase] = useState(detail.node.updated_at ?? "");
  const [saveStatus, setSaveStatus] = useState<JournalSaveStatus>("quiet");
  const [trashError, setTrashError] = useState<string | null>(null);
  const skip = useRef(draftFromDetail(detail, fields));
  const saveGen = useRef(0);
  const writesInFlight = useRef(0);
  const seededId = useRef(detail.node.id);
  const baseRef = useRef(base);
  baseRef.current = base;
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  useEffect(() => {
    const incoming = draftFromDetail(detail, detail.type?.fields ?? []);
    const switched = seededId.current !== detail.node.id;
    if (!switched) {
      if (saveStatusRef.current === "clash" || saveStatusRef.current === "saving") {
        return;
      }
      if (!nodeDraftQuiet(draftRef.current, skip.current)) {
        return;
      }
      if (nodeDraftQuiet(skip.current, incoming) && baseRef.current === (detail.node.updated_at ?? "")) {
        return;
      }
    }
    seededId.current = detail.node.id;
    setTitle(incoming.title);
    setStatus(incoming.status);
    const nextValues: Record<string, string> = {};
    for (const field of (detail.type?.fields ?? []).filter(isEditableTypeField)) {
      nextValues[field.name] = fieldInputValue(incoming.data[field.name]);
    }
    setValues(nextValues);
    setBase(detail.node.updated_at ?? "");
    baseRef.current = detail.node.updated_at ?? "";
    skip.current = incoming;
    setSaveStatus("quiet");
  }, [detail]);

  const keepTitle = title.trim() === "";
  const draft: NodeSaveDraft = {
    title: title.trim(),
    status,
    data: Object.fromEntries(
      editable.map((field) => [field.name, fieldSaveValue(field.kind, values[field.name] ?? "")]),
    ),
  };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveCopy = nodeSaveCopy(saveStatus, keepTitle);
  const dataKey = JSON.stringify(draft.data);

  useEffect(() => {
    if (!base || keepTitle || saveStatus === "clash") {
      return;
    }
    if (nodeDraftQuiet(draftRef.current, skip.current)) {
      if (writesInFlight.current === 0 && (saveStatus === "saving" || saveStatus === "failed")) {
        setSaveStatus("saved");
      }
      return;
    }
    if (writesInFlight.current > 0) {
      setSaveStatus("saving");
      return;
    }
    const mine = ++saveGen.current;
    setSaveStatus("saving");
    const handle = window.setTimeout(() => {
      void (async () => {
        writesInFlight.current += 1;
        try {
          const saved = await saveNode({
            id: detail.node.id,
            title: draftRef.current.title,
            status: draftRef.current.status,
            data: draftRef.current.data,
            base_updated_at: baseRef.current,
          });
          if (!journalSaveResultApplies(mine, saveGen.current)) {
            return;
          }
          const landed = draftFromDetail(saved, saved.type?.fields ?? []);
          skip.current = landed;
          setBase(saved.node.updated_at ?? "");
          baseRef.current = saved.node.updated_at ?? "";
          queryClient.setQueryData(["node", detail.node.id], saved);
          openDetail(detail.node.id, saved.node.title);
          void queryClient.invalidateQueries({ queryKey: ["recents"] });
          void queryClient.invalidateQueries({ queryKey: ["ontology"] });
          if (nodeDraftQuiet(draftRef.current, landed)) {
            setSaveStatus("saved");
          }
        } catch (error) {
          if (!journalSaveResultApplies(mine, saveGen.current)) {
            return;
          }
          if (error instanceof ApiError && error.status === 409) {
            setSaveStatus("clash");
            return;
          }
          setSaveStatus("failed");
        } finally {
          writesInFlight.current -= 1;
        }
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [base, title, status, dataKey, keepTitle, saveStatus, detail.node.id, openDetail, queryClient]);

  async function reloadKeepDraft() {
    const mine = ++saveGen.current;
    setSaveStatus("saving");
    try {
      const latest = await fetchNode(detail.node.id);
      const saved = await saveNode({
        id: detail.node.id,
        title: draftRef.current.title,
        status: draftRef.current.status,
        data: draftRef.current.data,
        base_updated_at: latest.node.updated_at ?? "",
      });
      if (!journalSaveResultApplies(mine, saveGen.current)) {
        return;
      }
      const landed = draftFromDetail(saved, fields);
      skip.current = landed;
      setBase(saved.node.updated_at ?? "");
      baseRef.current = saved.node.updated_at ?? "";
      queryClient.setQueryData(["node", detail.node.id], saved);
      openDetail(detail.node.id, saved.node.title);
      void queryClient.invalidateQueries({ queryKey: ["recents"] });
      setSaveStatus("saved");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSaveStatus("clash");
        return;
      }
      setSaveStatus("failed");
    }
  }

  async function trash() {
    setTrashError(null);
    try {
      await moveNodeToTrash({ id: detail.node.id, base_updated_at: baseRef.current });
      await queryClient.invalidateQueries({ queryKey: ["recents"] });
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
      await queryClient.invalidateQueries({ queryKey: ["ontology"] });
      queryClient.removeQueries({ queryKey: ["node", detail.node.id] });
      openTrash();
    } catch (error) {
      setTrashError(error instanceof ApiError ? error.message : "Couldn't move to trash.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1" data-surface="detail-page">
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex flex-col gap-lg p-lg">
          <Input
            className="h-auto border-0 bg-transparent px-0 text-display-m shadow-none focus-visible:ring-0"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Title"
          />
          {saveCopy.keepTitle || saveCopy.status ? (
            <div className="text-meta text-muted-foreground" data-save={saveStatus}>
              {saveCopy.keepTitle ? <span>Keep a title</span> : null}
              {saveCopy.status ? <span>{saveCopy.status}</span> : null}
              {saveCopy.reload ? (
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => void reloadKeepDraft()}>
                  Reload
                </Button>
              ) : null}
            </div>
          ) : null}
          <DocumentBody detail={detail} />
          {showStructure ? (
            <section className="flex max-h-[50vh] flex-col gap-sm overflow-auto">
              <h2 className="text-label text-muted-foreground">Structure</h2>
              {ancestors.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-meta" data-ancestors="root-to-parent">
                  {ancestors.map((item, index) => (
                    <span key={item.id} className="flex items-center gap-1">
                      {index > 0 ? <span className="text-muted-foreground">/</span> : null}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => openDetail(item.id, item.title)}
                      >
                        {item.title}
                      </Button>
                    </span>
                  ))}
                </div>
              ) : null}
              {children.map((child) => (
                <Button
                  key={child.id}
                  type="button"
                  variant="ghost"
                  size="row"
                  className="justify-start rounded-none border-b border-hairline"
                  onClick={() => openDetail(child.id, child.title)}
                >
                  {child.title}
                </Button>
              ))}
            </section>
          ) : null}
        </div>
      </ScrollArea>
      {collapsed ? (
        <div className="flex w-8 items-start border-l border-hairline p-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsed(false)}>
            Properties
          </Button>
        </div>
      ) : (
        <aside className="flex min-h-0 w-[min(20rem,40%)] min-w-[240px] flex-col border-l border-hairline">
          <div className="flex items-center justify-between px-md py-sm">
            <span className="text-label text-muted-foreground">Properties</span>
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => setCollapsed(true)}>
              Collapse
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-md p-md">
              <div className="flex items-center gap-2" style={{ color: colors.ink }}>
                <Icon size={16} strokeWidth={2} />
                <span className="font-medium text-foreground">{identity?.label ?? detail.node.type}</span>
              </div>
              {(detail.type?.parent_types?.length ?? 0) > 0 ? (
                <p className="m-0 text-meta text-muted-foreground" data-constraint="parent_types">
                  May hang under{" "}
                  {(detail.type?.parent_types ?? [])
                    .map((slug) => ontologyTypes?.find((type) => type.slug === slug)?.label ?? slug)
                    .join(", ")}
                </p>
              ) : null}
              <div>
                <div className="text-label text-muted-foreground">Status</div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fields.map((field) => {
                const ref = detail.resolved_refs?.[field.name];
                if (!isEditableTypeField(field)) {
                  const value = detail.node.data[field.name];
                  if (value === undefined && !ref) {
                    return null;
                  }
                  return (
                    <div key={field.name}>
                      <div className="text-label text-muted-foreground">{field.display}</div>
                      {ref ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => openDetail(ref.id, ref.title)}
                        >
                          {ref.title}
                        </Button>
                      ) : (
                        <div className="whitespace-pre-wrap text-meta">{formatValue(value)}</div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={field.name}>
                    <div className="text-label text-muted-foreground">{field.display}</div>
                    <FieldControl
                      field={field}
                      value={values[field.name] ?? ""}
                      onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    />
                  </div>
                );
              })}
              {href ? (
                <Button asChild variant="link" className="h-auto p-0">
                  <a href={href} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </Button>
              ) : null}
              <Separator />
              <Button type="button" variant="link" className="h-auto justify-start p-0" onClick={() => navigate(`/nodes/${detail.node.id}/activity`)}>
                Activity
              </Button>
              <Button type="button" variant="link" className="h-auto justify-start p-0" onClick={() => void trash()}>
                Move to trash
              </Button>
              {trashError ? <Quiet>{trashError}</Quiet> : null}
              <Separator />
              {[...byRelation.entries()].map(([relation, rows]) => (
                <div key={relation}>
                  <div className="text-label text-muted-foreground">{relation}</div>
                  {(() => {
                    const listed = ontologyRelations?.find((item) => item.slug === relation);
                    if (!listed?.target_types.length) {
                      return null;
                    }
                    return (
                      <div className="text-meta text-muted-foreground" data-constraint="target_types">
                        Targets{" "}
                        {listed.target_types
                          .map((slug) => ontologyTypes?.find((type) => type.slug === slug)?.label ?? slug)
                          .join(", ")}
                      </div>
                    );
                  })()}
                  {rows.map((row) => (
                    <Button
                      key={`${row.direction}-${row.neighbor.id}`}
                      type="button"
                      variant="ghost"
                      size="row"
                      className="w-full justify-between rounded-none"
                      onClick={() => openDetail(row.neighbor.id, row.neighbor.title)}
                    >
                      <span>{row.neighbor.title}</span>
                      <span className="text-meta text-muted-foreground">{row.direction}</span>
                    </Button>
                  ))}
                </div>
              ))}
              <div>
                <div className="text-label text-muted-foreground">Location</div>
                {ancestors.length === 0 ? (
                  <Quiet>Home</Quiet>
                ) : (
                  <div className="flex flex-col" data-ancestors="root-to-parent">
                    {ancestors.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="link"
                        className="h-auto justify-start p-0"
                        onClick={() => openDetail(item.id, item.title)}
                      >
                        {item.title}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-meta text-muted-foreground">
                <div>Created {detail.node.created_at ? relativeTime(detail.node.created_at) : "—"}</div>
                <div>Updated {detail.node.updated_at ? relativeTime(detail.node.updated_at) : "—"}</div>
              </div>
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
