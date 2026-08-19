import {
  LOOKUP_FUZZY_MIN_COMPACT_LEN,
  LOOKUP_SIM_FLOOR,
  LOOKUP_TOKEN_MIN_COMPACT_LEN,
  isIsoDate,
  type IncidentEdge,
  type LookupMatch,
  type LookupRawCandidate,
  type Node,
  type Payload,
  type SearchHit,
} from "@foundation/schema";
import type { Queryable } from "./tx.js";
import { iso } from "./tx.js";
import type pg from "pg";

type NodeRow = {
  id: string;
  type: string;
  title: string;
  status: Node["status"];
  payload: Payload;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export function mapNode(row: NodeRow): Node {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    payload: row.payload,
    data: row.data ?? {},
    metadata: row.metadata ?? {},
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    deleted_at: row.deleted_at ? iso(row.deleted_at) : null,
  };
}

export async function getNodeById(
  db: Queryable,
  id: string,
  options: { includeDeleted?: boolean; forUpdate?: boolean } = {},
): Promise<Node | undefined> {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const { rows } = await db.query<NodeRow>(
    options.includeDeleted
      ? `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE id = $1${lock}`
      : `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE id = $1 AND deleted_at IS NULL${lock}`,
    [id],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function getNodeByIdempotencyKey(
  db: Queryable,
  key: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    options.includeDeleted
      ? `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE idempotency_key = $1`
      : `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE idempotency_key = $1 AND deleted_at IS NULL`,
    [key],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function insertNode(
  db: Queryable,
  input: {
    id: string;
    type: string;
    title: string;
    status: Node["status"];
    payload: Payload;
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;
    idempotency_key?: string | null;
  },
): Promise<Node> {
  const { rows } = await db.query<NodeRow>(
    `INSERT INTO nodes (id, type, title, status, payload, data, metadata, idempotency_key, created_at, updated_at)
     VALUES (
       $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8,
       date_trunc('milliseconds', now()), date_trunc('milliseconds', now())
     )
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [
      input.id,
      input.type,
      input.title,
      input.status,
      JSON.stringify(input.payload),
      JSON.stringify(input.data),
      JSON.stringify(input.metadata),
      input.idempotency_key ?? null,
    ],
  );
  return mapNode(rows[0]!);
}

export async function updateNode(
  db: Queryable,
  id: string,
  patch: {
    type: string;
    title: string;
    status?: Node["status"];
    payload?: Payload;
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    /** When set, refuse the write unless current updated_at matches (if-match). */
    base_updated_at?: string;
  },
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET
       type = $2,
       title = $3,
       status = COALESCE($4, status),
       payload = COALESCE($5::jsonb, payload),
       -- Caller passes the already-merged data object so cleared keys (due: null) stay dropped.
       data = CASE
         WHEN $6::jsonb IS NULL THEN data
         ELSE $6::jsonb
       END,
       metadata = COALESCE($7::jsonb, metadata),
       updated_at = date_trunc('milliseconds', now())
     WHERE id = $1 AND deleted_at IS NULL
       AND (
         $8::timestamptz IS NULL
         -- Same instant as timestampsEqual / Date.parse: millisecond precision.
         -- EXTRACT(EPOCH)*1000::bigint disagrees on leftover microseconds
         -- (now() on insert) and can float-round a millisecond timestamp.
         OR date_trunc('milliseconds', updated_at AT TIME ZONE 'UTC')
           = date_trunc('milliseconds', $8::timestamptz AT TIME ZONE 'UTC')
       )
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [
      id,
      patch.type,
      patch.title,
      patch.status ?? null,
      patch.payload === undefined ? null : JSON.stringify(patch.payload),
      patch.data === undefined ? null : JSON.stringify(patch.data),
      patch.metadata === undefined ? null : JSON.stringify(patch.metadata),
      patch.base_updated_at ?? null,
    ],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function softDeleteNode(db: Queryable, id: string): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET deleted_at = now(), updated_at = date_trunc('milliseconds', now())
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [id],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function restoreNode(db: Queryable, id: string): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET deleted_at = NULL, updated_at = date_trunc('milliseconds', now())
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [id],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function restoreNodeSnapshot(
  db: Queryable,
  snapshot: Node,
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET
       type = $2,
       title = $3,
       status = $4,
       payload = $5::jsonb,
       data = $6::jsonb,
       metadata = $7::jsonb,
       updated_at = date_trunc('milliseconds', now())
     WHERE id = $1
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [
      snapshot.id,
      snapshot.type,
      snapshot.title,
      snapshot.status,
      JSON.stringify(snapshot.payload),
      JSON.stringify(snapshot.data),
      JSON.stringify(snapshot.metadata),
    ],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function getNodeByOrigin(
  db: Queryable,
  origin: { system: string; id: string },
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
     FROM nodes
     WHERE deleted_at IS NULL
       AND data #>> '{origin,system}' = $1
       AND data #>> '{origin,id}' = $2
     LIMIT 1`,
    [origin.system, origin.id],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

/** Live nodes whose title FTS-matches `title`. Skips self and already-linked pairs. */
export async function searchTitleLinkCandidates(
  db: Queryable,
  input: { title: string; excludeId: string; limit?: number },
): Promise<Array<{ id: string; type: string; title: string }>> {
  const title = input.title.trim();
  if (!title) {
    return [];
  }
  const limit = input.limit ?? 20;
  const { rows } = await db.query<{ id: string; type: string; title: string }>(
    `WITH q AS (
       SELECT
         plainto_tsquery('english', foundation_unaccent($1)) AS tsq,
         to_tsvector('english', foundation_unaccent($1)) AS title_tsv
     )
     SELECT n.id, n.type, n.title
     FROM nodes n
     CROSS JOIN q
     WHERE n.deleted_at IS NULL
       AND n.id <> $2
       AND q.tsq::text <> ''
       AND (
         to_tsvector('english', foundation_unaccent(n.title)) @@ q.tsq
         OR (
           plainto_tsquery('english', foundation_unaccent(n.title))::text <> ''
           AND q.title_tsv @@ plainto_tsquery('english', foundation_unaccent(n.title))
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM edges e
         JOIN nodes other ON other.id = CASE
           WHEN e.from_id = $2 THEN e.to_id
           ELSE e.from_id
         END
         WHERE ((e.from_id = $2 AND e.to_id = n.id) OR (e.from_id = n.id AND e.to_id = $2))
           AND other.deleted_at IS NULL
       )
     ORDER BY GREATEST(
       ts_rank_cd(to_tsvector('english', foundation_unaccent(n.title)), q.tsq),
       CASE
         WHEN plainto_tsquery('english', foundation_unaccent(n.title))::text = '' THEN 0
         ELSE ts_rank_cd(q.title_tsv, plainto_tsquery('english', foundation_unaccent(n.title)))
       END
     ) DESC,
     n.updated_at DESC
     LIMIT $3`,
    [title, input.excludeId, limit],
  );
  return rows;
}

/** True when the node already has a live child_of parent (deleted parents do not count). */
export async function hasLiveChildOf(db: Queryable, childId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM edges e
     JOIN nodes parent ON parent.id = e.to_id
     WHERE e.from_id = $1
       AND e.relation_type = 'child_of'
       AND parent.deleted_at IS NULL
     LIMIT 1`,
    [childId],
  );
  return rows.length > 0;
}

export async function isChildOfParent(
  db: Queryable,
  childId: string,
  parentId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM edges e
     JOIN nodes parent ON parent.id = e.to_id
     WHERE e.from_id = $1
       AND e.to_id = $2
       AND e.relation_type = 'child_of'
       AND parent.deleted_at IS NULL
     LIMIT 1`,
    [childId, parentId],
  );
  return rows.length > 0;
}

export async function searchNodes(
  db: Queryable,
  input: {
    query?: string;
    type?: string;
    status?: Node["status"];
    under?: string;
    since?: Date;
    originSystem?: string;
    originId?: string;
    dueOnOrAfter?: string;
    dueOnOrBefore?: string;
    dueBefore?: string;
    dueExact?: string;
    dataEquals?: Record<string, string>;
    limit?: number;
  },
): Promise<SearchHit[]> {
  const limit = input.limit ?? 20;
  const query = input.query?.trim() ? input.query.trim() : null;
  const { rows } = await db.query<
    Pick<NodeRow, "id" | "type" | "title" | "status"> & { snippet: string; due: string | null }
  >(
    `WITH q AS (
       SELECT CASE
         WHEN $1::text IS NULL THEN NULL
         ELSE plainto_tsquery('english', foundation_unaccent($1))
       END AS tsq
     )
     SELECT id, type, title, status,
            foundation_iso_date(data #>> '{due}') AS due,
            CASE
              WHEN q.tsq IS NULL THEN title
              ELSE ts_headline(
                'foundation_english',
                foundation_node_search_text(title, payload, data),
                q.tsq,
                'MaxWords=24, MinWords=5, MaxFragments=1'
              )
            END AS snippet
     FROM nodes CROSS JOIN q
     WHERE deleted_at IS NULL
       AND ($2::text IS NULL OR type = $2)
       AND ($3::text IS NULL OR status = $3)
       AND ($4::timestamptz IS NULL OR updated_at >= $4)
       AND (
         $5::uuid IS NULL OR EXISTS (
           SELECT 1
           FROM edges e
           JOIN nodes parent ON parent.id = e.to_id
           WHERE e.from_id = nodes.id
             AND e.to_id = $5
             AND e.relation_type = 'child_of'
             AND parent.deleted_at IS NULL
         )
       )
       AND ($6::text IS NULL OR data #>> '{origin,system}' = $6)
       AND ($7::text IS NULL OR data #>> '{origin,id}' = $7)
       AND ($8::text IS NULL OR foundation_iso_date(data #>> '{due}') >= $8)
       AND ($9::text IS NULL OR foundation_iso_date(data #>> '{due}') <= $9)
       AND ($10::text IS NULL OR foundation_iso_date(data #>> '{due}') < $10)
       AND ($11::text IS NULL OR foundation_iso_date(data #>> '{due}') = $11)
       AND ($12::jsonb IS NULL OR data @> $12::jsonb)
       AND (q.tsq IS NULL OR search_tsv @@ q.tsq)
     ORDER BY
       CASE WHEN q.tsq IS NULL THEN 0 ELSE ts_rank_cd(search_tsv, q.tsq) END DESC,
       updated_at DESC
     LIMIT $13`,
    [
      query,
      input.type ?? null,
      input.status ?? null,
      input.since ?? null,
      input.under ?? null,
      input.originSystem ?? null,
      input.originId ?? null,
      input.dueOnOrAfter ?? null,
      input.dueOnOrBefore ?? null,
      input.dueBefore ?? null,
      input.dueExact ?? null,
      input.dataEquals && Object.keys(input.dataEquals).length > 0
        ? JSON.stringify(input.dataEquals)
        : null,
      limit,
    ],
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    snippet: row.snippet ?? "",
    ...(row.due && isIsoDate(row.due) ? { due: row.due } : {}),
  }));
}

export type LookupQueryInput = {
  idx: number;
  name: string;
  type?: string;
};

type LookupRow = {
  idx: number;
  id: string;
  type: string;
  title: string;
  status: Node["status"];
  updated_at: Date | string;
  confidence: string | number;
  match: LookupMatch;
  matched_value: string;
};

/**
 * Batch title + well-formed-alias candidate gather.
 * Title exact/token/trigram use title_norm / title_compact indexes.
 * Aliases are unnested from JSONB; that path is not trigram-indexed.
 */
export const LOOKUP_CANDIDATE_SQL = `
WITH inputs AS (
  SELECT
    i.idx,
    i.name,
    NULLIF(i.type, '') AS type,
    foundation_name_norm(i.name) AS q_norm,
    foundation_name_compact(i.name) AS q_compact
  FROM unnest($1::int[], $2::text[], $3::text[]) AS i(idx, name, type)
),
title_exact AS (
  SELECT n.idx, nodes.id, nodes.type, nodes.title, nodes.status, nodes.updated_at,
         1::float8 AS confidence,
         'title_exact'::text AS match,
         nodes.title AS matched_value
  FROM inputs n
  JOIN nodes ON nodes.deleted_at IS NULL
    AND nodes.title_norm = n.q_norm
    AND (n.type IS NULL OR nodes.type = n.type)
  WHERE n.q_norm <> ''
),
alias_exact AS (
  SELECT n.idx, nodes.id, nodes.type, nodes.title, nodes.status, nodes.updated_at,
         0.99::float8 AS confidence,
         'alias_exact'::text AS match,
         aliases.alias_text AS matched_value
  FROM inputs n
  JOIN nodes ON nodes.deleted_at IS NULL
    AND (n.type IS NULL OR nodes.type = n.type)
  CROSS JOIN LATERAL (
    SELECT trim(both ' ' FROM value #>> '{}') AS alias_text
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(nodes.data->'aliases') = 'array' THEN nodes.data->'aliases'
        ELSE '[]'::jsonb
      END
    ) AS value
    WHERE jsonb_typeof(value) = 'string'
  ) aliases
  WHERE n.q_norm <> ''
    AND aliases.alias_text <> ''
    AND foundation_name_norm(aliases.alias_text) = n.q_norm
),
title_token AS (
  SELECT n.idx, nodes.id, nodes.type, nodes.title, nodes.status, nodes.updated_at,
         LEAST(0.8, 0.6 + 0.2 * (char_length(n.q_norm)::float8 / GREATEST(char_length(nodes.title_norm), 1))) AS confidence,
         'title_token'::text AS match,
         nodes.title AS matched_value
  FROM inputs n
  JOIN nodes ON nodes.deleted_at IS NULL
    AND (n.type IS NULL OR nodes.type = n.type)
    AND nodes.title_norm <> n.q_norm
    AND (' ' || nodes.title_norm || ' ') LIKE ('% ' || n.q_norm || ' %')
  WHERE char_length(n.q_compact) >= $4
    AND n.q_norm <> ''
),
title_fuzzy AS (
  SELECT n.idx, nodes.id, nodes.type, nodes.title, nodes.status, nodes.updated_at,
         LEAST(
           0.98,
           GREATEST(
             similarity(nodes.title_norm, n.q_norm),
             word_similarity(n.q_norm, nodes.title_norm),
             similarity(nodes.title_compact, n.q_compact)
           )
         ) AS confidence,
         'title_fuzzy'::text AS match,
         nodes.title AS matched_value
  FROM inputs n
  JOIN nodes ON nodes.deleted_at IS NULL
    AND (n.type IS NULL OR nodes.type = n.type)
    AND nodes.title_norm <> n.q_norm
    AND (
      nodes.title_norm % n.q_norm
      OR nodes.title_compact % n.q_compact
    )
  WHERE char_length(n.q_compact) >= $5
    AND n.q_norm <> ''
),
alias_fuzzy AS (
  SELECT n.idx, nodes.id, nodes.type, nodes.title, nodes.status, nodes.updated_at,
         LEAST(
           0.98,
           GREATEST(
             similarity(foundation_name_norm(aliases.alias_text), n.q_norm),
             word_similarity(n.q_norm, foundation_name_norm(aliases.alias_text)),
             similarity(foundation_name_compact(aliases.alias_text), n.q_compact)
           )
         ) AS confidence,
         'alias_fuzzy'::text AS match,
         aliases.alias_text AS matched_value
  FROM inputs n
  JOIN nodes ON nodes.deleted_at IS NULL
    AND (n.type IS NULL OR nodes.type = n.type)
  CROSS JOIN LATERAL (
    SELECT trim(both ' ' FROM value #>> '{}') AS alias_text
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(nodes.data->'aliases') = 'array' THEN nodes.data->'aliases'
        ELSE '[]'::jsonb
      END
    ) AS value
    WHERE jsonb_typeof(value) = 'string'
  ) aliases
  WHERE char_length(n.q_compact) >= $5
    AND n.q_norm <> ''
    AND aliases.alias_text <> ''
    AND foundation_name_norm(aliases.alias_text) <> n.q_norm
    AND (
      foundation_name_norm(aliases.alias_text) % n.q_norm
      OR foundation_name_compact(aliases.alias_text) % n.q_compact
    )
),
combined AS (
  SELECT * FROM title_exact
  UNION ALL
  SELECT * FROM alias_exact
  UNION ALL
  SELECT * FROM title_token
  UNION ALL
  SELECT * FROM title_fuzzy
  UNION ALL
  SELECT * FROM alias_fuzzy
),
ranked AS (
  SELECT *,
         row_number() OVER (
           PARTITION BY idx, match
           ORDER BY confidence DESC, title ASC, id ASC
         ) AS rn
  FROM combined
  WHERE confidence >= $6 OR match IN ('title_exact', 'alias_exact', 'title_token')
)
SELECT idx, id, type, title, status, updated_at, confidence, match, matched_value
FROM ranked
WHERE match IN ('title_exact', 'alias_exact')
   OR rn <= 20
`;

export function lookupCandidateValues(inputs: LookupQueryInput[]): unknown[] {
  return [
    inputs.map((item) => item.idx),
    inputs.map((item) => item.name),
    inputs.map((item) => item.type ?? ""),
    LOOKUP_TOKEN_MIN_COMPACT_LEN,
    LOOKUP_FUZZY_MIN_COMPACT_LEN,
    LOOKUP_SIM_FLOOR,
  ];
}

export async function lookupNodeCandidates(
  db: Queryable,
  inputs: LookupQueryInput[],
): Promise<Array<LookupRawCandidate & { idx: number }>> {
  if (inputs.length === 0) {
    return [];
  }
  const { rows } = await db.query<LookupRow>(LOOKUP_CANDIDATE_SQL, lookupCandidateValues(inputs));
  return rows.map((row) => ({
    idx: Number(row.idx),
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    updated_at: iso(row.updated_at),
    confidence: typeof row.confidence === "number" ? row.confidence : Number(row.confidence),
    match: row.match,
    matched_value: row.matched_value,
  }));
}

export async function explainLookupNodeCandidates(
  db: Queryable,
  inputs: LookupQueryInput[],
): Promise<string> {
  const { rows } = await db.query<{ "QUERY PLAN": string }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${LOOKUP_CANDIDATE_SQL}`,
    lookupCandidateValues(inputs),
  );
  return rows.map((row) => row["QUERY PLAN"]).join("\n");
}

export async function explainLookupTitleAccess(
  db: Queryable,
  sampleNorm: string,
): Promise<{ exact: string; fuzzy: string }> {
  const exact = await db.query<{ "QUERY PLAN": string }>(
    `EXPLAIN (FORMAT TEXT)
     SELECT id FROM nodes
     WHERE deleted_at IS NULL AND title_norm = $1`,
    [sampleNorm],
  );
  const fuzzy = await db.query<{ "QUERY PLAN": string }>(
    `EXPLAIN (FORMAT TEXT)
     SELECT id FROM nodes
     WHERE deleted_at IS NULL AND title_norm % $1`,
    [sampleNorm],
  );
  return {
    exact: exact.rows.map((row) => row["QUERY PLAN"]).join("\n"),
    fuzzy: fuzzy.rows.map((row) => row["QUERY PLAN"]).join("\n"),
  };
}

/** Force bitmap-only planning so the title_norm trigram GIN must be considered. */
export async function explainLookupTitleTrgmGin(
  db: Queryable,
  sampleNorm: string,
): Promise<string> {
  const run = async (client: Queryable): Promise<string> => {
    await client.query("SET LOCAL enable_seqscan = off");
    const { rows } = await client.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (FORMAT TEXT)
       SELECT id FROM nodes
       WHERE title_norm % $1`,
      [sampleNorm],
    );
    return rows.map((row) => row["QUERY PLAN"]).join("\n");
  };
  if ("connect" in db && typeof (db as pg.Pool).connect === "function") {
    const client = await (db as pg.Pool).connect();
    try {
      await client.query("BEGIN");
      const plan = await run(client);
      await client.query("ROLLBACK");
      return plan;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  await db.query("BEGIN");
  try {
    const plan = await run(db);
    await db.query("ROLLBACK");
    return plan;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

type EdgeRow = {
  id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  direction?: "in" | "out";
  neighbor_id?: string;
  neighbor_title?: string;
  neighbor_type?: string;
};

export function mapEdge(row: EdgeRow) {
  return {
    id: row.id,
    from_id: row.from_id,
    to_id: row.to_id,
    relation_type: row.relation_type,
    metadata: row.metadata ?? {},
    created_at: iso(row.created_at),
  };
}

export async function listIncidentEdges(db: Queryable, nodeId: string): Promise<IncidentEdge[]> {
  const { rows } = await db.query<EdgeRow>(
    `SELECT e.id, e.from_id, e.to_id, e.relation_type, e.metadata, e.created_at,
            CASE WHEN e.from_id = $1 THEN 'out' ELSE 'in' END AS direction,
            other.id AS neighbor_id,
            other.title AS neighbor_title,
            other.type AS neighbor_type
     FROM edges e
     JOIN nodes other ON other.id = CASE WHEN e.from_id = $1 THEN e.to_id ELSE e.from_id END
     WHERE (e.from_id = $1 OR e.to_id = $1)
       AND other.deleted_at IS NULL
     ORDER BY e.created_at`,
    [nodeId],
  );
  return rows.map((row) => ({
    ...mapEdge(row),
    direction: row.direction === "in" ? "in" : "out",
    neighbor: {
      id: row.neighbor_id ?? (row.direction === "out" ? row.to_id : row.from_id),
      title: row.neighbor_title ?? "",
      type: row.neighbor_type ?? "",
    },
  }));
}

/** Live edges only: both endpoints must not be soft-deleted. Used by link validation. */
export async function listEdgesTouching(
  db: Queryable,
  nodeIds: string[],
): Promise<Array<{ from_id: string; to_id: string; relation_type: string }>> {
  if (nodeIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<{ from_id: string; to_id: string; relation_type: string }>(
    `SELECT e.from_id, e.to_id, e.relation_type
     FROM edges e
     JOIN nodes from_node ON from_node.id = e.from_id
     JOIN nodes to_node ON to_node.id = e.to_id
     WHERE (e.from_id = ANY($1::uuid[]) OR e.to_id = ANY($1::uuid[]))
       AND from_node.deleted_at IS NULL
       AND to_node.deleted_at IS NULL`,
    [nodeIds],
  );
  return rows;
}

const NODE_COLUMNS = `id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`;

/** Newest live nodes. Empty graph returns []. Used by the read-only window working set. */
export async function listRecentLiveNodes(
  db: Queryable,
  options: { limit?: number; type?: string } = {},
): Promise<Node[]> {
  const limit = options.limit ?? 48;
  const { rows } = await db.query<NodeRow>(
    `SELECT ${NODE_COLUMNS}
     FROM nodes
     WHERE deleted_at IS NULL
       AND ($1::text IS NULL OR type = $1)
     ORDER BY updated_at DESC
     LIMIT $2`,
    [options.type ?? null, limit],
  );
  return rows.map(mapNode);
}

export async function listLiveNodesByIds(db: Queryable, ids: string[]): Promise<Node[]> {
  if (ids.length === 0) {
    return [];
  }
  const unique = [...new Set(ids)];
  const { rows } = await db.query<NodeRow>(
    `SELECT ${NODE_COLUMNS}
     FROM nodes
     WHERE deleted_at IS NULL AND id = ANY($1::uuid[])`,
    [unique],
  );
  return rows.map(mapNode);
}

/** Live edges whose both ends are in the set. */
export async function listEdgesAmong(
  db: Queryable,
  nodeIds: string[],
): Promise<Array<{ id: string; from_id: string; to_id: string; relation_type: string }>> {
  if (nodeIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<{
    id: string;
    from_id: string;
    to_id: string;
    relation_type: string;
  }>(
    `SELECT e.id, e.from_id, e.to_id, e.relation_type
     FROM edges e
     JOIN nodes from_node ON from_node.id = e.from_id
     JOIN nodes to_node ON to_node.id = e.to_id
     WHERE e.from_id = ANY($1::uuid[])
       AND e.to_id = ANY($1::uuid[])
       AND from_node.deleted_at IS NULL
       AND to_node.deleted_at IS NULL`,
    [nodeIds],
  );
  return rows;
}

export type TaskCardRow = {
  id: string;
  title: string;
  status: Node["status"];
  due: string | null;
  parent_title: string | null;
  data?: Record<string, unknown>;
  updated_at?: string;
};

export async function listTaskCards(db: Queryable, limit = 200): Promise<TaskCardRow[]> {
  return listTypeCards(db, "task", limit);
}

export type TypeCardRow = TaskCardRow & {
  type: string;
  parent_id: string | null;
};

export async function listTypeCards(
  db: Queryable,
  type: string,
  limit = 200,
): Promise<TypeCardRow[]> {
  const { rows } = await db.query<TypeCardRow>(
    `SELECT n.id, n.title, n.type, n.status, n.data,
            n.updated_at::text AS updated_at,
            foundation_iso_date(n.data #>> '{due}') AS due,
            parent.id AS parent_id,
            parent.title AS parent_title
     FROM nodes n
     LEFT JOIN edges e ON e.from_id = n.id AND e.relation_type = 'child_of'
     LEFT JOIN nodes parent ON parent.id = e.to_id AND parent.deleted_at IS NULL
     WHERE n.deleted_at IS NULL AND n.type = $1
     ORDER BY n.updated_at DESC
     LIMIT $2`,
    [type, limit],
  );
  return rows;
}

export type OutlineChildRow = {
  id: string;
  title: string;
  type: string;
  status: Node["status"];
  parent_id: string;
};

/** Descendants via child_of of the given parent ids (same vault, live nodes). */
export async function listOutlineChildren(
  db: Queryable,
  parentIds: string[],
): Promise<OutlineChildRow[]> {
  if (parentIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<OutlineChildRow>(
    `WITH RECURSIVE tree AS (
       SELECT n.id, n.title, n.type, n.status, e.to_id AS parent_id
       FROM nodes n
       JOIN edges e ON e.from_id = n.id AND e.relation_type = 'child_of'
       WHERE n.deleted_at IS NULL AND e.to_id = ANY($1::uuid[])
       UNION
       SELECT n.id, n.title, n.type, n.status, e.to_id AS parent_id
       FROM nodes n
       JOIN edges e ON e.from_id = n.id AND e.relation_type = 'child_of'
       JOIN tree t ON e.to_id = t.id
       WHERE n.deleted_at IS NULL
     )
     SELECT id, title, type, status, parent_id FROM tree`,
    [parentIds],
  );
  return rows;
}

export async function findEdge(
  db: Queryable,
  fromId: string,
  toId: string,
  relationType: string,
) {
  const { rows } = await db.query<EdgeRow>(
    `SELECT id, from_id, to_id, relation_type, metadata, created_at
     FROM edges
     WHERE from_id = $1 AND to_id = $2 AND relation_type = $3`,
    [fromId, toId, relationType],
  );
  return rows[0] ? mapEdge(rows[0]) : undefined;
}

export async function getEdgeById(db: Queryable, id: string) {
  const { rows } = await db.query<EdgeRow>(
    `SELECT id, from_id, to_id, relation_type, metadata, created_at
     FROM edges WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapEdge(rows[0]) : undefined;
}

export async function insertEdge(
  db: Queryable,
  input: {
    from_id: string;
    to_id: string;
    relation_type: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  edge: ReturnType<typeof mapEdge>;
  droppedStaleChildOf: Array<ReturnType<typeof mapEdge>>;
}> {
  let droppedStaleChildOf: Array<ReturnType<typeof mapEdge>> = [];
  if (input.relation_type === "child_of") {
    // Soft-delete leaves edges in place for undo, but the unique child_of
    // index still counts a ghost parent. Drop it so a live child can reparent.
    // Callers must write an unlink activity row for each returned snapshot.
    const dropped = await db.query<EdgeRow>(
      `DELETE FROM edges e
       USING nodes parent
       WHERE e.from_id = $1
         AND e.relation_type = 'child_of'
         AND parent.id = e.to_id
         AND parent.deleted_at IS NOT NULL
       RETURNING e.id, e.from_id, e.to_id, e.relation_type, e.metadata, e.created_at`,
      [input.from_id],
    );
    droppedStaleChildOf = dropped.rows.map(mapEdge);
  }
  const { rows } = await db.query<EdgeRow>(
    `INSERT INTO edges (from_id, to_id, relation_type, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [input.from_id, input.to_id, input.relation_type, JSON.stringify(input.metadata ?? {})],
  );
  return { edge: mapEdge(rows[0]!), droppedStaleChildOf };
}

export async function deleteEdge(
  db: Queryable,
  fromId: string,
  toId: string,
  relationType: string,
) {
  const { rows } = await db.query<EdgeRow>(
    `DELETE FROM edges
     WHERE from_id = $1 AND to_id = $2 AND relation_type = $3
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [fromId, toId, relationType],
  );
  return rows[0] ? mapEdge(rows[0]) : undefined;
}

export async function deleteEdgeById(db: Queryable, id: string) {
  const { rows } = await db.query<EdgeRow>(
    `DELETE FROM edges
     WHERE id = $1
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [id],
  );
  return rows[0] ? mapEdge(rows[0]) : undefined;
}

export async function purgeDeletedNodesByType(
  db: Queryable,
  slug: string,
): Promise<{ nodes: Node[]; edges: ReturnType<typeof mapEdge>[] }> {
  const edges = await db.query<EdgeRow>(
    `DELETE FROM edges
     WHERE from_id IN (SELECT id FROM nodes WHERE type = $1 AND deleted_at IS NOT NULL)
        OR to_id IN (SELECT id FROM nodes WHERE type = $1 AND deleted_at IS NOT NULL)
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [slug],
  );
  const nodes = await db.query<NodeRow>(
    `DELETE FROM nodes WHERE type = $1 AND deleted_at IS NOT NULL
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [slug],
  );
  return {
    nodes: nodes.rows.map(mapNode),
    edges: edges.rows.map(mapEdge),
  };
}

export async function restoreEdge(
  db: Queryable,
  snapshot: {
    id: string;
    from_id: string;
    to_id: string;
    relation_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  },
) {
  const { rows } = await db.query<EdgeRow>(
    `INSERT INTO edges (id, from_id, to_id, relation_type, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [
      snapshot.id,
      snapshot.from_id,
      snapshot.to_id,
      snapshot.relation_type,
      JSON.stringify(snapshot.metadata ?? {}),
      snapshot.created_at,
    ],
  );
  return mapEdge(rows[0]!);
}
