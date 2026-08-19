import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchOntology, fetchSearch } from "../api";
import { DueChip, TypeTag } from "../ui/Tags";
import { LoadError, Placeholders } from "../ui/States";

type Outlet = { selectedId?: string; select: (id: string) => void };

export function SearchPage() {
  const { selectedId, select } = useOutletContext<Outlet>();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [submitted, setSubmitted] = useState({
    q: params.get("q") ?? "",
    type: params.get("type") ?? "",
    status: params.get("status") ?? "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const search = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => fetchSearch(submitted),
  });

  function applyFilters(next: { q: string; type: string; status: string }) {
    setSubmitted(next);
    const url = new URLSearchParams();
    if (next.q) url.set("q", next.q);
    if (next.type) url.set("type", next.type);
    if (next.status) url.set("status", next.status);
    if (selectedId) url.set("node", selectedId);
    setParams(url, { replace: true });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    applyFilters({ q: q.trim(), type, status });
  }

  const searched = search.data?.searched ?? Boolean(submitted.q || submitted.type || submitted.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h1 className="text-title font-semibold">Search</h1>
      <form className="flex flex-wrap gap-2" onSubmit={onSubmit}>
        <Input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search the graph"
          className="min-w-[12rem] flex-1"
        />
        <Select
          value={type || "all"}
          onValueChange={(value) => {
            const nextType = value === "all" ? "" : value;
            setType(nextType);
            applyFilters({ q: q.trim(), type: nextType, status });
          }}
        >
          <SelectTrigger className="w-36">
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
        <Select
          value={status || "all"}
          onValueChange={(value) => {
            const nextStatus = value === "all" ? "" : value;
            setStatus(nextStatus);
            applyFilters({ q: q.trim(), type, status: nextStatus });
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </form>
      {search.isLoading ? <Placeholders /> : null}
      {search.isError ? <LoadError onRetry={() => void search.refetch()} /> : null}
      {search.data && !searched ? <p className="text-muted-foreground">Search the graph, or filter by type.</p> : null}
      {search.data?.error ? <p className="text-muted-foreground">{search.data.error}</p> : null}
      {search.data && searched && search.data.hits.length === 0 && !search.data.error ? (
        <p className="text-muted-foreground">No matching nodes.</p>
      ) : null}
      {search.data && search.data.hits.length > 0 ? (
        <div className="flex flex-col">
          {search.data.hits.map((hit) => (
            <Button
              type="button"
              variant="ghost"
              size="row"
              className={cn(
                "w-full justify-between rounded-none border-b border-border",
                selectedId === hit.id && "ring-1 ring-inset ring-primary",
              )}
              key={hit.id}
              onClick={() => select(hit.id)}
            >
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="break-words font-semibold">{hit.title}</span>
                <span className="break-words text-meta text-muted-foreground">{hit.snippet}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <TypeTag type={hit.type} />
                {hit.due ? <DueChip due={hit.due} /> : null}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
