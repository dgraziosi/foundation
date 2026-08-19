import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GraphEdge, GraphNode, OntologyType } from "../api";
import { readThemeTokens, subscribeGraphPaint, type ThemeTokens } from "../theme-core";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { measureGraphMark, paintGraphMark, typeMarkLabel } from "./marks";

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
  const scaleRef = useRef(1);
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
          nodeLabel={(node) =>
            `${String(node.title)} · ${typeMarkLabel(String(node.type), types)}`
          }
          linkColor={(link) => (link.kind === "hierarchy" ? ink : ink2)}
          linkWidth={(link) => (link.kind === "hierarchy" ? 1.6 : 1)}
          linkLineDash={(link) => (link.kind === "hierarchy" ? undefined : [3, 3])}
          onNodeClick={(node) => onSelect(String(node.id))}
          nodeCanvasObject={(node, ctx, scale) => {
            scaleRef.current = scale;
            const match =
              needle !== "" &&
              `${String(node.title)} ${typeMarkLabel(String(node.type), types)}`
                .toLowerCase()
                .includes(needle);
            paintGraphMark(ctx, node, {
              scale,
              selected: node.id === selectedId,
              match,
              ink,
              lane,
              slugs,
              types,
            });
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const box = measureGraphMark(ctx, node, { scale: scaleRef.current, types });
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(
              (node.x ?? 0) - box.width / 2,
              (node.y ?? 0) - box.height / 2,
              box.width,
              box.height,
              box.radius,
            );
            ctx.fill();
          }}
        />
      ) : null}
    </div>
  );
}
