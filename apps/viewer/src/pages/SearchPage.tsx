import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = { q: q.trim(), type, status };
    setSubmitted(next);
    const url = new URLSearchParams();
    if (next.q) url.set("q", next.q);
    if (next.type) url.set("type", next.type);
    if (next.status) url.set("status", next.status);
    if (selectedId) url.set("node", selectedId);
    setParams(url, { replace: true });
  }

  const searched = search.data?.searched ?? Boolean(submitted.q || submitted.type || submitted.status);

  return (
    <div className="page">
      <h1>Search</h1>
      <form className="controls" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="field"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search the graph"
        />
        <select
          className="field"
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            setType(nextType);
            setSubmitted({ q: q.trim(), type: nextType, status });
          }}
        >
          <option value="">Any</option>
          {(ontology.data?.types ?? []).map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={status}
          onChange={(event) => {
            const nextStatus = event.target.value;
            setStatus(nextStatus);
            setSubmitted({ q: q.trim(), type, status: nextStatus });
          }}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </form>
      {search.isLoading ? <Placeholders /> : null}
      {search.isError ? <LoadError onRetry={() => void search.refetch()} /> : null}
      {search.data && !searched ? (
        <p className="quiet">Search the graph, or filter by type.</p>
      ) : null}
      {search.data?.error ? <p className="quiet">{search.data.error}</p> : null}
      {search.data && searched && search.data.hits.length === 0 && !search.data.error ? (
        <p className="quiet">No matching nodes.</p>
      ) : null}
      {search.data && search.data.hits.length > 0 ? (
        <div className="rows">
          {search.data.hits.map((hit) => (
            <button
              type="button"
              className={`row${selectedId === hit.id ? " selected" : ""}`}
              key={hit.id}
              onClick={() => select(hit.id)}
            >
              <span>
                <span className="row-title">{hit.title}</span>
                <span className="row-meta">{hit.snippet}</span>
              </span>
              <span className="row-meta">
                <TypeTag type={hit.type} />
                {hit.due ? <DueChip due={hit.due} /> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
