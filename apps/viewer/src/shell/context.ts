import { createContext, useContext } from "react";

export type HostTab =
  | { kind: "recents"; label: string }
  | { kind: "collection"; slug: string; label: string }
  | { kind: "detail"; id: string; label: string };

export type ShellOutlet = {
  openDetail: (id: string, label?: string) => void;
  openCollection: (slug: string, label?: string) => void;
  openRecents: () => void;
  openSearch: () => void;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => void;
};

export const ShellContext = createContext<ShellOutlet | null>(null);

export function useShell(): ShellOutlet {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell requires Shell");
  }
  return value;
}
