export { createPool, waitForDb, type Pool, type PoolClient } from "./client.js";
export { migrate } from "./migrate.js";
export { seedSystemOntology } from "./seed.js";
export {
  countDeletedNodesByType,
  countEdgesByRelation,
  countNodesByType,
  countRelationsUsingSemanticParent,
  countTypesUsingParent,
  deleteNodeType,
  deleteRelationType,
  getNodeType,
  getRelationType,
  insertNodeType,
  insertRelationType,
  listNodeTypes,
  listRelationTypes,
  pingDb,
  updateNodeType,
  updateNodeTypeDescription,
  updateRelationType,
  updateRelationTypeDescription,
} from "./queries.js";
export {
  getActivityById,
  insertActivity,
  listActivity,
  markActivityUndone,
  markNodeDeleteActivitiesIrreversible,
  UNDO_TTL_MS,
} from "./activity.js";
export {
  deleteEdge,
  deleteEdgeById,
  findEdge,
  getEdgeById,
  getNodeById,
  insertEdge,
  insertNode,
  listEdgesTouching,
  listIncidentEdges,
  purgeDeletedNodesByType,
  restoreEdge,
  restoreNode,
  restoreNodeSnapshot,
  searchNodes,
  softDeleteNode,
  updateNode,
} from "./nodes.js";
export { isForeignKeyViolation, isUniqueViolation, withTransaction, type Queryable } from "./tx.js";
