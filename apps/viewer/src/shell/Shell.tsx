import { Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { isUuid } from "../format";
import { SearchOverlay } from "../pages/SearchPage";
import { ShellContext, type HostTab, type ShellOutlet } from "./context";
import { Rail } from "./Rail";
import { tabKey, ViewStrip } from "./ViewStrip";

type PinnedSurface = { kind: "home" } | { kind: "graph" };

function pathTab(pathname: string, params: { slug?: string; id?: string }): HostTab | PinnedSurface {
  if (pathname === "/graph" || pathname.startsWith("/graph/")) {
    return { kind: "graph" };
  }
  if (pathname === "/recents" || pathname.startsWith("/recents/")) {
    return { kind: "recents", label: "Recents" };
  }
  if (params.slug) {
    return { kind: "collection", slug: params.slug, label: params.slug };
  }
  if (params.id && isUuid(params.id)) {
    return { kind: "detail", id: params.id, label: "Detail" };
  }
  return { kind: "home" };
}

function hrefFor(tab: HostTab | PinnedSurface): string {
  if (tab.kind === "home") {
    return "/";
  }
  if (tab.kind === "graph") {
    return "/graph";
  }
  if (tab.kind === "recents") {
    return "/recents";
  }
  if (tab.kind === "collection") {
    return `/types/${tab.slug}`;
  }
  return `/nodes/${tab.id}`;
}

export function Shell() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tabs, setTabs] = useState<HostTab[]>([]);

  const current = pathTab(location.pathname, params);
  const activeKey = tabKey(current);

  useEffect(() => {
    if (current.kind === "home" || current.kind === "graph") {
      return;
    }
    setTabs((existing) => {
      const key = tabKey(current);
      const index = existing.findIndex((tab) => tabKey(tab) === key);
      if (index === -1) {
        return [...existing, current];
      }
      const next = [...existing];
      const prev = next[index]!;
      if (current.kind === "collection" && prev.kind === "collection") {
        next[index] = { ...prev, label: current.label || prev.label };
      }
      if (current.kind === "detail" && prev.kind === "detail" && current.label !== "Detail") {
        next[index] = { ...prev, label: current.label };
      }
      return next;
    });
  }, [current]);

  const openDetail = useCallback(
    (id: string, label = "Detail") => {
      setSearchOpen(false);
      setTabs((existing) => {
        const key = `node:${id}`;
        if (existing.some((tab) => tabKey(tab) === key)) {
          return existing.map((tab) =>
            tab.kind === "detail" && tab.id === id ? { ...tab, label: label === "Detail" ? tab.label : label } : tab,
          );
        }
        return [...existing, { kind: "detail", id, label }];
      });
      navigate(`/nodes/${id}`);
    },
    [navigate],
  );

  const openCollection = useCallback(
    (slug: string, label?: string) => {
      setSearchOpen(false);
      setTabs((existing) => {
        const key = `type:${slug}`;
        if (existing.some((tab) => tabKey(tab) === key)) {
          return existing.map((tab) =>
            tab.kind === "collection" && tab.slug === slug ? { ...tab, label: label ?? tab.label } : tab,
          );
        }
        return [...existing, { kind: "collection", slug, label: label ?? slug }];
      });
      navigate(`/types/${slug}`);
    },
    [navigate],
  );

  const openRecents = useCallback(() => {
    setSearchOpen(false);
    setTabs((existing) =>
      existing.some((tab) => tab.kind === "recents")
        ? existing
        : [...existing, { kind: "recents", label: "Recents" }],
    );
    navigate("/recents");
  }, [navigate]);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  function closeTab(tab: HostTab) {
    const key = tabKey(tab);
    const index = tabs.findIndex((item) => tabKey(item) === key);
    const remaining = tabs.filter((item) => tabKey(item) !== key);
    setTabs(remaining);
    if (activeKey !== key) {
      return;
    }
    const left = remaining[index - 1] ?? { kind: "home" as const };
    navigate(hrefFor(left));
  }

  const value = useMemo<ShellOutlet>(
    () => ({
      openDetail,
      openCollection,
      openRecents,
      openSearch,
      railOpen,
      setRailOpen,
      railCollapsed,
      setRailCollapsed,
    }),
    [openDetail, openCollection, openRecents, openSearch, railOpen, railCollapsed],
  );

  return (
    <ShellContext.Provider value={value}>
      <div className="flex min-h-dvh bg-canvas">
        <Rail />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-canvas">
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
          <ViewStrip
            tabs={tabs}
            activeKey={activeKey}
            onSelect={(tab) => navigate(hrefFor(tab))}
            onClose={closeTab}
          />
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet context={value} />
            {searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} /> : null}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
