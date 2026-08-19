import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GraphEdge, GraphNode, OntologyType } from "../api";
import { typeColors, typeIcon } from "../type-meta";
import { readThemeTokens, subscribeGraphPaint, type ThemeTokens } from "../theme-core";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { GRAPH_FLOOR_PX, readGraphFrameSize } from "./frame";
import { measureGraphMark, paintGraphMark } from "./marks";

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
  legend = true,
  localGraph,
  onLocalGraph,
  className,
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
  legend?: boolean;
  localGraph?: { focus: string; depth: number };
  onLocalGraph?: (input: { focus: string; depth: number } | undefined) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: GRAPH_FLOOR_PX });
  const [paint, setPaint] = useState<ThemeTokens>(readThemeTokens);
  const [themeEpoch, setThemeEpoch] = useState(0);
  const [find, setFind] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const next = readGraphFrameSize(el);
      if (!next) {
        return;
      }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
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
  const legendTypes = useMemo(() => {
    const seen = new Set<string>();
    const out: OntologyType[] = [];
    for (const node of nodes) {
      if (seen.has(node.type)) {
        continue;
      }
      seen.add(node.type);
      const known = types?.find((type) => type.slug === node.type);
      out.push(known ?? { slug: node.type, label: node.type, views: [], count: 0 });
    }
    return out;
  }, [nodes, types]);

  return (
    <div
      className={cn("relative min-h-[460px] w-full shrink-0 bg-canvas", className)}
      ref={wrapRef}
      data-surface="graph"
      onClick={() => setMenu(undefined)}
    >
      {findEnabled ? (
        <div className="absolute left-md top-md z-10 flex gap-2">
          <Input
            type="search"
            placeholder="Find"
            value={find}
            onChange={(event) => setFind(event.target.value)}
            className="min-w-[10rem] bg-elevated"
          />
          {localGraph && onLocalGraph ? (
            <button
              type="button"
              className="rounded-md bg-elevated px-sm text-meta text-muted-foreground"
              onClick={() => onLocalGraph(undefined)}
            >
              Full graph
            </button>
          ) : null}
        </div>
      ) : null}
      {legend && legendTypes.length > 0 ? (
        <div className="absolute right-md top-md z-10 flex max-w-[14rem] flex-wrap justify-end gap-1">
          {legendTypes.map((type) => {
            const colors = typeColors(type, lane);
            const Icon = typeIcon(type);
            return (
              <span
                key={type.slug}
                className="inline-flex items-center gap-1 rounded-md bg-elevated px-1 py-0.5 text-meta"
                style={{ color: colors.ink }}
              >
                <Icon size={12} strokeWidth={2} />
                {type.label}
              </span>
            );
          })}
        </div>
      ) : null}
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          <Placeholders />
        </div>
      ) : null}
      {error && onRetry ? (
        <div className="absolute left-md top-24 z-10">
          <LoadError onRetry={onRetry} />
        </div>
      ) : null}
      {empty ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Quiet>Search the graph, or wait for a node to land.</Quiet>
        </div>
      ) : null}
      <ForceGraph2D
        key={themeEpoch}
        width={size.width}
        height={size.height}
        graphData={data}
        backgroundColor={bg}
        cooldownTicks={80}
        enableNodeDrag={false}
        nodeLabel={(node) => String(node.title)}
        linkColor={(link) => (link.kind === "hierarchy" ? ink : ink2)}
        linkWidth={(link) => (link.kind === "hierarchy" ? 1 : 0.6)}
        linkLineDash={(link) => (link.kind === "hierarchy" ? [] : [2, 2])}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node, event) => {
          event.stopPropagation();
          onSelect(String(node.id));
        }}
        onNodeRightClick={(node, event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({ id: String(node.id), x: event.offsetX, y: event.offsetY });
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const match = needle !== "" && String(node.title).toLowerCase().includes(needle);
          paintGraphMark(ctx, node, {
            scale: globalScale,
            selected: node.id === selectedId,
            match,
            ink,
            lane,
            types,
          });
        }}
        nodePointerAreaPaint={(node, color, ctx, globalScale) => {
          const box = measureGraphMark(ctx, node, { scale: globalScale });
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, box.radius, 0, Math.PI * 2);
          ctx.fill();
        }}
      />
      {menu && onLocalGraph ? (
        <div
          className="absolute z-20 min-w-32 rounded-md border border-hairline bg-elevated p-1 text-meta shadow-sm"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <div className="px-2 py-1 text-muted-foreground">Local graph</div>
          {[1, 2, 3, 4].map((depth) => (
            <button
              key={depth}
              type="button"
              className="block w-full rounded-md px-2 py-1 text-left hover:bg-active"
              onClick={() => {
                onLocalGraph({ focus: menu.id, depth });
                setMenu(undefined);
              }}
            >
              Depth {depth}
              {depth === 2 ? " (default)" : ""}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
