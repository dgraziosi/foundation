import { NavLink, useLocation } from "react-router-dom";
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
    <aside className="rail">
      <div className="brand">Foundation</div>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={() => (isActive(item.match, location.pathname) ? "rail-link active" : "rail-link")}
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="rail-foot">
        <div className="theme-toggle" aria-label="Theme">
          {themes.map((theme) => (
            <button
              key={theme}
              type="button"
              className={choice === theme ? "active" : ""}
              onClick={() => setChoice(theme)}
            >
              {theme === "paper" ? "Paper" : theme === "dark" ? "Dark" : "System"}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
