import { Clock, House, Network, PanelLeft, Search } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "../theme";
import { useShell } from "./context";

const items = [
  { to: "/", label: "Home", match: "home", icon: House },
  { to: "/graph", label: "Graph", match: "graph", icon: Network },
  { to: "/search", label: "Search", match: "search", icon: Search },
  { to: "/recents", label: "Recents", match: "recents", icon: Clock },
] as const;

const themes: ThemeChoice[] = ["light", "dark", "system"];

function isActive(match: string, pathname: string): boolean {
  if (match === "home") {
    return pathname === "/";
  }
  if (match === "graph") {
    return pathname === "/graph" || pathname.startsWith("/graph/");
  }
  return pathname === `/${match}` || pathname.startsWith(`/${match}/`);
}

export function Rail() {
  const { choice, setChoice } = useTheme();
  const { railOpen, setRailOpen, railCollapsed, setRailCollapsed } = useShell();
  const location = useLocation();
  const collapsed = railCollapsed;

  return (
    <>
      {railOpen ? (
        <button
          type="button"
          aria-label="Close rail"
          className="fixed inset-0 z-30 bg-canvas/60 md:hidden"
          onClick={() => setRailOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "flex h-dvh flex-col bg-inset text-ink transition-[width,transform] duration-chrome ease-chrome",
          collapsed ? "w-14" : "w-rail",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-rail",
          railOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className={cn("flex items-center gap-xs px-sm py-md", collapsed && "md:justify-center")}>
          {collapsed ? null : (
            <div className="flex-1 text-meta text-muted-foreground">Foundation</div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 md:inline-flex"
            aria-label={collapsed ? "Expand rail" : "Collapse rail"}
            onClick={() => setRailCollapsed(!collapsed)}
          >
            <PanelLeft size={16} strokeWidth={2} />
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-sm">
          {items.map((item) => {
            const active = isActive(item.match, location.pathname);
            const Icon = item.icon;
            const link = (
              <Button
                key={item.to}
                asChild
                variant="ghost"
                className={cn(
                  "h-9 justify-start rounded-md px-2",
                  collapsed && "md:justify-center md:px-0",
                  active && "bg-active text-foreground",
                )}
              >
                <NavLink to={item.to} onClick={() => setRailOpen(false)}>
                  <Icon size={16} strokeWidth={2} />
                  <span className={cn(collapsed && "md:sr-only")}>{item.label}</span>
                </NavLink>
              </Button>
            );
            return collapsed ? (
              <Tooltip key={item.to} label={item.label}>
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>
        <div className="mt-auto p-sm">
          <ToggleGroup
            type="single"
            value={choice}
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system") {
                setChoice(value);
              }
            }}
            variant="outline"
            size="sm"
            aria-label="Theme"
            className={cn("w-full", collapsed && "md:hidden")}
          >
            {themes.map((theme) => (
              <ToggleGroupItem key={theme} value={theme} aria-label={theme}>
                {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </aside>
    </>
  );
}
