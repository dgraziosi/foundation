import { compileJsonSchemaFromFields, type TypeField } from "./fields.js";
import { SEED_TYPE_IDENTITY } from "./type-identity.js";
import type { NodeType, RelationType } from "./types.js";
import { SEED_TYPE_VIEWS } from "./views.js";

const DUE_FIELD: TypeField = {
  name: "due",
  display: "Due",
  kind: "date",
  needed: false,
  role: "date",
};

const TRIP_FIELDS: TypeField[] = [
  { name: "start", display: "Start", kind: "date", needed: false, role: "start" },
  { name: "end", display: "End", kind: "date", needed: false, role: "end" },
  { name: "place", display: "Place", kind: "string", needed: false, role: "subtitle" },
];

const PERSON_FIELDS: TypeField[] = [
  { name: "org", display: "Org", kind: "string", needed: false, role: "subtitle" },
];

function withSeedContract(
  type: Omit<NodeType, "views" | "default_view" | "fields" | "json_schema" | "hue" | "glyph"> & {
    fields?: TypeField[];
  },
): NodeType {
  const declared = SEED_TYPE_VIEWS[type.slug];
  const identity = SEED_TYPE_IDENTITY[type.slug];
  const fields = type.fields ?? [];
  return {
    ...type,
    fields,
    json_schema: compileJsonSchemaFromFields(fields),
    views: declared ? declared.views.map((view) => ({ ...view })) : [],
    ...(declared ? { default_view: declared.default_view } : {}),
    ...(identity ? { hue: identity.hue, glyph: identity.glyph } : {}),
  };
}

/** area → project → goal → habit | task */
export const SPINE_DIAGRAM = "area → project → goal → habit | task";

export const SPINE_TYPE_SLUGS = ["area", "project", "goal", "habit", "task"] as const;
export const ARTIFACT_TYPE_SLUGS = [
  "lesson",
  "person",
  "place",
  "company",
  "journal",
  "idea",
  "note",
  "trip",
  "decision",
] as const;

const SEED_NODE_TYPE_DEFS = [
  {
    slug: "area",
    label: "Area",
    description: "Spine root. A life domain and what you value (Health, Work, Family, …).",
    kind: "spine" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "project",
    label: "Project",
    description: "A bounded effort that lives under an area.",
    kind: "spine" as const,
    parent_types: ["area"],
    is_system: true,
  },
  {
    slug: "goal",
    label: "Goal",
    description:
      "An outcome a project is aiming at. Optional data.due is an ISO date (YYYY-MM-DD).",
    kind: "spine" as const,
    parent_types: ["project"],
    fields: [DUE_FIELD],
    is_system: true,
  },
  {
    slug: "habit",
    label: "Habit",
    description:
      "A repeating practice under a goal. Frequency and tracking live on the node data object.",
    kind: "spine" as const,
    parent_types: ["goal"],
    is_system: true,
  },
  {
    slug: "task",
    label: "Task",
    description:
      "A discrete action. Prefer child_of a goal when there is a real outcome; child_of a project is allowed. Cannot child_of an area. Optional data.due is an ISO date (YYYY-MM-DD).",
    kind: "spine" as const,
    parent_types: ["goal", "project"],
    fields: [DUE_FIELD],
    is_system: true,
  },
  {
    slug: "lesson",
    label: "Lesson",
    description: "Something learned. May hang under an area, project, or goal.",
    kind: "artifact" as const,
    parent_types: ["area", "project", "goal"],
    is_system: true,
  },
  {
    slug: "person",
    label: "Person",
    description: "A person. Typical target of the about relation.",
    kind: "artifact" as const,
    parent_types: [],
    fields: PERSON_FIELDS,
    is_system: true,
  },
  {
    slug: "place",
    label: "Place",
    description: "A location (home, office, city, venue, …).",
    kind: "artifact" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "company",
    label: "Company",
    description: "An organization (employer, vendor, school, …).",
    kind: "artifact" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "journal",
    label: "Journal",
    description: "A dated reflection or log entry.",
    kind: "artifact" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "idea",
    label: "Idea",
    description: "A spark to capture before it has a home on the spine.",
    kind: "artifact" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "note",
    label: "Note",
    description: "Universal capture sink when no more specific type fits yet.",
    kind: "artifact" as const,
    parent_types: [],
    is_system: true,
  },
  {
    slug: "trip",
    label: "Trip",
    description:
      "A journey. Motivating payload example: store an HTML itinerary (text/html, inline) and re-show it as HTML.",
    kind: "artifact" as const,
    parent_types: [],
    fields: TRIP_FIELDS,
    is_system: true,
  },
  {
    slug: "decision",
    label: "Decision",
    description: "A choice that was made. May hang under an area, project, or goal.",
    kind: "artifact" as const,
    parent_types: ["area", "project", "goal"],
    is_system: true,
  },
];

export const SEED_NODE_TYPES: readonly NodeType[] = SEED_NODE_TYPE_DEFS.map(withSeedContract);

export const SEED_RELATION_TYPES: readonly RelationType[] = [
  {
    slug: "child_of",
    label: "Child of",
    description:
      "Hierarchy placement. Source is the child; target is the parent. At most one child_of per source node. Allowed parents come from the source type's parent_types — including types you add with manage_type.",
    kind: "hierarchy",
    source_types: [],
    target_types: [],
    is_symmetric: false,
    semantic_parent_slug: null,
    is_system: true,
  },
  {
    slug: "relates_to",
    label: "Relates to",
    description: "Generic associative link. Any type to any type. Symmetric.",
    kind: "associative",
    source_types: [],
    target_types: [],
    is_symmetric: true,
    semantic_parent_slug: null,
    is_system: true,
  },
  {
    slug: "supports",
    label: "Supports",
    description: "Source supports a spine node (area, project, goal, habit, or task).",
    kind: "associative",
    source_types: [],
    target_types: [...SPINE_TYPE_SLUGS],
    is_symmetric: false,
    semantic_parent_slug: "relates_to",
    is_system: true,
  },
  {
    slug: "inspired_by",
    label: "Inspired by",
    description: "Source was inspired by target.",
    kind: "associative",
    source_types: [],
    target_types: [],
    is_symmetric: false,
    semantic_parent_slug: "relates_to",
    is_system: true,
  },
  {
    slug: "references",
    label: "References",
    description: "Source cites or points at target.",
    kind: "associative",
    source_types: [],
    target_types: [],
    is_symmetric: false,
    semantic_parent_slug: "relates_to",
    is_system: true,
  },
  {
    slug: "about",
    label: "About",
    description: "Source is about a person.",
    kind: "associative",
    source_types: [],
    target_types: ["person"],
    is_symmetric: false,
    semantic_parent_slug: "relates_to",
    is_system: true,
  },
];
