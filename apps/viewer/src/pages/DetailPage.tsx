import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ApiError, fetchNode, fetchOntology, type NodeDetail } from "../api";
import { isUuid, relativeTime } from "../format";
import { MarkdownBody } from "../markdown";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { StatusTag } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
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

export function DetailPage() {
  const { id } = useParams();
  const { openDetail } = useShell();
  const lane = useThemeLane();
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
  const detail = node.data;
  if (!detail) {
    return <Quiet>Not found.</Quiet>;
  }
  const identity = detail.type ?? ontology.data?.types.find((type) => type.slug === detail.node.type);
  const Icon = typeIcon(identity);
  const colors = typeColors(identity, lane);
  const fields = detail.type?.fields ?? [];
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

  return (
    <div className="flex min-h-0 flex-1" data-surface="detail-page">
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex flex-col gap-lg p-lg">
          <h1 className="text-display-m">{detail.node.title}</h1>
          <DocumentBody detail={detail} />
          {showStructure ? (
            <section className="flex max-h-[50vh] flex-col gap-sm overflow-auto">
              <h2 className="text-label text-muted-foreground">Structure</h2>
              {ancestors.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-meta">
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
              <StatusTag status={detail.node.status} />
              {fields.map((field) => {
                const ref = detail.resolved_refs?.[field.name];
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
              })}
              <Separator />
              {[...byRelation.entries()].map(([relation, rows]) => (
                <div key={relation}>
                  <div className="text-label text-muted-foreground">{relation}</div>
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
                  <div className="flex flex-col">
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
