import type { IncidentEdge, Node, Payload } from "@foundation/schema";
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
  options: { includeDeleted?: boolean } = {},
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    options.includeDeleted
      ? `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE id = $1`
      : `SELECT id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at
         FROM nodes WHERE id = $1 AND deleted_at IS NULL`,
    [id],
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
  },
): Promise<Node> {
  const { rows } = await db.query<NodeRow>(
    `INSERT INTO nodes (id, type, title, status, payload, data, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [
      input.id,
      input.type,
      input.title,
      input.status,
      JSON.stringify(input.payload),
      JSON.stringify(input.data),
      JSON.stringify(input.metadata),
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
  },
): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET
       type = $2,
       title = $3,
       status = COALESCE($4, status),
       payload = COALESCE($5::jsonb, payload),
       data = COALESCE($6::jsonb, data),
       metadata = COALESCE($7::jsonb, metadata),
       updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [
      id,
      patch.type,
      patch.title,
      patch.status ?? null,
      patch.payload === undefined ? null : JSON.stringify(patch.payload),
      patch.data === undefined ? null : JSON.stringify(patch.data),
      patch.metadata === undefined ? null : JSON.stringify(patch.metadata),
    ],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

export async function softDeleteNode(db: Queryable, id: string): Promise<Node | undefined> {
  const { rows } = await db.query<NodeRow>(
    `UPDATE nodes SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, type, title, status, payload, data, metadata, created_at, updated_at, deleted_at`,
    [id],
  );
  return rows[0] ? mapNode(rows[0]) : undefined;
}

type EdgeRow = {
  id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  direction?: "in" | "out";
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
            CASE WHEN e.from_id = $1 THEN 'out' ELSE 'in' END AS direction
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
  }));
}

export async function listEdgesTouching(
  db: Queryable,
  nodeIds: string[],
): Promise<Array<{ from_id: string; to_id: string; relation_type: string }>> {
  if (nodeIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<{ from_id: string; to_id: string; relation_type: string }>(
    `SELECT from_id, to_id, relation_type
     FROM edges
     WHERE from_id = ANY($1::uuid[]) OR to_id = ANY($1::uuid[])`,
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

export async function insertEdge(
  db: Queryable,
  input: {
    from_id: string;
    to_id: string;
    relation_type: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { rows } = await db.query<EdgeRow>(
    `INSERT INTO edges (from_id, to_id, relation_type, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, from_id, to_id, relation_type, metadata, created_at`,
    [input.from_id, input.to_id, input.relation_type, JSON.stringify(input.metadata ?? {})],
  );
  return mapEdge(rows[0]!);
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
