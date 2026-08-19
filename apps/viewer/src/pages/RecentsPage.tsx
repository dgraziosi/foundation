import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { fetchRecents } from "../api";
import { relativeTime } from "../format";
import { TypeTag } from "../ui/Tags";
import { LoadError, Placeholders } from "../ui/States";

type Outlet = { selectedId?: string; select: (id: string) => void };

export function RecentsPage() {
  const { selectedId, select } = useOutletContext<Outlet>();
  const recents = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });

  return (
    <div className="page">
      <h1>Recents</h1>
      {recents.isLoading ? <Placeholders /> : null}
      {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
      {recents.data && recents.data.rows.length === 0 ? <p className="quiet">Nothing yet.</p> : null}
      {recents.data && recents.data.rows.length > 0 ? (
        <div className="rows">
          {recents.data.rows.map((row) => (
            <button
              type="button"
              className={`row${selectedId === row.node_id ? " selected" : ""}`}
              key={row.id}
              onClick={() => {
                if (row.node_id) {
                  select(row.node_id);
                }
              }}
            >
              <span>
                <span className="row-title">{row.summary}</span>
                <span className="row-meta">{row.action}</span>
              </span>
              <span className="row-meta">
                {row.type ? <TypeTag type={row.type} /> : null}
                <span>{relativeTime(row.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
