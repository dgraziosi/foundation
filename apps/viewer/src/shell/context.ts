import { createContext, useContext } from "react";

export type ShellOutlet = {
  selectedId?: string;
  invalidPath: boolean;
  select: (id: string) => void;
  clear: () => void;
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
