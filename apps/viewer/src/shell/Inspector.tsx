import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ApiError, fetchNode, type NodeDetail } from "../api";
import { DueChip, StatusTag, TypeTag } from "../ui/Tags";
import { LoadError, Placeholders } from "../ui/States";

function formatDataValue(value: unknown): { kind: "text" | "mono"; text: string } {
  if (typeof value === "string") {
    return { kind: "text", text: value };
  }
  return { kind: "mono", text: JSON.stringify(value, null, 2) };
}

function DataBlock({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="text-muted-foreground">No data fields.</p>;
  }
  return (
    <dl>
      {entries.map(([key, value]) => {
        const formatted = formatDataValue(value);
        return (
          <div className="grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-border py-1.5" key={key}>
            <dt className="text-meta text-muted-foreground">{key}</dt>
            <dd
              className={cn(
                "m-0 break-words whitespace-pre-wrap",
                formatted.kind === "mono" ? "font-mono text-meta" : "",
              )}
            >
              {formatted.text}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PayloadBlock({ detail }: { detail: NodeDetail }) {
  const { node, blob } = detail;
  if (node.payload.storage === "blob") {
    const blobId = blob?.id ?? node.payload.blob_id ?? "";
    return (
      <div>
        <div className="grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-border py-1.5">
          <dt className="text-meta text-muted-foreground">media type</dt>
          <dd>{blob?.media_type ?? node.payload.media_type}</dd>
        </div>
        <div className="grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-border py-1.5">
          <dt className="text-meta text-muted-foreground">size</dt>
          <dd>{blob ? String(blob.byte_size) : "—"}</dd>
        </div>
        <div className="grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-border py-1.5">
          <dt className="text-meta text-muted-foreground">sha256</dt>
          <dd className="font-mono text-meta">{blob?.sha256 ?? "—"}</dd>
        </div>
        {blobId ? (
          <p className="pt-2">
            <Button asChild variant="link" className="h-auto p-0">
              <a href={`/view/blobs/${encodeURIComponent(blobId)}`} download>
                Fetch bytes
              </a>
            </Button>
          </p>
        ) : null}
      </div>
    );
  }
  return <p className="m-0 break-words whitespace-pre-wrap">{node.payload.body ?? ""}</p>;
}

export function Inspector({
  selectedId,
  onSelect,
  onClose,
  open,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  open: boolean;
}) {
  const query = useQuery({
    queryKey: ["node", selectedId],
    queryFn: () => fetchNode(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });

  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <aside
      className={cn(
        "min-w-0 overflow-auto border-border bg-background",
        "xl:static xl:block xl:border-l",
        "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[min(352px,100%)] max-xl:border-l",
        "max-md:w-full",
        open ? "max-xl:block" : "max-xl:hidden",
      )}
    >
      <div className="flex flex-col gap-4 p-4">
        <Button type="button" variant="link" className="mb-1 h-auto justify-start p-0 xl:hidden" onClick={onClose}>
          Close
        </Button>
        {!selectedId ? <p className="text-muted-foreground">Select a node.</p> : null}
        {selectedId && query.isLoading ? <Placeholders /> : null}
        {selectedId && query.isError && !notFound ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : null}
        {notFound ? (
          <>
            <h2 className="text-base font-semibold">Not found</h2>
            <p className="text-muted-foreground">Not found.</p>
          </>
        ) : null}
        {query.data ? (
          <>
            <header className="flex flex-col gap-2">
              <h2 className="m-0 break-words text-base font-semibold">{query.data.node.title}</h2>
              <div className="flex flex-wrap gap-2">
                <TypeTag type={query.data.node.type} />
                <StatusTag status={query.data.node.status} />
              </div>
            </header>
            {query.data.due ? <DueChip due={query.data.due} tone={query.data.due_tone ?? undefined} /> : null}
            <section>
              <h3 className="mb-2 text-body font-semibold">Data</h3>
              <DataBlock data={query.data.node.data} />
            </section>
            <Separator />
            <section>
              <h3 className="mb-2 text-body font-semibold">Payload</h3>
              <PayloadBlock detail={query.data} />
            </section>
            <Separator />
            <section>
              <h3 className="mb-2 text-body font-semibold">Neighbors</h3>
              {query.data.edges.length === 0 ? (
                <p className="text-muted-foreground">No neighbors.</p>
              ) : (
                <div className="flex flex-col">
                  {query.data.edges.map((edge) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-full justify-start rounded-none border-b border-border px-1"
                      key={edge.id}
                      onClick={() => onSelect(edge.neighbor.id)}
                    >
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="font-semibold">{edge.neighbor.title}</span>
                        <span className="text-meta text-muted-foreground">
                          {edge.relation_type} · {edge.direction}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </section>
            {query.data.suggested_links.length > 0 ? (
              <>
                <Separator />
                <section>
                  <h3 className="mb-2 text-body font-semibold">Suggested links</h3>
                  <p className="text-muted-foreground">Proposals only. This window cannot create an edge.</p>
                  <div className="flex flex-col">
                    {query.data.suggested_links.map((item) => (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-h-9 w-full justify-between rounded-none border-b border-border px-1 py-2"
                        key={`${item.kind}-${item.target.id}`}
                        onClick={() => onSelect(item.target.id)}
                      >
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="font-semibold">{item.target.title}</span>
                          <span className="text-meta text-muted-foreground">
                            {item.kind} — {item.reason}
                          </span>
                        </span>
                        <TypeTag type={item.target.type} />
                      </Button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
