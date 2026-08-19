import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HostTab } from "./context";

export function ViewStrip({
  tabs,
  activeKey,
  onSelect,
  onClose,
}: {
  tabs: HostTab[];
  activeKey: string;
  onSelect: (tab: HostTab | { kind: "home" }) => void;
  onClose: (tab: HostTab) => void;
}) {
  return (
    <div
      className="flex min-h-row items-center gap-1 overflow-x-auto border-b border-hairline px-sm"
      data-surface="view-strip"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("rounded-md", activeKey === "home" && "bg-active")}
        onClick={() => onSelect({ kind: "home" })}
      >
        Home
      </Button>
      {tabs.map((tab) => {
        const key = tabKey(tab);
        return (
          <span key={key} className={cn("inline-flex items-center rounded-md", activeKey === key && "bg-active")}>
            <Button type="button" variant="ghost" size="sm" className="rounded-md" onClick={() => onSelect(tab)}>
              {tab.label}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Close ${tab.label}`}
              onClick={() => onClose(tab)}
            >
              <X size={12} strokeWidth={2} />
            </Button>
          </span>
        );
      })}
    </div>
  );
}

export function tabKey(tab: HostTab | { kind: "home" }): string {
  if (tab.kind === "home") {
    return "home";
  }
  if (tab.kind === "recents") {
    return "recents";
  }
  if (tab.kind === "collection") {
    return `type:${tab.slug}`;
  }
  return `node:${tab.id}`;
}
