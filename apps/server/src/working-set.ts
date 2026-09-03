import {
  getNodeById,
  getVaultSettings,
  listIncidentEdgesForNodes,
  listLiveNodesByIds,
  listNodeTypes,
  listRelationTypes,
  type Pool,
} from "@foundation/db";
import {
  WORKING_SET_NODE_NOT_FOUND_SUGGESTION,
  applyWorkingSetCap,
  compareWorkingSetItems,
  datesFromNodeData,
  planWorkingSetWalk,
  preferWorkRelation,
  sortDateOf,
  todayInVault,
  toolError,
  workItemPassesSpineRootWindow,
  type IncidentEdge,
  type Node,
  type NodeType,
  type ToolError,
  type WorkingSetInput,
  type WorkingSetItem,
  type WorkingSetSuccess,
  type WorkingSetVia,
  type WorkingSetWalkPlan,
} from "@foundation/schema";

function asTypeMap(types: NodeType[]): Map<string, NodeType> {
  return new Map(types.map((type) => [type.slug, type]));
}

function leanDates(node: Node, types: Map<string, NodeType>) {
  return datesFromNodeData(node.data, types.get(node.type));
}

function isOpenStatus(status: Node["status"], includeCompleted: boolean): boolean {
  if (includeCompleted) {
    return true;
  }
  return status === "active";
}

function viaFromEdge(
  edge: IncidentEdge,
  hops: number,
): WorkingSetVia {
  return {
    relation: edge.relation_type,
    direction: edge.direction === "in" ? "incoming" : "outgoing",
    hops,
  };
}

function edgeMatchesWork(
  edge: IncidentEdge,
  plan: WorkingSetWalkPlan,
  allowHierarchy: boolean,
): boolean {
  const relation = edge.relation_type;
  if (allowHierarchy && plan.hierarchyRelations.includes(relation)) {
    return edge.direction === "in";
  }
  if (!plan.workRelations.includes(relation)) {
    return false;
  }
  if (plan.incomingOnlyRelations.includes(relation)) {
    return edge.direction === "in";
  }
  return true;
}

function parentFromEdges(
  edges: IncidentEdge[] | undefined,
  plan: WorkingSetWalkPlan,
): WorkingSetItem["parent"] {
  const parentEdge = (edges ?? []).find(
    (edge) => edge.direction === "out" && plan.hierarchyRelations.includes(edge.relation_type),
  );
  if (!parentEdge) {
    return undefined;
  }
  return {
    id: parentEdge.neighbor.id,
    title: parentEdge.neighbor.title,
    type: parentEdge.neighbor.type,
  };
}

function toWorkItem(
  node: Node,
  types: Map<string, NodeType>,
  via: WorkingSetVia,
  parent: WorkingSetItem["parent"],
): WorkingSetItem {
  const dates = leanDates(node, types);
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    ...dates,
    role: "work",
    via,
    ...(parent ? { parent } : {}),
  };
}

function toParentItem(
  node: Node,
  types: Map<string, NodeType>,
  via: WorkingSetVia,
  parent: WorkingSetItem["parent"],
): WorkingSetItem {
  const dates = leanDates(node, types);
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    ...dates,
    role: "parent",
    via,
    ...(parent ? { parent } : {}),
  };
}

async function walkAncestors(
  pool: Pool,
  root: Node,
  plan: WorkingSetWalkPlan,
  types: Map<string, NodeType>,
): Promise<WorkingSetItem[]> {
  const items: WorkingSetItem[] = [];
  let current = root.id;
  const seen = new Set<string>([root.id]);
  for (let hops = 1; hops <= 16; hops += 1) {
    const byNode = await listIncidentEdgesForNodes(pool, [current]);
    const parentEdge = (byNode.get(current) ?? []).find(
      (edge) => edge.direction === "out" && plan.hierarchyRelations.includes(edge.relation_type),
    );
    if (!parentEdge || seen.has(parentEdge.neighbor.id)) {
      break;
    }
    const parentNode = await getNodeById(pool, parentEdge.neighbor.id);
    if (!parentNode) {
      break;
    }
    seen.add(parentNode.id);
    const grand = parentFromEdges(
      (await listIncidentEdgesForNodes(pool, [parentNode.id])).get(parentNode.id),
      plan,
    );
    items.push(toParentItem(parentNode, types, viaFromEdge(parentEdge, hops), grand));
    current = parentNode.id;
  }
  return items;
}

