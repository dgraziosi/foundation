import { useQuery } from "@tanstack/react-query";
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
    return <p className="quiet">No data fields.</p>;
  }
  return (
    <dl>
      {entries.map(([key, value]) => {
        const formatted = formatDataValue(value);
        return (
          <div className="data-row" key={key}>
            <dt>{key}</dt>
            <dd className={formatted.kind === "mono" ? "payload mono" : "payload prose"}>
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
        <div className="data-row">
          <dt>media type</dt>
          <dd>{blob?.media_type ?? node.payload.media_type}</dd>
        </div>
        <div className="data-row">
          <dt>size</dt>
          <dd>{blob ? String(blob.byte_size) : "—"}</dd>
        </div>
        <div className="data-row">
          <dt>sha256</dt>
          <dd className="mono">{blob?.sha256 ?? "—"}</dd>
        </div>
        {blobId ? (
          <p>
            <a href={`/view/blobs/${encodeURIComponent(blobId)}`} download>
              Fetch bytes
            </a>
          </p>
        ) : null}
      </div>
    );
  }
  return <p className="payload prose">{node.payload.body ?? ""}</p>;
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
    <aside className={`inspector${open ? " open" : ""}`}>
      <div className="article">
        <button type="button" className="text-btn sheet-close" onClick={onClose}>
          Close
        </button>
        {!selectedId ? <p className="quiet">Select a node.</p> : null}
        {selectedId && query.isLoading ? <Placeholders /> : null}
        {selectedId && query.isError && !notFound ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : null}
        {notFound ? (
          <>
            <h2>Not found</h2>
            <p className="quiet">Not found.</p>
          </>
        ) : null}
        {query.data ? (
          <>
            <header>
              <h2>{query.data.node.title}</h2>
              <div className="tags">
                <TypeTag type={query.data.node.type} />
                <StatusTag status={query.data.node.status} />
              </div>
            </header>
            {query.data.due ? <DueChip due={query.data.due} tone={query.data.due_tone ?? undefined} /> : null}
            <section>
              <h3>Data</h3>
              <DataBlock data={query.data.node.data} />
            </section>
            <section>
              <h3>Payload</h3>
              <PayloadBlock detail={query.data} />
            </section>
            <section>
              <h3>Neighbors</h3>
              {query.data.edges.length === 0 ? (
                <p className="quiet">No neighbors.</p>
              ) : (
                <div className="rows">
                  {query.data.edges.map((edge) => (
                    <button
                      type="button"
                      className="row"
                      key={edge.id}
                      onClick={() => onSelect(edge.neighbor.id)}
                    >
                      <span>
                        <span className="row-title">{edge.neighbor.title}</span>
                        <span className="row-meta">
                          {edge.relation_type} · {edge.direction}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {query.data.suggested_links.length > 0 ? (
              <section>
                <h3>Suggested links</h3>
                <p className="quiet">Proposals only. This window cannot create an edge.</p>
                <div className="rows">
                  {query.data.suggested_links.map((item) => (
                    <button
                      type="button"
                      className="row"
                      key={`${item.kind}-${item.target.id}`}
                      onClick={() => onSelect(item.target.id)}
                    >
                      <span>
                        <span className="row-title">{item.target.title}</span>
                        <span className="row-meta">
                          {item.kind} — {item.reason}
                        </span>
                      </span>
                      <TypeTag type={item.target.type} />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
