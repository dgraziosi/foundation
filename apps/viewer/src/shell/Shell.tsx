import { Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SearchOverlay } from "../pages/SearchPage";
import { ShellContext, type HostTab, type ShellOutlet } from "./context";
import { Rail } from "./Rail";
import {
  hrefFor,
  pathTab,
  syncHostTabs,
  tabKey,
  upsertCollectionTab,
  upsertDetailTab,
  upsertRecentsTab,
} from "./tabs";
import { ViewStrip } from "./ViewStrip";

export function Shell() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tabs, setTabs] = useState<HostTab[]>([]);

  const pathname = location.pathname;
  const slug = params.slug;
  const nodeId = params.id;
  const current = useMemo(() => pathTab(pathname, { slug, id: nodeId }), [pathname, slug, nodeId]);
  const activeKey = tabKey(current);

  useEffect(() => {
    setTabs((existing) => syncHostTabs(existing, current));
  }, [current]);

  const openDetail = useCallback(
    (id: string, label = "Detail") => {
      setSearchOpen(false);
      setTabs((existing) => upsertDetailTab(existing, id, label));
      navigate(`/nodes/${id}`);
    },
    [navigate],
  );

  const labelCollection = useCallback((nextSlug: string, label: string) => {
    setTabs((existing) => upsertCollectionTab(existing, nextSlug, label));
  }, []);

  const openCollection = useCallback(
    (nextSlug: string, label?: string) => {
      setSearchOpen(false);
      setTabs((existing) => upsertCollectionTab(existing, nextSlug, label));
      navigate(`/types/${nextSlug}`);
    },
    [navigate],
  );

  const openRecents = useCallback(() => {
    setSearchOpen(false);
    setTabs((existing) => upsertRecentsTab(existing));
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
      labelCollection,
      openRecents,
      openSearch,
      railOpen,
      setRailOpen,
      railCollapsed,
      setRailCollapsed,
    }),
    [openDetail, openCollection, labelCollection, openRecents, openSearch, railOpen, railCollapsed],
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