async function walkWork(
  pool: Pool,
  root: Node,
  plan: WorkingSetWalkPlan,
  types: Map<string, NodeType>,
  depth: number,
): Promise<WorkingSetItem[]> {
  if (plan.work === "none") {
    return [];
  }
  const items: WorkingSetItem[] = [];
  const seen = new Set<string>([root.id]);
  const rootEdges = (await listIncidentEdgesForNodes(pool, [root.id])).get(root.id) ?? [];
  const hop1Edges = rootEdges.filter((edge) =>
    edgeMatchesWork(edge, plan, plan.work === "children" || plan.work === "event"),
  );
  const hop1EdgeById = new Map<string, IncidentEdge>();
  for (const edge of hop1Edges) {
    const id = edge.neighbor.id;
    if (seen.has(id)) {
      continue;
    }
    const existing = hop1EdgeById.get(id);
    if (!existing) {
      hop1EdgeById.set(id, edge);
      continue;
    }
    const preferred = preferWorkRelation(existing.relation_type, edge.relation_type, plan);
    if (preferred === edge.relation_type && preferred !== existing.relation_type) {
      hop1EdgeById.set(id, edge);
    }
  }
  const hop1Ids = [...hop1EdgeById.keys()];
  const hop1Nodes = await listLiveNodesByIds(pool, hop1Ids);
  const hop1ById = new Map(hop1Nodes.map((node) => [node.id, node]));
  const hop1ParentEdges =
    hop1Ids.length > 0 ? await listIncidentEdgesForNodes(pool, hop1Ids) : new Map();

  for (const id of hop1Ids) {
    const node = hop1ById.get(id);
    const edge = hop1EdgeById.get(id);
    if (!node || !edge) {
      continue;
    }
    seen.add(id);
    items.push(toWorkItem(node, types, viaFromEdge(edge, 1), parentFromEdges(hop1ParentEdges.get(id), plan)));
  }

  if (depth < 2 || hop1Ids.length === 0) {
    return items;
  }

  const childEdgesByNode = hop1ParentEdges;
  const hop2Ids: string[] = [];
  const hop2Via = new Map<string, WorkingSetVia>();
  for (const id of hop1Ids) {
    for (const edge of childEdgesByNode.get(id) ?? []) {
      if (edge.direction !== "in" || !plan.hierarchyRelations.includes(edge.relation_type)) {
        continue;
      }
      if (seen.has(edge.neighbor.id)) {
        continue;
      }
      hop2Ids.push(edge.neighbor.id);
      hop2Via.set(edge.neighbor.id, { relation: edge.relation_type, direction: "incoming", hops: 2 });
    }
  }
  const hop2Nodes = await listLiveNodesByIds(pool, hop2Ids);
  const hop2ParentEdges =
    hop2Ids.length > 0 ? await listIncidentEdgesForNodes(pool, hop2Ids) : new Map();
  for (const node of hop2Nodes) {
    const via = hop2Via.get(node.id);
    if (!via || seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    items.push(toWorkItem(node, types, via, parentFromEdges(hop2ParentEdges.get(node.id), plan)));
  }
  return items;
}

export async function workingSetGraph(
  pool: Pool,
  input: WorkingSetInput,
): Promise<WorkingSetSuccess | ToolError> {
  const includeCompleted = input.include_completed === true;
  const settings = await getVaultSettings(pool);
  const depth = input.depth ?? settings.working_set_depth_default;
  const limit = input.limit ?? settings.working_set_limit_default;
  const dueWithinDays = input.due_within_days ?? settings.working_set_due_within_days;

  const root = await getNodeById(pool, input.id);
  if (!root) {
    return toolError(`Node not found: ${input.id}`, WORKING_SET_NODE_NOT_FOUND_SUGGESTION);
  }

  const [types, relations] = await Promise.all([listNodeTypes(pool), listRelationTypes(pool)]);
  const typeMap = asTypeMap(types);
  const rootType = typeMap.get(root.type);
  if (!rootType) {
    return toolError(
      `Unknown type "${root.type}"`,
      "Call inspect_ontology. The node type must be in the live registry.",
    );
  }

  const plan = planWorkingSetWalk(rootType, types, relations);
  const today = todayInVault(settings.timezone);
  const applyWindow = plan.isSpineRoot;
  const ancestorItems = plan.ancestors ? await walkAncestors(pool, root, plan, typeMap) : [];
  const workItems = (await walkWork(pool, root, plan, typeMap, depth)).filter((item) => {
    if (!isOpenStatus(item.status, includeCompleted)) {
      return false;
    }
    if (!applyWindow) {
      return true;
    }
    return workItemPassesSpineRootWindow({
      sortDate: sortDateOf(item),
      hops: item.via.hops,
      today,
      dueWithinDays,
    });
  });

  const sorted = [...ancestorItems, ...workItems].sort((a, b) => compareWorkingSetItems(a, b, today));
  const capped = applyWorkingSetCap(sorted, limit);
  const rootDates = leanDates(root, typeMap);

  return {
    root: {
      id: root.id,
      type: root.type,
      title: root.title,
      status: root.status,
      ...(rootDates.due ? { due: rootDates.due } : {}),
    },
    items: capped.items,
    walk: {
      work: plan.work,
      ancestors: plan.ancestors,
      relations: plan.work === "none" && plan.ancestors ? plan.hierarchyRelations : plan.workRelations,
      depth,
      due_window: applyWindow ? { days: dueWithinDays, timezone: settings.timezone } : null,
    },
    truncated: capped.truncated,
  };
}
