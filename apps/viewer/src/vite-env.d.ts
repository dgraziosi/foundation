/// <reference types="vite/client" />

declare module "react-force-graph-2d" {
  import type { ComponentType } from "react";

  type ForceGraph2DProps = {
    width?: number;
    height?: number;
    graphData?: { nodes: unknown[]; links: unknown[] };
    nodeId?: string;
    nodeLabel?: string | ((node: Record<string, unknown>) => string);
    linkLabel?: string | ((link: Record<string, unknown>) => string);
    linkColor?: string | ((link: Record<string, unknown>) => string);
    linkWidth?: number | ((link: Record<string, unknown>) => number);
    linkLineDash?: number[] | ((link: Record<string, unknown>) => number[] | undefined);
    linkDirectionalArrowLength?: number;
    linkDirectionalArrowRelPos?: number;
    backgroundColor?: string;
    cooldownTicks?: number;
    enableNodeDrag?: boolean;
    onNodeClick?: (node: Record<string, unknown>, event: MouseEvent) => void;
    onNodeRightClick?: (node: Record<string, unknown>, event: MouseEvent) => void;
    nodeCanvasObject?: (
      node: Record<string, unknown> & { x?: number; y?: number },
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => void;
    nodeCanvasObjectMode?: () => string;
    nodePointerAreaPaint?: (
      node: Record<string, unknown> & { x?: number; y?: number },
      color: string,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => void;
  };

  const ForceGraph2D: ComponentType<ForceGraph2DProps>;
  export default ForceGraph2D;
}
