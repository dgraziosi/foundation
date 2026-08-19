import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchGraph, fetchOntology } from "../api";
import { GraphCanvas } from "../graph/GraphCanvas";
import { useShell } from "../shell/context";

export function GraphPage() {
  const { openDetail } = useShell();
  const [localGraph, setLocalGraph] = useState<{ focus: string; depth: number }>();
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const graph = useQuery({
    queryKey: ["graph", "page", localGraph?.focus, localGraph?.depth],
    queryFn: () => fetchGraph(localGraph ? { focus: localGraph.focus, depth: localGraph.depth } : {}),
  });

  return (
    <GraphCanvas
      className="h-[max(460px,calc(100dvh-3rem))] min-h-[460px]"
      nodes={graph.data?.nodes ?? []}
      edges={graph.data?.edges ?? []}
      types={ontology.data?.types}
      onSelect={(id) => {
        const node = graph.data?.nodes.find((item) => item.id === id);
        openDetail(id, node?.title);
      }}
      loading={graph.isLoading}
      error={graph.isError}
      onRetry={() => void graph.refetch()}
      localGraph={localGraph}
      onLocalGraph={setLocalGraph}
    />
  );
}
