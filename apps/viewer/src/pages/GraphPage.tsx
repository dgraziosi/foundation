import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useOutletContext } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGraph, fetchOntology } from "../api";
import { truncate } from "../format";
import { readThemeTokens, subscribeGraphPaint, type ThemeTokens } from "../theme-core";
import { LoadError, Placeholders } from "../ui/States";

type Outlet = { selectedId?: string; select: (id: string) => void };

export function GraphPage() {
  const { selectedId, select } = useOutletContext<Outlet>();
  const [find, setFind] = useState("");
  const [type, setType] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
  const [paint, setPaint] = useState<ThemeTokens>(readThemeTokens);
  const [themeEpoch, setThemeEpoch] = useState(0);

  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const graph = useQuery({
    queryKey: ["graph", selectedId, type],
    queryFn: () => fetchGraph({ focus: selectedId, type: type || undefined }),
  });

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

  const { ink, bg, accent, card, ink2 } = paint;

  const data = useMemo(() => {
    const nodes = (graph.data?.nodes ?? []).map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      status: node.status,
    }));
    const links = (graph.data?.edges ?? []).map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      relation_type: edge.relation_type,
      kind: edge.kind,
    }));
    return { nodes, links };
  }, [graph.data]);

  const needle = find.trim().toLowerCase();
  const empty = graph.data !== undefined && data.nodes.length === 0;

  return (
    <div className="relative min-h-[280px] flex-1" ref={wrapRef} data-surface="graph">
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <Input
          type="search"
          placeholder="Find on canvas"
          value={find}
          onChange={(event) => setFind(event.target.value)}
          className="min-w-[10rem] bg-background"
        />
        <Select value={type || "all"} onValueChange={(value) => setType(value === "all" ? "" : value)}>
          <SelectTrigger className="w-36 bg-background">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            {(ontology.data?.types ?? []).map((item) => (
              <SelectItem key={item.slug} value={item.slug}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {graph.isLoading ? <Placeholders /> : null}
      {graph.isError ? <LoadError onRetry={() => void graph.refetch()} /> : null}
      {empty ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground">
          Search the graph, or wait for a node to land.
        </p>
      ) : null}
      {!graph.isLoading && !graph.isError && !empty ? (
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
          onNodeClick={(node) => select(String(node.id))}
          nodeCanvasObject={(node, ctx, scale) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const selected = node.id === selectedId;
            const match =
              needle !== "" &&
              `${String(node.title)} ${String(node.type)}`.toLowerCase().includes(needle);
            const radius = 7;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = card;
            ctx.fill();
            ctx.lineWidth = 1 / Math.max(scale, 0.6);
            ctx.strokeStyle = selected || match ? accent : ink;
            ctx.stroke();
            const label = truncate(String(node.title), 20);
            ctx.font = `${11 / Math.max(scale, 0.75)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = ink;
            ctx.fillText(label, x, y + radius + 2);
            ctx.font = `${9 / Math.max(scale, 0.75)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.fillStyle = ink2;
            ctx.fillText(String(node.type), x, y + radius + 13);
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, 10, 0, Math.PI * 2);
            ctx.fill();
          }}
        />
      ) : null}
    </div>
  );
}
