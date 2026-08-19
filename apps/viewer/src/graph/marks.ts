import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "lucide-react";
import { identityFor, typeIcon, typeColors, type TypeIdentity } from "../type-meta";

/** Type-mark glyph. Contract: Lucide 16, stroke 2. */
export const GRAPH_GLYPH_PX = 16;
/** Node diameter in screen px. Fill is the type color; glyph sits inside. */
export const GRAPH_NODE_PX = 28;

export function typeMarkLabel(
  slug: string,
  types?: ReadonlyArray<{ slug: string; label: string }>,
): string {
  const known = types?.find((type) => type.slug === slug)?.label?.trim();
  if (known) {
    return known;
  }
  return slug.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

/** Graph-space px so the painted size stays `screenPx` on screen. */
export function graphScreenFont(screenPx: number, scale: number): number {
  return screenPx / Math.max(scale, 0.01);
}

const glyphSvgCache = new Map<string, string>();

export function lucideGlyphSvg(Icon: LucideIcon, ink: string): string {
  const key = `${Icon.displayName ?? "icon"}:${ink}`;
  const hit = glyphSvgCache.get(key);
  if (hit) {
    return hit;
  }
  const svg = renderToStaticMarkup(
    createElement(Icon, { size: 24, color: ink, strokeWidth: 2 }),
  );
  glyphSvgCache.set(key, svg);
  return svg;
}

function attr(block: string, name: string): string {
  return block.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

export function drawLucideGlyph(
  ctx: CanvasRenderingContext2D,
  Icon: LucideIcon,
  ink: string,
  x: number,
  y: number,
  size: number,
): void {
  const svg = lucideGlyphSvg(Icon, ink);
  const scale = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const match of svg.matchAll(/<(path|circle|line|polyline|polygon|rect|ellipse)\b([^>]*)\/?>/g)) {
    const tag = match[1];
    const raw = match[2] ?? "";
    ctx.beginPath();
    if (tag === "path") {
      ctx.stroke(new Path2D(attr(raw, "d")));
      continue;
    }
    if (tag === "circle") {
      ctx.arc(Number(attr(raw, "cx")), Number(attr(raw, "cy")), Number(attr(raw, "r")), 0, Math.PI * 2);
    } else if (tag === "line") {
      ctx.moveTo(Number(attr(raw, "x1")), Number(attr(raw, "y1")));
      ctx.lineTo(Number(attr(raw, "x2")), Number(attr(raw, "y2")));
    } else if (tag === "polyline" || tag === "polygon") {
      const points = attr(raw, "points")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number));
      points.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (tag === "polygon") ctx.closePath();
    } else if (tag === "rect") {
      ctx.rect(Number(attr(raw, "x") || 0), Number(attr(raw, "y") || 0), Number(attr(raw, "width")), Number(attr(raw, "height")));
    } else if (tag === "ellipse") {
      ctx.ellipse(
        Number(attr(raw, "cx")),
        Number(attr(raw, "cy")),
        Number(attr(raw, "rx")),
        Number(attr(raw, "ry")),
        0,
        0,
        Math.PI * 2,
      );
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function measureGraphMark(
  ctx: CanvasRenderingContext2D,
  node: Record<string, unknown> & { x?: number; y?: number },
  opts: { scale: number },
): { width: number; height: number; radius: number; glyph: number } {
  const scale = Math.max(opts.scale, 0.01);
  const diameter = graphScreenFont(GRAPH_NODE_PX, scale);
  return {
    width: diameter,
    height: diameter,
    radius: diameter / 2,
    glyph: graphScreenFont(GRAPH_GLYPH_PX, scale),
  };
}

export function paintGraphMark(
  ctx: CanvasRenderingContext2D,
  node: Record<string, unknown> & { x?: number; y?: number },
  opts: {
    scale: number;
    selected: boolean;
    match: boolean;
    ink: string;
    lane: "light" | "dark";
    types?: ReadonlyArray<TypeIdentity & { slug: string; label?: string }>;
  },
): { width: number; height: number } {
  const box = measureGraphMark(ctx, node, opts);
  const slug = String(node.type ?? "");
  const identity = identityFor(slug, opts.types);
  const colors = typeColors(identity, opts.lane);
  const fill = colors.tint === "transparent" ? (opts.lane === "light" ? "#e5e5e5" : "#262626") : colors.tint;
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const scale = Math.max(opts.scale, 0.01);

  ctx.beginPath();
  ctx.arc(x, y, box.radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = (opts.selected || opts.match ? 2 : 1) / scale;
  ctx.strokeStyle = opts.selected || opts.match ? opts.ink : colors.ink;
  ctx.stroke();

  drawLucideGlyph(
    ctx,
    typeIcon(identity),
    colors.ink,
    x - box.glyph / 2,
    y - box.glyph / 2,
    box.glyph,
  );

  return { width: box.width, height: box.height };
}
