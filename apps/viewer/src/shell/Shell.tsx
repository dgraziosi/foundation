import { Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isUuid } from "../format";
import { ShellContext } from "./context";
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
    if (location.pathname.startsWith("/nodes/")) {
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
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const open = Boolean(selectedId) || invalidPath;
  const value = useMemo(
    () => ({
      selectedId,
      invalidPath,
      select,
      clear,
      railOpen,
      setRailOpen,
      railCollapsed,
      setRailCollapsed,
    }),
    [selectedId, invalidPath, select, clear, railOpen, railCollapsed],
  );

  return (
    <ShellContext.Provider value={value}>
      <div className="flex min-h-dvh bg-canvas">
        <Rail />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-elevated">
          <div className="flex items-center px-md py-sm md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open rail"
              onClick={() => setRailOpen(true)}
            >
              <Menu size={16} strokeWidth={2} />
            </Button>
          </div>
          <div className={cn("flex min-h-0 min-w-0 flex-1")}>
            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <Outlet context={value} />
            </main>
            <Inspector
              selectedId={invalidPath ? "not-a-uuid" : selectedId}
              onSelect={select}
              onClose={clear}
              open={open}
            />
          </div>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
