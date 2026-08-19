import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchOntology, fetchSearch } from "../api";
import { parseSearchSnippet } from "../format";
import { useShell } from "../shell/context";
import { DueChip, TypeTag } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";

function SearchSnippet({ text }: { text: string }) {
  return (
    <>
      {parseSearchSnippet(text).map((part, index) =>
        part.hit ? <b key={index}>{part.text}</b> : part.text,
      )}
    </>
  );
}

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { openDetail } = useShell();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [submitted, setSubmitted] = useState({ q: "", type: "", status: "" });
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
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    applyFilters({ q: q.trim(), type, status });
  }

  const searched = search.data?.searched ?? Boolean(submitted.q || submitted.type || submitted.status);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-elevated" data-surface="search-overlay">
      <div className="flex items-center justify-between px-lg pt-md">
        <h1 className="text-display-m">Search</h1>
        <Button type="button" variant="link" className="h-auto p-0" onClick={onClose}>
          Close
        </Button>
      </div>
      <ScrollArea className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-md p-lg">
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
          {search.data && !searched ? <Quiet>Search the graph, or filter by type.</Quiet> : null}
          {search.data?.error ? <Quiet>{search.data.error}</Quiet> : null}
          {search.data && searched && search.data.hits.length === 0 && !search.data.error ? (
            <Quiet>No matching nodes.</Quiet>
          ) : null}
          {search.data && search.data.hits.length > 0 ? (
            <div className="flex flex-col">
              {search.data.hits.map((hit) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="row"
                  className="w-full justify-between rounded-none border-b border-hairline"
                  key={hit.id}
                  onClick={() => openDetail(hit.id, hit.title)}
                >
                  <span className="flex min-w-0 flex-col items-start text-left">
                    <span className="break-words font-medium">{hit.title}</span>
                    <span className="break-words text-meta text-muted-foreground">
                      <SearchSnippet text={hit.snippet} />
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <TypeTag type={hit.type} types={ontology.data?.types} />
                    {hit.due ? <DueChip due={hit.due} /> : null}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
