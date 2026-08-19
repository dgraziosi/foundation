import { listNodeTypes, listRelationTypes, type Pool } from "@foundation/db";
import {
  BootstrapOutputSchema,
  SPINE_DIAGRAM,
  type BootstrapOutput,
} from "@foundation/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool } from "./define-tool.js";

export async function buildBootstrap(pool: Pool): Promise<BootstrapOutput> {
  const [types, relations] = await Promise.all([listNodeTypes(pool), listRelationTypes(pool)]);
  return BootstrapOutputSchema.parse({
    spine: {
      diagram: SPINE_DIAGRAM,
      root: "area",
      description:
        "Area is the spine root (life domain + what you value). The spine (area → project → goal → habit | task) is preferred placement, not a hard gate: project → area, goal → project, habit → goal, task → goal or project (prefer goal when there is a real outcome; task cannot child_of area). Identity is UUID; edges are the only source of truth.",
    },
    types,
    relations,
    rules: {
      identity: "uuid",
      payloads:
        "Typed payloads: media_type text/markdown | text/html | application/json | text/plain | …; storage inline | blob. HTML itineraries belong on the node, not round-tripped through markdown. Large files use storage blob (blob_id); fetch bytes via HTTP GET /blobs/:id.",
      destructive_confirm: true,
      ontology_writable: true,
      no_proposal_inbox: true,
      edges_are_source_of_truth: true,
      hierarchy_relation: "child_of",
    },
    how_to_extend: {
      summary:
        "You may manage_type and manage_relation without approval. Changes apply immediately. Safety is the activity log + undo — there is no proposal inbox. Destructive tools (delete, unlink, undo, manage_type retire) require confirm: true. Identity is UUID. If you already have a UUID, call get — do not search. To resolve one or more entity names, call lookup — do not serial-search. Call inspect_ontology to see system + authored types. After mutating, list_activity to read receipts and undo to invert a reversible row. search finds nodes by title, node data, and extracted inline payload text. An empty search is not a license to upsert a duplicate. Large files are blobs under FOUNDATION_DATA/blobs, ingested via upsert (bytes_base64 or uploads source_path). Vault health, graph hygiene, and applying Foundation git updates are instance routines, not MCP tools (docs/VAULT_HEALTH.md, docs/GRAPH_HYGIENE.md). Do not add get_vault_health. Do not commit personal life data, documents, or secrets to git — those belong in the operator's vault.",
      manage_type:
        "Create, update, or retire a node type (slug, kind spine|artifact, parent_types, optional json_schema for nodes.data). Applies immediately. System slugs: you may update description only; you cannot retire them. Retire an unused authored type with action retire and confirm: true. Live nodes of that type refuse with { error, suggestion }: delete or retype them first. Soft-deleted nodes stay restorable — undo those deletes, or pass purge_deleted: true (with confirm: true) to drop the tombstones, same as undo of type create. After creating a type, upsert a node with that type. Set parent_types to allow child_of placement under those parents.",
      manage_relation:
        "Create or update a relation type (slug, kind hierarchy|associative, source_types, target_types, symmetry). Empty source/target lists mean any type. Applies immediately. System relations: description only.",
      nodes:
        "upsert creates or updates by UUID (omit id to create). Updates require base_updated_at matching the node's current updated_at from get (if-match, millisecond precision). Mismatch or omit → { error, suggestion }: get and retry — never treat a CAS miss as node-not-found. This is lost-update protection, not a write-ACL. Create (no id) runs the same lookup matcher on the new title (type-scoped): exact title or unique exact alias returns those candidates and does not write unless you pass allow_duplicate: true. Token, fuzzy, and space-compacted matches set duplicate_warnings and still write. Same-name entities stay allowed with that override. data JSONB-merges on update (top-level keys); a partial data patch does not wipe other keys. When the type has json_schema, upsert validates the merged data and returns { error, suggestion } on a miss. task and goal accept optional data.due as YYYY-MM-DD; omit it and the node still writes; pass due: null to clear. data.origin.{system,id} (gmail | calendar | drive | github) is unique on live nodes — search origin before upserting a person so you do not twin. Foundation stores the ref only; never fetch or mirror those systems' bodies. Optional data.aliases is an operator-authored string array of alternate names (lookup uses it; pass aliases: [] to clear; omit the key to leave aliases unchanged). Create accepts idempotency_key so a retried create returns the existing node instead of a twin. Optional actor / actor_label are stored on the activity row (who wrote). Payload is typed: text/markdown, text/html, application/json, text/plain (inline), or storage blob for large files. Blob ingest: payload.bytes_base64 (cap 20MB) or payload.source_path under FOUNDATION_DATA/uploads (server moves the file into blobs/<uuid>). Stored payload is { storage: blob, blob_id, media_type } — get does not dump bytes; fetch with HTTP GET /blobs/:id (API key) or get include_body for small blobs. HTML itineraries belong on the node — do not round-trip through markdown. upsert returns suggested_links from Postgres FTS on the new title (child_of an allowed parent, about a person already in the graph, or relates_to a close title match). A node that already has a live child_of is not offered a second parent; about and relates_to may still appear. These are proposals — they never write an edge or add a type. If suggested_links is non-empty, show them and ask before calling link. get returns the node plus incident edges and the same suggested_links list; each edge includes neighbor { id, title, type } so you do not hop UUID-only. delete is a soft-delete and requires confirm: true; it does not delete blob bytes (undo can restore the node). Undo of delete restores the node (incident edges were kept).",
      links:
        "link validates then writes the edges table (the only source of truth for hierarchy and associations). Pass one edge (from_id, to_id, relation_type) or edges[] (1–20), not both. The whole batch validates before any write; one transaction writes all edges or none. First error wins — no partial links. Each edge carries from_base_updated_at and to_base_updated_at (if-match against that endpoint's updated_at from get). A later edge does not inherit CAS from an earlier edge that named the same node. Stale, missing, or disagreeing timestamps on a shared node → { error, suggestion }. Linking does not change node.updated_at. Optional actor / actor_label are stored on each activity row. One activity receipt per written edge (links[] in input order). The one-edge form also returns edge and activity_id. child_of is the hierarchy verb; at most one per source, including later edges in the same batch; allowed parents come from the source type's parent_types. relates_to that fits the spine suggests child_of — it does not silently rewrite unless that edge passes upgrade: true, and a suggestion does not fail the batch. In-batch exact and symmetric duplicates refuse. unlink requires confirm: true. get and link ignore edges whose endpoints are deleted; reparenting drops a stale child_of to a deleted parent and records an unlink activity row. Accept a suggested_links item by calling link with that kind and target — upsert/get never write the edge. undo inverts one receipt at a time.",
      activity:
        "list_activity filters by action, target (target_id), and since. Every mutation writes a row with before/after snapshots and optional actor / actor_label (who wrote — not a permission gate). undo inverts a reversible row by id and requires confirm: true. Tokens are single-use (undone_at); expired tokens refuse. Undo of undo writes a compensating row with reversible = false. Undoing a type create (or retiring a type) while deleted nodes of that type remain requires purge_deleted: true (otherwise restore those nodes first via undo of their deletes). Undo of type retire restores the registry row.",
      search:
        "search uses Postgres full-text search on title, node data (string values), and extracted inline payload text (HTML tags stripped; alt/title/aria-label kept; JSON string values, not the payload wrapper). Latin diacritics are folded so ASCII queries match accented tokens and vice versa (fiancee / fiancée). query is optional when type, status, under (child_of parent UUID), since, origin, due (overdue|today in America/New_York), due_on_or_before, due_on_or_after, or data_equals is set — list all open tasks with type=task and status=active; list overdue or due-today tasks; list children with under; look up a Gmail/Calendar/Drive/GitHub ref with origin without a word; list nodes whose data keys equal a value with data_equals (e.g. { kind, status } — JSONB equality on top-level keys, not a column per key). There is no list_nodes tool. Filter by type. Soft-deleted nodes are excluded. Hits are id/type/title/snippet plus due when data.due is set — call get to load payload and neighbor titles. If you already have a UUID, call get; do not search. To resolve one or more entity names to UUIDs, call lookup — do not serial-search. An empty lexical result is not a license to upsert a duplicate — try a shorter token or type filter; only upsert if the entity is new. An origin miss means you may upsert with that data.origin (ref only; do not fetch or mirror those systems' bodies). Lexical recall only, not embeddings.",
      lookup:
        "lookup resolves one or more names in one request and returns a result per input so you can correlate misses. Outcomes: exact (unique folded title or UUID), alias (unique operator-authored data.aliases entry), candidate (token or fuzzy — never authoritative), ambiguous (duplicate exact titles or alias/title collisions), no_match. Each useful candidate includes id, type, canonical title, updated_at, match, and confidence, plus the surrounding candidates list. confidence ranks; it is not a probability and does not grant permission to write. Unique exact/alias may use that UUID. For candidate or ambiguous, ask the operator to confirm a UUID before any mutation that depends on the identity (link, upsert, merge, overwrite, alias write). get is safe for inspection. lookup never writes, merges, or picks an ambiguous candidate. Optional type narrows the scan. Soft-deleted nodes are excluded. Write aliases with upsert data.aliases (array of strings; [] clears; omit the key to leave unchanged). No embeddings and no hidden nickname list.",
    },
  });
}

export function registerBootstrapTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "bootstrap",
    description:
      "Return starter ontology, how to extend it, and current type/relation inventory. Call first.",
    input: {},
    output: BootstrapOutputSchema,
    handler: async () => buildBootstrap(pool),
  });
}
