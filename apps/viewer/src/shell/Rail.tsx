import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "../theme";

const items = [
  { to: "/", label: "Graph", match: "graph" },
  { to: "/search", label: "Search", match: "search" },
  { to: "/recents", label: "Recents", match: "recents" },
  { to: "/tasks", label: "Tasks", match: "tasks" },
] as const;

const themes: ThemeChoice[] = ["paper", "dark", "system"];

function isActive(match: string, pathname: string): boolean {
  if (match === "graph") {
    return pathname === "/" || pathname.startsWith("/nodes/");
  }
  return pathname === `/${match}` || pathname.startsWith(`/${match}/`);
}

export function Rail() {
  const { choice, setChoice } = useTheme();
  const location = useLocation();
  return (
    <aside className="flex min-w-0 flex-col border-b border-border p-2 md:border-b-0 md:border-r md:p-3 max-md:flex-row max-md:items-center">
      <div className="hidden px-2 pb-3 text-meta text-muted-foreground md:block">Foundation</div>
      <nav className="flex flex-1 gap-0.5 max-md:flex-row md:flex-col">
        {items.map((item) => {
          const active = isActive(item.match, location.pathname);
          return (
            <Button
              key={item.to}
              asChild
              variant="ghost"
              className={cn(
                "h-9 justify-start rounded-md px-2",
                active && "bg-primary/10 text-foreground ring-1 ring-inset ring-primary",
              )}
            >
              <NavLink to={item.to}>
                <span className="max-md:sr-only">{item.label}</span>
                <span className="md:hidden">{item.label.slice(0, 1)}</span>
              </NavLink>
            </Button>
          );
        })}
      </nav>
      <div className="mt-auto p-1 max-md:mt-0 max-md:p-0">
        <ToggleGroup
          type="single"
          value={choice}
          onValueChange={(value) => {
            if (value === "paper" || value === "dark" || value === "system") {
              setChoice(value);
            }
          }}
          variant="outline"
          size="sm"
          aria-label="Theme"
          className="w-full"
        >
          {themes.map((theme) => (
            <ToggleGroupItem key={theme} value={theme} aria-label={theme}>
              {theme === "paper" ? "Paper" : theme === "dark" ? "Dark" : "System"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </aside>
  );
}
