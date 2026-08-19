import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "lucide-react";
import { truncate } from "../format";
import { typeColors, typeIcon } from "../type-meta";

/** Type-mark glyph. Contract: Lucide 16, stroke 2. */
export const GRAPH_GLYPH_PX = 16;
/** Meta size. Do not drop type text below 12px. */
export const GRAPH_TYPE_PX = 12;
/** Label size. Title on the mark; the only size allowed under 12px. */
export const GRAPH_TITLE_PX = 11;

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
  opts: { scale: number; types?: ReadonlyArray<{ slug: string; label: string }> },
): { width: number; height: number; glyph: number; pad: number; gap: number; radius: number; typePx: number; titlePx: number } {
  const scale = Math.max(opts.scale, 0.01);
  const glyph = graphScreenFont(GRAPH_GLYPH_PX, scale);
  const typePx = graphScreenFont(GRAPH_TYPE_PX, scale);
  const titlePx = graphScreenFont(GRAPH_TITLE_PX, scale);
  const pad = graphScreenFont(5, scale);
  const gap = graphScreenFont(5, scale);
  const radius = graphScreenFont(8, scale);
  const slug = String(node.type ?? "");
  const tag = typeMarkLabel(slug, opts.types);
  const title = truncate(String(node.title ?? ""), 22);
  ctx.font = `400 ${typePx}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const tagW = ctx.measureText(tag).width;
  ctx.font = `500 ${titlePx}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const titleW = ctx.measureText(title).width;
  const innerW = Math.max(glyph + gap + tagW, titleW);
  return {
    width: pad * 2 + innerW,
    height: pad * 2 + glyph + gap + titlePx,
    glyph,
    pad,
    gap,
    radius,
    typePx,
    titlePx,
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
    slugs: string[];
    types?: ReadonlyArray<{ slug: string; label: string }>;
  },
): { width: number; height: number } {
  const box = measureGraphMark(ctx, node, opts);
  const { width, height, glyph, pad, gap, radius, typePx, titlePx } = box;
  const slug = String(node.type ?? "");
  const colors = typeColors(slug, opts.lane, opts.slugs);
  const tag = typeMarkLabel(slug, opts.types);
  const title = truncate(String(node.title ?? ""), 22);
  const scale = Math.max(opts.scale, 0.01);
  const x = (node.x ?? 0) - width / 2;
  const y = (node.y ?? 0) - height / 2;

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = colors.tint;
  ctx.fill();
  ctx.lineWidth = (opts.selected || opts.match ? 2 : 1) / scale;
  ctx.strokeStyle = opts.selected || opts.match ? opts.ink : colors.ink;
  ctx.stroke();

  drawLucideGlyph(ctx, typeIcon(slug), colors.ink, x + pad, y + pad, glyph);

  ctx.fillStyle = colors.ink;
  ctx.font = `400 ${typePx}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, x + pad + glyph + gap, y + pad + glyph / 2);

  ctx.fillStyle = opts.ink;
  ctx.font = `500 ${titlePx}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(title, x + pad, y + pad + glyph + gap);

  return { width, height };
}
