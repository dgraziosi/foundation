import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TypeViewNode, ViewEngineId } from "../api";
import { GraphCanvas } from "../graph/GraphCanvas";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { DueChip, StatusTag, TypeTag } from "../ui/Tags";
import { Quiet } from "../ui/States";

const BOARD_COLUMNS: Array<{ status: TypeViewNode["status"]; label: string }> = [
  { status: "active", label: "Active" },
  { status: "completed", label: "Completed" },
  { status: "archived", label: "Archived" },
];

function NodeRow({
  node,
  selected,
  onSelect,
  meta,
}: {
  node: TypeViewNode;
  selected: boolean;
  onSelect: (id: string) => void;
  meta?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      className={cn(
        "w-full justify-between rounded-none border-b border-hairline",
        selected && "bg-active",
      )}
      onClick={() => onSelect(node.id)}
    >
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="break-words font-medium">{node.title}</span>
        {meta ? <span className="text-meta text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <TypeTag type={node.type} />
        {node.due ? <DueChip due={node.due} tone={node.due_tone} /> : null}
      </span>
    </Button>
  );
}

export function ListView({
  nodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (nodes.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <NodeRow key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function CardView({
  nodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  const lane = useThemeLane();
  if (nodes.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-3">
      {nodes.map((node) => {
        const Icon = typeIcon(node.type);
        const colors = typeColors(node.type, lane);
        return (
          <Button
            key={node.id}
            type="button"
            variant="outline"
            size="row"
            className={cn(
              "h-auto flex-col items-start gap-2 rounded-lg p-md",
              selectedId === node.id && "bg-active",
            )}
            onClick={() => onSelect(node.id)}
          >
            <span className="flex items-center gap-2" style={{ color: colors.ink }}>
              <Icon size={16} strokeWidth={2} />
              <span className="break-words text-left font-medium text-foreground">{node.title}</span>
            </span>
            <span className="flex flex-wrap gap-2">
              <StatusTag status={node.status} />
              {node.due ? <DueChip due={node.due} tone={node.due_tone} /> : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function TableView({
  nodes,
  selectedId,
  onSelect,
  empty,
  showDue,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
  showDue: boolean;
}) {
  if (nodes.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline text-label text-muted-foreground">
            <th className="px-2 py-2 font-medium">Title</th>
            <th className="px-2 py-2 font-medium">Status</th>
            {showDue ? <th className="px-2 py-2 font-medium">Due</th> : null}
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              className={cn("min-h-row cursor-pointer border-b border-hairline", selectedId === node.id && "bg-active")}
              onClick={() => onSelect(node.id)}
            >
              <td className="px-2 py-2 font-medium">{node.title}</td>
              <td className="px-2 py-2">
                <StatusTag status={node.status} />
              </td>
              {showDue ? (
                <td className="px-2 py-2">
                  {node.due ? <DueChip due={node.due} tone={node.due_tone} /> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BoardView({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid flex-1 grid-cols-1 items-start gap-md md:grid-cols-3" data-surface="board">
      {BOARD_COLUMNS.map((column) => {
        const cards = nodes.filter((node) => node.status === column.status);
        return (
          <Card className="flex min-h-48 flex-col" key={column.status}>
            <CardContent className="flex flex-col gap-2 p-md">
              <h3 className="text-label text-muted-foreground">{column.label}</h3>
              {column.status === "active" && cards.length === 0 ? <Quiet>No tasks yet.</Quiet> : null}
              {cards.map((node) => (
                <Button
                  type="button"
                  variant="outline"
                  size="row"
                  className={cn(
                    "w-full flex-col items-start gap-1 p-2 shadow-none",
                    selectedId === node.id && "bg-active",
                  )}
                  key={node.id}
                  onClick={() => onSelect(node.id)}
                >
                  <span className="break-words text-left font-medium">{node.title}</span>
                  {node.due ? <DueChip due={node.due} tone={node.due_tone} /> : null}
                  {node.parent_title ? (
                    <span className="text-meta text-muted-foreground">{node.parent_title}</span>
                  ) : null}
                </Button>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function monthGrid(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const weekday = (start.getDay() + 6) % 7;
  const first = new Date(start);
  first.setDate(1 - weekday);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function CalendarView({
  nodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  const dated = nodes.filter((node) => node.due);
  const days = useMemo(() => monthGrid(new Date()), []);
  const month = days[15]?.getMonth();
  if (dated.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return (
    <div className="grid grid-cols-7 gap-1">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
        <div key={label} className="px-1 text-label text-muted-foreground">
          {label}
        </div>
      ))}
      {days.map((day) => {
        const key = isoDay(day);
        const onDay = dated.filter((node) => node.due === key);
        return (
          <div
            key={key}
            className={cn(
              "min-h-16 rounded-md border border-hairline p-1",
              day.getMonth() !== month && "opacity-40",
            )}
          >
            <div className="text-meta text-muted-foreground">{day.getDate()}</div>
            {onDay.map((node) => (
              <Button
                key={node.id}
                type="button"
                variant="ghost"
                size="row"
                className={cn("w-full justify-start px-1 py-0.5 text-left text-meta", selectedId === node.id && "bg-active")}
                onClick={() => onSelect(node.id)}
              >
                {node.title}
              </Button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function TimelineView({
  nodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  const dated = [...nodes.filter((node) => node.due)].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  if (dated.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return (
    <div className="flex flex-col">
      {dated.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          selected={selectedId === node.id}
          onSelect={onSelect}
          meta={node.due}
        />
      ))}
    </div>
  );
}

export function OutlineView({
  nodes,
  childNodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: TypeViewNode[];
  childNodes: TypeViewNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  const byParent = new Map<string, TypeViewNode[]>();
  for (const node of [...nodes, ...childNodes]) {
    if (!node.parent_id) {
      continue;
    }
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const roots = nodes.filter((node) => !node.parent_id || !nodeIds.has(node.parent_id));

  function Tree({ items, depth }: { items: TypeViewNode[]; depth: number }) {
    return (
      <div>
        {items.map((node) => (
          <div key={node.id} style={{ paddingLeft: depth * 13 }}>
            <NodeRow node={node} selected={selectedId === node.id} onSelect={onSelect} />
            {byParent.get(node.id) ? <Tree items={byParent.get(node.id)!} depth={depth + 1} /> : null}
          </div>
        ))}
      </div>
    );
  }

  if (roots.length === 0) {
    return <Quiet>{empty}</Quiet>;
  }
  return <Tree items={roots} depth={0} />;
}

export function EngineView({
  view,
  nodes,
  childNodes,
  graphNodes,
  graphEdges,
  selectedId,
  onSelect,
  empty,
}: {
  view: ViewEngineId;
  nodes: TypeViewNode[];
  childNodes: TypeViewNode[];
  graphNodes?: Array<{ id: string; title: string; type: string; status: string }>;
  graphEdges?: Array<{ id: string; from: string; to: string; relation_type: string; kind: "hierarchy" | "associative" }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (view === "list") {
    return <ListView nodes={nodes} selectedId={selectedId} onSelect={onSelect} empty={empty} />;
  }
  if (view === "card") {
    return <CardView nodes={nodes} selectedId={selectedId} onSelect={onSelect} empty={empty} />;
  }
  if (view === "table") {
    return (
      <TableView
        nodes={nodes}
        selectedId={selectedId}
        onSelect={onSelect}
        empty={empty}
        showDue={nodes.some((node) => node.due)}
      />
    );
  }
  if (view === "board") {
    return <BoardView nodes={nodes} selectedId={selectedId} onSelect={onSelect} />;
  }
  if (view === "calendar") {
    return <CalendarView nodes={nodes} selectedId={selectedId} onSelect={onSelect} empty={empty} />;
  }
  if (view === "timeline") {
    return <TimelineView nodes={nodes} selectedId={selectedId} onSelect={onSelect} empty={empty} />;
  }
  if (view === "outline") {
    return (
      <OutlineView
        nodes={nodes}
        childNodes={childNodes}
        selectedId={selectedId}
        onSelect={onSelect}
        empty={empty}
      />
    );
  }
  return (
    <GraphCanvas
      nodes={graphNodes ?? nodes.map((node) => ({ id: node.id, title: node.title, type: node.type, status: node.status }))}
      edges={graphEdges ?? []}
      selectedId={selectedId}
      onSelect={onSelect}
      findEnabled={false}
    />
  );
}
