import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet } from "@/components/ui/sheet";
import { ApiError, fetchNode, type NodeDetail } from "../api";
import { DueChip, StatusTag, TypeTag } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";

function formatDataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function DataBlock({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <Quiet>No data fields.</Quiet>;
  }
  return (
    <dl>
      {entries.map(([key, value]) => (
        <div className="grid min-h-row grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-hairline py-1.5" key={key}>
          <dt className="text-meta text-muted-foreground">{key}</dt>
          <dd className="m-0 break-words whitespace-pre-wrap text-meta">{formatDataValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PayloadBlock({ detail }: { detail: NodeDetail }) {
  const { node, blob } = detail;
  if (node.payload.storage === "blob") {
    const blobId = blob?.id ?? node.payload.blob_id ?? "";
    return (
      <div>
        <div className="grid min-h-row grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-hairline py-1.5">
          <dt className="text-meta text-muted-foreground">media type</dt>
          <dd className="text-meta">{blob?.media_type ?? node.payload.media_type}</dd>
        </div>
        <div className="grid min-h-row grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-hairline py-1.5">
          <dt className="text-meta text-muted-foreground">size</dt>
          <dd className="text-meta">{blob ? String(blob.byte_size) : "—"}</dd>
        </div>
        <div className="grid min-h-row grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 border-b border-hairline py-1.5">
          <dt className="text-meta text-muted-foreground">sha256</dt>
          <dd className="break-all text-meta">{blob?.sha256 ?? "—"}</dd>
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
  return (
    <p className="m-0 break-words whitespace-pre-wrap text-body leading-[1.625]">
      {node.payload.body ?? ""}
    </p>
  );
}

function InspectorBody({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: ["node", selectedId],
    queryFn: () => fetchNode(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <ScrollArea className="flex-1 px-lg pb-lg">
      <div className="flex flex-col gap-md">
        {!selectedId ? <Quiet>Select a node.</Quiet> : null}
        {selectedId && query.isLoading ? <Placeholders /> : null}
        {selectedId && query.isError && !notFound ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : null}
        {notFound ? (
          <>
            <h2 className="text-display-s">Not found</h2>
            <Quiet>Not found.</Quiet>
          </>
        ) : null}
        {query.data ? (
          <>
            <header className="flex flex-col gap-2">
              <h2 className="m-0 break-words text-display-s">{query.data.node.title}</h2>
              <div className="flex flex-wrap gap-2">
                <TypeTag type={query.data.node.type} />
                <StatusTag status={query.data.node.status} />
              </div>
            </header>
            {query.data.due ? <DueChip due={query.data.due} tone={query.data.due_tone ?? undefined} /> : null}
            <section>
              <h3 className="mb-2 text-label text-muted-foreground">Data</h3>
              <DataBlock data={query.data.node.data} />
            </section>
            <Separator />
            <section>
              <h3 className="mb-2 text-label text-muted-foreground">Payload</h3>
              <PayloadBlock detail={query.data} />
            </section>
            <Separator />
            <section>
              <h3 className="mb-2 text-label text-muted-foreground">Neighbors</h3>
              {query.data.edges.length === 0 ? (
                <Quiet>No neighbors.</Quiet>
              ) : (
                <div className="flex flex-col">
                  {query.data.edges.map((edge) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="row"
                      className="w-full justify-start rounded-none border-b border-hairline"
                      key={edge.id}
                      onClick={() => onSelect(edge.neighbor.id)}
                    >
                      <span className="flex min-w-0 flex-col items-start text-left">
                        <span className="break-words font-medium">{edge.neighbor.title}</span>
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
                  <h3 className="mb-2 text-label text-muted-foreground">Suggested links</h3>
                  <p className="text-muted-foreground">Proposals only. This window cannot create an edge.</p>
                  <div className="flex flex-col">
                    {query.data.suggested_links.map((item) => (
                      <Button
                        type="button"
                        variant="ghost"
                        size="row"
                        className="w-full justify-between rounded-none border-b border-hairline"
                        key={`${item.kind}-${item.target.id}`}
                        onClick={() => onSelect(item.target.id)}
                      >
                        <span className="flex min-w-0 flex-col items-start text-left">
                          <span className="break-words font-medium">{item.target.title}</span>
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
    </ScrollArea>
  );
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
  const body = <InspectorBody selectedId={selectedId} onSelect={onSelect} />;
  return (
    <>
      <aside className="hidden min-w-0 border-l border-hairline xl:flex xl:w-inspector xl:flex-col">
        <div className="px-lg pt-lg">{body}</div>
      </aside>
      <div className="xl:hidden">
        <Sheet open={open} onClose={onClose}>
          {body}
        </Sheet>
      </div>
    </>
  );
}
