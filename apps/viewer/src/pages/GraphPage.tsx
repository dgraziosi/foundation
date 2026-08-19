import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { fetchGraph, fetchOntology } from "../api";
import { GraphCanvas } from "../graph/GraphCanvas";
import type { ShellOutlet } from "../shell/context";

export function GraphPage() {
  const { selectedId, select } = useOutletContext<ShellOutlet>();
  const [type, setType] = useState("");
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const graph = useQuery({
    queryKey: ["graph", selectedId, type],
    queryFn: () => fetchGraph({ focus: selectedId, type: type || undefined }),
  });

  return (
    <GraphCanvas
      nodes={graph.data?.nodes ?? []}
      edges={graph.data?.edges ?? []}
      types={ontology.data?.types}
      selectedId={selectedId}
      onSelect={select}
      loading={graph.isLoading}
      error={graph.isError}
      onRetry={() => void graph.refetch()}
      typeFilter={type}
      onTypeFilter={setType}
    />
  );
}
