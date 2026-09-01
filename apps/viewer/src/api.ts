export class AuthError extends Error {
  constructor(message = "API key required") {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function viewFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 401) {
    throw new AuthError();
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Could not load.");
  }
  return body;
}

export type ViewEngineId =
  | "list"
  | "card"
  | "table"
  | "board"
  | "calendar"
  | "timeline"
  | "outline"
  | "graph";

export type ViewBind = "title" | "status" | "date" | "start" | "end" | "subtitle" | "updated_at";

export type ViewDeclaration = {
  id: ViewEngineId;
  filter?: { clauses: Array<{ bind: ViewBind; op: "eq" | "in"; value: string | string[] }> };
  sort?: Array<{ bind: ViewBind; dir: "asc" | "desc" }>;
  group?: { bind: ViewBind };
};

export type TypeField = {
  name: string;
  display: string;
  kind: "string" | "date" | "number" | "enum" | "ref";
  needed: boolean;
  role?: "title" | "status" | "date" | "start" | "end" | "subtitle";
  enum_values?: string[];
  ref_type?: string;
};

export type OntologyType = {
  slug: string;
  label: string;
  views: ViewEngineId[];
  default_view?: ViewEngineId;
  count: number;
  hue?: string;
  glyph?: string;
};

export type TypeViewChip = { name: string; display: string; value: string };

export type TypeViewNode = {
  id: string;
  title: string;
  type: string;
  status: "active" | "completed" | "archived";
  due?: string;
  due_tone?: "overdue" | "today" | "future";
  parent_id?: string;
  parent_title?: string;
  chips?: TypeViewChip[];
  data?: Record<string, unknown>;
  updated_at?: string;
};

export type TypeView = {
  type: {
    slug: string;
    label: string;
    views: Array<ViewEngineId | ViewDeclaration>;
    default_view?: ViewEngineId;
    fields?: TypeField[];
    hue?: string;
    glyph?: string;
    parent_types?: string[];
  };
  nodes: TypeViewNode[];
  children: TypeViewNode[];
};
export type SearchHit = {
  id: string;
  type: string;
  title: string;
  status: string;
  snippet: string;
  due?: string;
};
export type GraphNode = { id: string; title: string; type: string; status: string };
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation_type: string;
  kind: "hierarchy" | "associative";
};
export type RecentRow = {
  id: string;
  title: string;
  type: string;
  updated_at: string;
};
export type TaskCard = {
  id: string;
  title: string;
  status: "active" | "completed" | "archived";
  due?: string;
  due_tone?: "overdue" | "today" | "future";
  parent_title?: string;
};
export type Neighbor = { id: string; title: string; type: string };
export type IncidentEdge = {
  id: string;
  relation_type: string;
  direction: "in" | "out";
  neighbor: Neighbor;
};
export type SuggestedLink = {
  kind: string;
  target: Neighbor;
  reason: string;
};
export type NodeDetail = {
  node: {
    id: string;
    title: string;
    type: string;
    status: string;
    data: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    payload: {
      media_type: string;
      storage: "inline" | "blob";
      body?: string;
      blob_id?: string;
    };
  };
  type?: {
    slug: string;
    label: string;
    fields: TypeField[];
    hue?: string;
    glyph?: string;
    parent_types?: string[];
  } | null;
  edges: IncidentEdge[];
  related?: Array<{ relation_type: string; direction: "in" | "out"; neighbor: Neighbor }>;
  ancestors?: Neighbor[];
  children?: TypeViewNode[];
  blob?: {
    id: string;
    media_type: string;
    byte_size: number;
    sha256: string;
  };
  suggested_links: SuggestedLink[];
  resolved_refs?: Record<string, { id: string; title: string; type: string }>;
  due: string | null;
  due_tone: "overdue" | "today" | "future" | null;
};

export function session() {
  return viewFetch<{ ok: true }>("/view/api/session");
}

export function unlock(apiKey: string) {
  return viewFetch<{ ok: true }>("/view/unlock", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
}

export function fetchOntology() {
  return viewFetch<{ types: OntologyType[] }>("/view/api/ontology");
}

export function fetchSearch(input: { q: string; type: string; status: string }) {
  const params = new URLSearchParams();
  if (input.q) {
    params.set("q", input.q);
  }
  if (input.type) {
    params.set("type", input.type);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  const suffix = params.toString() ? `?${params}` : "";
  return viewFetch<{ searched: boolean; hits: SearchHit[]; error?: string }>(
    `/view/api/search${suffix}`,
  );
}

export function fetchGraph(input: { focus?: string; type?: string; depth?: number } = {}) {
  const params = new URLSearchParams();
  if (input.focus) {
    params.set("focus", input.focus);
  }
  if (input.type) {
    params.set("type", input.type);
  }
  if (input.depth) {
    params.set("depth", String(input.depth));
  }
  const suffix = params.toString() ? `?${params}` : "";
  return viewFetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/view/api/graph${suffix}`);
}

export function fetchRecents(limit?: number) {
  const suffix = limit ? `?limit=${limit}` : "";
  return viewFetch<{ rows: RecentRow[] }>(`/view/api/recents${suffix}`);
}

export function fetchTasks(limit?: number) {
  const suffix = limit ? `?limit=${limit}` : "";
  return viewFetch<{ tasks: TaskCard[] }>(`/view/api/tasks${suffix}`);
}

export function fetchType(slug: string) {
  return viewFetch<TypeView>(`/view/api/types/${encodeURIComponent(slug)}`);
}

export function fetchNode(id: string) {
  return viewFetch<NodeDetail>(`/view/api/nodes/${encodeURIComponent(id)}`);
}

export function fetchTodayJournal() {
  return viewFetch<NodeDetail>("/view/api/journals/today", { method: "POST" });
}

export function saveJournal(input: { id: string; title: string; body: string; base_updated_at: string }) {
  return viewFetch<NodeDetail>(`/view/api/nodes/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      base_updated_at: input.base_updated_at,
    }),
  });
}
