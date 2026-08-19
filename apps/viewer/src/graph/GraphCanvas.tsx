import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GraphEdge, GraphNode, OntologyType } from "../api";
import { truncate } from "../format";
import { readThemeTokens, subscribeGraphPaint, type ThemeTokens } from "../theme-core";
import { typeColors } from "../type-meta";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function GraphCanvas({
  nodes,
  edges,
  types,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  findEnabled = true,
  typeFilter,
  onTypeFilter,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  types?: OntologyType[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  findEnabled?: boolean;
  typeFilter?: string;
  onTypeFilter?: (type: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
  const [paint, setPaint] = useState<ThemeTokens>(readThemeTokens);
  const [themeEpoch, setThemeEpoch] = useState(0);
  const [find, setFind] = useState("");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let first = true;
    return subscribeGraphPaint((tokens) => {
      setPaint(tokens);
      if (first) {
        first = false;
        return;
      }
      setThemeEpoch((epoch) => epoch + 1);
    });
  }, []);

  const { ink, bg, ink2 } = paint;
  const slugs = (types ?? []).map((type) => type.slug);
  const lane = paint.bg === "#fafafa" ? "light" : "dark";

  const data = useMemo(() => {
    return {
      nodes: nodes.map((node) => ({ ...node })),
      links: edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        relation_type: edge.relation_type,
        kind: edge.kind,
      })),
    };
  }, [nodes, edges]);

  const needle = find.trim().toLowerCase();
  const empty = !loading && !error && data.nodes.length === 0;

  return (
    <div className="relative min-h-[280px] flex-1" ref={wrapRef} data-surface="graph">
      {findEnabled ? (
        <div className="absolute left-md top-md z-10 flex gap-2">
          <Input
            type="search"
            placeholder="Find on canvas"
            value={find}
            onChange={(event) => setFind(event.target.value)}
            className="min-w-[10rem] bg-elevated"
          />
          {onTypeFilter ? (
            <Select
              value={typeFilter || "all"}
              onValueChange={(value) => onTypeFilter(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-36 bg-elevated">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                {(types ?? []).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
      {loading ? <Placeholders /> : null}
      {error && onRetry ? <LoadError onRetry={onRetry} /> : null}
      {empty ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Quiet>Search the graph, or wait for a node to land.</Quiet>
        </div>
      ) : null}
      {!loading && !error && !empty ? (
        <ForceGraph2D
          key={themeEpoch}
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor={bg}
          cooldownTicks={80}
          enableNodeDrag={false}
          nodeLabel={(node) => `${String(node.title)} · ${String(node.type)}`}
          linkColor={(link) => (link.kind === "hierarchy" ? ink : ink2)}
          linkWidth={(link) => (link.kind === "hierarchy" ? 1.6 : 1)}
          linkLineDash={(link) => (link.kind === "hierarchy" ? undefined : [3, 3])}
          onNodeClick={(node) => onSelect(String(node.id))}
          nodeCanvasObject={(node, ctx, scale) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const selected = node.id === selectedId;
            const match =
              needle !== "" &&
              `${String(node.title)} ${String(node.type)}`.toLowerCase().includes(needle);
            const colors = typeColors(String(node.type), lane, slugs);
            const radius = 8;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = colors.tint;
            ctx.fill();
            ctx.lineWidth = (selected || match ? 2 : 1) / Math.max(scale, 0.6);
            ctx.strokeStyle = selected || match ? ink : colors.ink;
            ctx.stroke();
            ctx.fillStyle = colors.ink;
            ctx.font = `${10 / Math.max(scale, 0.75)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(node.type).slice(0, 1).toUpperCase(), x, y);
            const label = truncate(String(node.title), 20);
            ctx.font = `${11 / Math.max(scale, 0.75)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.textBaseline = "top";
            ctx.fillStyle = ink;
            ctx.fillText(label, x, y + radius + 3);
            ctx.font = `${9 / Math.max(scale, 0.75)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.fillStyle = colors.ink;
            ctx.fillText(String(node.type), x, y + radius + 15);
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, 12, 0, Math.PI * 2);
            ctx.fill();
          }}
        />
      ) : null}
    </div>
  );
}
