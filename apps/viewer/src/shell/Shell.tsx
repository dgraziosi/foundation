import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isUuid } from "../format";
import { Inspector } from "./Inspector";
import { Rail } from "./Rail";

export function useSelectedNode() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromPath = params.id && isUuid(params.id) ? params.id : undefined;
  const fromQuery = search.get("node");
  const selectedId = fromPath ?? (fromQuery && isUuid(fromQuery) ? fromQuery : undefined);
  const invalidPath = Boolean(params.id && !isUuid(params.id));

  function select(id: string) {
    if (location.pathname === "/" || location.pathname.startsWith("/nodes/")) {
      navigate(`/nodes/${id}`);
      return;
    }
    const next = new URLSearchParams(search);
    next.set("node", id);
    setSearch(next, { replace: true });
  }

  function clear() {
    if (location.pathname.startsWith("/nodes/")) {
      navigate("/");
      return;
    }
    const next = new URLSearchParams(search);
    next.delete("node");
    setSearch(next, { replace: true });
  }

  return { selectedId, invalidPath, select, clear };
}

export function Shell() {
  const { selectedId, invalidPath, select, clear } = useSelectedNode();
  const open = Boolean(selectedId) || invalidPath;
  return (
    <div
      className={cn(
        "grid min-h-dvh bg-background",
        "grid-cols-1 grid-rows-[auto_minmax(0,1fr)]",
        "md:grid-cols-[180px_minmax(0,1fr)] md:grid-rows-none",
        "xl:grid-cols-[180px_minmax(0,1fr)_352px]",
      )}
    >
      <Rail />
      <main className="relative flex min-h-0 min-w-0 flex-col">
        <Outlet context={{ selectedId, invalidPath, select }} />
      </main>
      <Inspector
        selectedId={invalidPath ? "not-a-uuid" : selectedId}
        onSelect={select}
        onClose={clear}
        open={open}
      />
    </div>
  );
}
