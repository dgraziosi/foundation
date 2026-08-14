import type { IncidentEdge, Node, Payload, SearchHit } from "@foundation/schema";
import type { Queryable } from "./tx.js";
import { iso } from "./tx.js";

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
       data = CASE
         WHEN $6::jsonb IS NULL THEN data
         ELSE COALESCE(data, '{}'::jsonb) || $6::jsonb
       END,
       metadata = COALESCE($7::jsonb, metadata),
       updated_at = date_trunc('milliseconds', now())
     WHERE id = $1 AND deleted_at IS NULL
       AND (
         $8::timestamptz IS NULL
         OR (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint
           = (EXTRACT(EPOCH FROM $8::timestamptz) * 1000)::bigint
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
            NULLIF(data #>> '{due}', '') AS due,
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
       AND ($8::text IS NULL OR (data #>> '{due}') >= $8)
       AND ($9::text IS NULL OR (data #>> '{due}') <= $9)
       AND ($10::text IS NULL OR (data #>> '{due}') < $10)
       AND ($11::text IS NULL OR (data #>> '{due}') = $11)
       AND (q.tsq IS NULL OR search_tsv @@ q.tsq)
     ORDER BY
       CASE WHEN q.tsq IS NULL THEN 0 ELSE ts_rank_cd(search_tsv, q.tsq) END DESC,
       updated_at DESC
     LIMIT $12`,
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
      limit,
    ],
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    snippet: row.snippet ?? "",
    ...(row.due ? { due: row.due } : {}),
  }));
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
