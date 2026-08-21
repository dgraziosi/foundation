# AI-native second brain: field map (research only)

**Kind:** product research note. Not a SPEC amendment. Not an architecture change. Not a tool proposal.

**Filed:** 2026-08-21. Sources checked as of that date.

**Question:** What should an AI-native second brain actually be able to do, and which of those capabilities should this product consider adding?

**What would change the answer:** a capability that helps agents act on a person’s life (goals, people, projects, decisions). Not a nicer human PKM UI. Not another chat-memory store.

**Public vocabulary in this note:** **user** = the human. **bot** = a named role. **agent** = anything that can reach the vault. **Vault** = one instance. **Graph** = live nodes and edges. **Ontology** = type/relation vocabulary. **Blob** = file on a node. The graph is not the vault.

**Git-tree leak check (report-only):** product docs, prompts, schema, and migrations were scanned for life data, vault dumps, and secrets. No personal data, addresses, family facts, or graph exports were found in git. One leftover “operator” string remains in `docs/SPEC.md`; that is a glossary inconsistency, not a leak.

---

## 0. This product, as locked (FACT)

Read from `README.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/MCP_TOOLS.md`, `docs/AGENTS.md`, `docs/VIEWER.md`, `docs/HARNESS.md`, `docs/GRAPH_HYGIENE.md`, starter prompts, and the handoff skill. No live vault was used.

### What it is

Foundation is a self-hosted **life graph**: a typed model of the user so agents can help accomplish life goals. One vault holds one graph. Agents reach that graph over MCP (14 tools). The viewer is a read-only window on the same graph. Bots are pasted harness recipes, not graph objects.

Starter spine (preferred, not a hard gate): `area → project → goal → habit | task`. Seed artifacts include person, place, company, decision, note, lesson, journal, idea, trip, spend. Hierarchy verb is `child_of`. Associative seeds include `relates_to`, `about`, `supports`, `inspired_by`, `references`.

### Store

Postgres nodes (type, title, status, payload, `data`) + typed edges + activity. Payload is inline or a blob. `data` is structured JSON validated against the type’s compiled `json_schema`. Extra keys still write. Identity is UUID.

**Node = current picture. Activity = history.** Compare-and-swap on update and `link`. `undo` inverts a reversible activity row. This is lost-update protection and a receipt, not an ACL. The API key is the gate.

Gmail, Calendar, Drive, and GitHub stay the source of truth. The graph may hold `data.origin { system, id }` only. Do not fetch or mirror those systems’ bodies.

### Retrieval

Not embeddings. Postgres FTS (`search`), name resolution (`lookup`), one-node fetch (`get`), rooted agenda (`working_set`). Filters include type, status, `under`, `since`, origin, due windows, and `data_equals`. Title folding and trigrams on `lookup`. Suggested links are title-FTS proposals; they never write an edge.

### Write path

Agents write. `upsert` / `delete` / `link` / `unlink` / `manage_type` / `manage_relation`. Ontology changes apply immediately; no proposal inbox. Destructive tools need `confirm: true`. Create-time duplicate preflight uses the same matcher as `lookup`. Batch `link` is one transaction.

### Who compresses

The product does not run a background “dream” or agent-written compress over chat. Current picture is the node. History is activity. Graph hygiene is a weekly **report-only** instance routine (duplicates, isolates, type soup). It does not mutate unless the user asked in that sitting.

### Who acts

Any agent that can reach the vault MCP may read and write. Starter bots:

- **Chief of Staff** — conversation, capture into the graph, morning brief, create another bot.
- **Vault Keeper** — instance health, backup, hygiene, product updates.
- **Executive Assistant** — draft mail (send waits for a yes on that message); put vault `data.due` on the calendar.

**Handoff** is a skill, not a graph write: when a step finishes, name who has the work now, or say done. A due change should move the calendar in the same motion. Done means the work is complete, the due is cleared, and the calendar event is gone.

### Locked / already decided (do not reopen here)

- Not a Momentum / Anytype / Obsidian clone. Viewer updates only when asked. Home is Recents, open tasks, and type folders — not a capture editor.
- Not harness chat-memory (Mem0, OptMem). Memory stays policy. The graph is the operated world model.
- Retrieval is not embeddings. Ontology is types/relations.
- Paperclip-style agent-company control plane (per-bot spend caps and org-chart-in-the-graph) was refused.
- OptMem-style append-only log + agent-written compress was refused as product direction; node = current picture, activity = history already covers that split.
- 14 tools. A further tool still needs a SPEC amendment.
- No write-ACL, no multi-tenant SaaS, no dual write to a markdown vault, no bank import / second ledger.

---

## 1. What an AI-native second brain should be able to do

This section is the frame. Labels mark how sure each claim is.

### 1.1 Act on a life, not recall a chat (INFERENCE)

The useful object is a **current model of the user’s life** that an agent can read, update, and close the loop against the world. Chat memory, wearable transcripts, and personal-LLM weights can feed that model. They are not the model.

A second brain that only answers “what did we talk about?” is a memory layer. A second brain that can answer “what is open on this goal, what did we decide, who is owed what, and what should move in mail or calendar next?” is a life graph.

### 1.2 Five jobs that keep showing up (FACT from the field, grouped)

Across products and papers below, the serious systems keep inventing some version of these five jobs:

1. **Current picture** — what is true now (goal open, person related, decision in force).
2. **History** — what changed, and whether the old fact is still queryable.
3. **Resolve** — bind a name / alias / origin id to one object before writing.
4. **Agenda** — given one object, what is open and due around it.
5. **Act** — change the world (mail, calendar, repo, browser) and write a receipt back.

Foundation already ships 1–4 on the graph, and a thin 5 through the Executive Assistant recipe plus the handoff skill. The field’s extra machinery is almost always about 2 (temporal invalidation, dreaming, compress) or 5 (continuous runtime, computer control, meeting-time agents).

### 1.3 Compression is not the product (INFERENCE)

Who compresses is the fork:

| Who compresses | Typical product | What it optimizes |
| --- | --- | --- |
| Background model over chat | OpenAI Dreaming, consumer Claude/Copilot memory | Prompt personalization |
| Agent writes summaries into a log/tree | OptMem, Letta dreaming, Holon episodes | Session continuity |
| Pipeline extracts entities from text | Graphiti/Zep, Cognee, Mem0, LlamaIndex PropertyGraph | Chat/document → graph |
| User or agent writes the current object | Foundation, Holon work items, Tana context graph (when filed) | Operable world model |

The last row is the locked niche. The others are useful **feeds**. They become a fight when they become the store of truth.

### 1.4 Act requires a closed loop (INFERENCE)

Acting on goals / people / projects / decisions needs four durable facts, not a better chat:

1. The object (goal, person, project, decision).
2. The outstanding obligation (task, due, promise, blocked-by).
3. The world move (calendar event, draft/send, repo change) with the user in the loop where it matters.
4. The receipt that the world moved, without copying the world’s body into the graph.

Foundation has 1 and most of 2. 3 lives in harness bots. 4 is only implied (`data.origin`, activity `actor`, handoff skill). That gap is where this note spends its recommendations.

---

## 2. Field map (serious entries)

For each entry: **store / retrieval / write path / who compresses / who acts**. Citations are primary pages unless noted.

### 2.1 Letta (MemGPT)

- **URLs:** [Stateful agents](https://docs.letta.com/guides/core-concepts/stateful-agents/), [Context hierarchy](https://docs.letta.com/guides/core-concepts/memory/context-hierarchy/), [Memory blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks/), [MemFS](https://docs.letta.com/concepts/memfs/), [Memory & dreaming](https://docs.letta.com/letta-code/memory/)
- **Store:** Agent-scoped state in a database. Core **memory blocks** (strings, pinned in the system prompt; optional shared blocks). Files. Archival memory (small passages). MemFS projects memory as a git-backed filesystem (`system/` stays in prompt; the rest is path-addressed).
- **Retrieval:** Blocks are always in context. Files: `open` / `close` / `semantic_search` / `grep`. Archival: `archival_memory_search`. MemFS: ordinary file-search; docs say no semantic/vector index by default.
- **Write path:** Agent tools (`memory_rethink` / `replace` / `insert`, archival insert). Developer API. MemFS edits commit to git.
- **Who compresses:** The agent edits its own blocks. “Dreaming” is a background subagent that reviews conversations and proposes memory updates. Compaction evicts messages; old messages stay retrievable.
- **Who acts:** The Letta agent, via tools. External world action is whatever tools/MCP the developer attached. Letta is a **stateful agent runtime + memory hierarchy**, not a life ontology.
- **Vs this product:** Closest on “agent writes durable state.” Fights the niche if Foundation became per-bot memory blocks or a git memory FS. Shared blocks are the Letta answer to multi-agent; Foundation’s answer is already one graph.

### 2.2 Zep / Graphiti

- **URLs:** [Graphiti overview](https://help.getzep.com/graphiti/getting-started/overview), [Graphiti GitHub](https://github.com/getzep/graphiti), [Graphiti product page](https://www.getzep.com/platform/graphiti/), [Zep paper](https://arxiv.org/abs/2501.13956) (Jan 2025)
- **Store:** Temporal knowledge graph (“context graph”). Episodes (raw ingest, provenance) → extracted entities + edges → optional communities. **Bi-temporal** edges: valid time (when true in the world) and transaction time (when the system learned it). Contradictions **invalidate** an edge; they do not delete history. Custom entity types supported. Graphiti = one graph per subject, local. Zep = managed “context lake” of many graphs.
- **Retrieval:** Hybrid: vector + BM25 + graph traversal, typically no LLM rerank. Point-in-time queries. Claimed LoCoMo ~94.7% @ 155ms, LongMemEval ~90.2% @ 162ms ([LoCoMo](https://arxiv.org/abs/2402.17753), [LongMemEval](https://arxiv.org/abs/2410.10813)).
- **Write path:** Ingest episode (message, JSON, document). LLM extracts entities/edges. Incremental, not batch GraphRAG rebuild.
- **Who compresses:** The extraction + invalidation pipeline. Communities summarize clusters. The episode layer is the non-lossy log.
- **Who acts:** Not Graphiti. Downstream agents consume assembled context. Graphiti is a **memory/context engine**.
- **Vs this product:** Closest graph analog in the memory field. Important difference: Graphiti’s graph is **extracted from text** and retrieved with embeddings + FTS + walk. Foundation’s graph is **authored** (user or agent) with an explicit ontology, FTS/lookup only. Steal the *idea* of valid-time on facts. Do not steal automatic extraction as truth, and do not add embeddings to `search`.

### 2.3 Cognee

- **URLs:** [cognee.ai](https://www.cognee.ai/), [GitHub](https://github.com/topoteretes/cognee), [Introduction](https://docs.cognee.ai/getting-started/introduction), [How Cognee builds memory](https://www.cognee.ai/how-cognee-builds-ai-memory)
- **Store:** Graph-vector hybrid (graph DB + vector store + relational metadata). v1 can sit on Postgres. Permanent graph memory vs fast session memory.
- **Retrieval:** `recall` auto-routes. Default `GRAPH_COMPLETION`: vector hit as a hint, then traverse triplets and generate. MCP server for agents.
- **Write path:** `remember` (ingest text/files/URLs → chunk → LLM extract → embed → commit). `improve` bridges session → permanent graph and applies feedback weights. `forget` deletes.
- **Who compresses:** The cognify / improve pipeline (classify, extract, summarize, embed).
- **Who acts:** The calling agent. Cognee is a **memory platform**, including “give Claude Code / Cursor memory.”
- **Vs this product:** Contrast. Ontology is generated and embedding-first. Useful as a feed, fatal as the store.

### 2.4 Mem0 (contrast only)

- **URLs:** [How it works](https://docs.mem0.ai/core-concepts/how-it-works), [Memory evaluation](https://docs.mem0.ai/core-concepts/memory-evaluation), [GitHub](https://github.com/mem0ai/mem0)
- **Store:** SQL facts + vector embeddings + entity/graph store. Scoped by user / agent / app / session. v3 is **ADD-only**: new facts accumulate; they are not overwritten.
- **Retrieval:** Fused semantic + BM25 + entity match + temporal metadata. App stuffs hits into the next prompt.
- **Write path:** App sends conversation turns to `add`. LLM extracts facts, dedups, embeds.
- **Who compresses:** Extraction LLM at write. No current-picture node.
- **Who acts:** The host app/agent. Mem0 does not operate a life.
- **Vs this product:** The thing the niche already refused. Chat-log-as-extraction-target. Mentioned so it is not rediscovered as news.

### 2.5 OptMem (already decided — contrast only)

- **URLs:** [VictorTaelin/OptMem](https://github.com/VictorTaelin/OptMem)
- **Store:** Append-only `LOG.txt` (fixed-width lines) + rebuildable `TREE/` summaries.
- **Retrieval:** `wake` prints a budgeted slice (recent verbatim, older compressed). `recall` is regex FTS. `zoom` expands a tree node.
- **Write path:** Agent runs `memo note`.
- **Who compresses:** The agent, on `nap`, as binary-tree merges.
- **Who acts:** The same coding agent. No ontology, no life objects.
- **Vs this product:** Already mapped: node = current picture, activity = history. Do not add an append-only memory log beside the graph.

### 2.6 Limitless (Rewind leftovers)

- **URLs:** [limitless.ai](https://www.limitless.ai/new), [Pendant FAQ](https://help.limitless.ai/en/articles/9124757-pendant-faq), [Developer API](https://www.limitless.ai/developers/docs/api), [Rewind shutdown after Meta acquisition](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)
- **FACT:** Rewind (screen/audio capture app) was shut down after a Dec 2025 Meta acquisition. Pendant sales to new customers stopped; existing Pendant customers were to be supported for at least a year, with regional cuts. Marketing pages for Pendant + API/MCP were still reachable in this research pass — treat **commercial status after mid-2026 as unverified**.
- **Store:** Lifelogs (transcripts, summaries, speakers) in a vendor cloud.
- **Retrieval:** App search; REST `GET /v1/lifelogs` with date filters and hybrid `search` (keyword + semantic); official MCP URL advertised for Claude/ChatGPT.
- **Write path:** Hardware/app capture. API/MCP in the sources reviewed is **read**. Agents do not author the life model; they query a tape.
- **Who compresses:** Vendor summaries / action-item extraction.
- **Who acts:** Reminders and Q&A in the Limitless app. MCP lets other agents *read* the day. This is **capture**, not an operated graph.
- **Vs this product:** Valuable as an optional `data.origin` feed (ref only). Fatal as the store. Do not become a wearable transcript vault.

### 2.7 Personal.ai

- **URLs:** [Platform](https://www.personal.ai/platform), [Memory](https://www.personal.ai/memory), [Memory stack docs](https://docs.personal.ai/documentation/training/memory-stack), [Digital twins essay](https://www.personal.ai/insights/ai-digital-twins-the-future-of-personal-knowledge-management)
- **Store:** “Memory stacks” of blocks from uploads, messages, and integrations, used to train/serve a personal model (PLM / SLM). Marketing: persistent digital identity.
- **Retrieval:** Stack browse in the product UI; generation conditioned on stacked memory. Public docs describe blocks and personas more than a typed life graph.
- **Write path:** User uploads and integrations. Continuous training.
- **Who compresses:** Training / retention pipeline (patents cited on the platform page, 2020–2025).
- **Who acts:** The personal model replies and can be shared. Not a multi-bot life OS.
- **Vs this product:** Identity-model / digital-twin. Adjacent in slogan, different object. Do not fine-tune a personal LLM as the graph.
- **Note:** `docs.buildpersona.ai` is a **different** “Persona” product (graph-vector hybrid with Episode / Psyche / Goal). Do not merge the two. Persona’s Goal-as-always-surfaced-intent is interesting; it is not Personal.ai.

### 2.8 Second Me

- **URLs:** [GitHub](https://github.com/mindverse/Second-Me), [secondme.io](https://www.secondme.io/), paper [AI-native Memory 2.0](https://arxiv.org/abs/2503.08102) (Mar 2025)
- **Store:** Hierarchical Memory Modeling (L0/L1/L2) compiled into **LoRA weights** on a local base model (Qwen-class), served with llama.cpp / MLX. A 2026 third-party code read ([analysis](https://github.com/lhl/agentic-memory/blob/main/ANALYSIS-second-me.md)) argues the runtime store is the adapter, not a queryable graph.
- **Retrieval:** Sample the fine-tuned model. Not `lookup` / `working_set`.
- **Write path:** Upload memories → train. Roadmap talk of continuous training and versioning.
- **Who compresses:** The training pipeline (“Me-Alignment”).
- **Who acts:** The twin chats / roleplays / optional network of twins. Weak as an actuator on the user’s real mail and calendar.
- **Vs this product:** Do not steal. Identity-in-weights is the opposite of an inspectable life graph.

### 2.9 Holon

- **URLs:** [holon.run](https://holon.run/), [GitHub](https://github.com/holon-run/holon), [Runtime model](https://github.com/holon-run/holon/blob/main/docs/website/concepts/runtime-model.md), [Work items](https://github.com/holon-run/holon/blob/main/docs/website/guides/work-items.md), [Memory](https://github.com/holon-run/holon/blob/main/docs/website/concepts/memory.md)
- **Store:** Local runtime for long-lived agents. **Work items** (objective, plan, todos, blocked-by, reconsider-by). Append-only evidence ledger + snapshots. Curated markdown under `agent_home/memory/`. Workspace files.
- **Retrieval:** `MemorySearch` / `MemoryGet`. Work-item list/get. `AGENTS.md` always loaded.
- **Write path:** Runtime writes evidence. Agent/user write home files. `CreateWorkItem` / `UpdateWorkItem` / `WaitFor` (user input, task result, external).
- **Who compresses:** Runtime derives memory from evidence, not free-form chat summaries.
- **Who acts:** The Holon agent in a local workspace (shell, patches, child agents). Wait/wake is first-class.
- **Vs this product:** Closest **act-runtime**. Not a life ontology. Steal the *shape* of blocked-by + wait/wake as something bots can represent. Do not put a coding workbench or per-agent org chart in the vault.

### 2.10 Friend.com

- **URLs:** [TechCrunch, 2026-07-30](https://techcrunch.com/2026/07/30/friend-the-lonely-ai-wearable-returns-with-a-new-voice-and-a-much-bigger-price-tag/), [The Verge, 2026-07-30](https://www.theverge.com/gadgets/973163/friend-re-launches-its-ai-pendant-with-a-speaker-that-talks-to-you-for-twice-the-price)
- **Store:** Vendor conversation memory. Press: default remember ~30 days; paid extension.
- **Retrieval / write:** Always-listening pendant → Gemini → texts and (2.0) spoken replies. Randomized locked personality.
- **Who compresses / who acts:** The companion. Acts as a friend, not on goals/projects/decisions as typed objects.
- **Vs this product:** Skip as a capability donor. Useful only as a warning: companion-without-a-world-model.

### 2.11 Rabbit

- **URLs:** [Updates changelog](https://www.rabbit.tech/updates), [DLAM / OpenClaw post](https://www.rabbit.tech/blog/first-major-update-of-2026-dlam-openclaw-and-a-surprise)
- **Store:** Device + account: recordings, journal, “creations,” personality. Not a user-inspectable life ontology in the public docs.
- **Retrieval:** Voice/agent OS on device.
- **Write path:** Voice, teach-mode, intern/creations.
- **Who compresses:** Vendor agents / summaries. **GUESS:** not documented as a typed compress.
- **Who acts:** This is the point of Rabbit. Original LAM (app APIs) shrank. 2026: **DLAM** = USB plug-in computer controller (screen share, BYOK to OpenAI/Anthropic as of rabbitOS 2.3). Also Hermes / OpenClaw / Claude Code as voice front-ends.
- **Vs this product:** Actuator, not a brain. A Foundation bot could *use* a computer-use agent. The vault should not become one.

### 2.12 Humane leftovers

- **URLs:** [Humane customer notice](https://support.humane.com/hc/en-us/articles/34374173951373-Important-Update-for-Consumer-Ai-Pin-Customers), [The Verge, 2025-02-18](https://www.theverge.com/news/614883/humane-ai-hp-acquisition-pin-shutdown)
- **FACT:** Consumer Ai Pin cloud shut down 2025-02-28 after an HP asset sale. Calling, messaging, AI, and .Center died. Remaining consumer data deleted. Offline leftovers (battery) are not a product.
- **Steal nothing.** Lesson only: a second brain that lives only in a vendor cloud dies with the vendor.

### 2.13 Heptabase (agent-native claims: yes, but PKM)

- **URLs:** [heptabase.com](https://heptabase.com/), [Changelog](https://wiki.heptabase.com/changelog), [2026-05-29 newsletter](https://wiki.heptabase.com/newsletters/2026-05-29)
- **Store:** Cards, whiteboards, tag databases, sources (PDF, images, transcripts). Human-spatial PKM.
- **Retrieval:** Fast lexical search; AI chat with attached context (active view, PDF page, tag DB).
- **Write path:** User places cards. AI Agent Mode can create/edit cards, connections, tag properties, whiteboard layout. CLI + skills for Claude Code / Codex against local data.
- **Who compresses:** User structure + optional AI organize.
- **Who acts:** On the **knowledge base** (learn, tutor, organize). Not on the user’s mail/calendar/life spine.
- **Vs this product:** Skip as a direction. Viewer-only-when-asked is the opposite of a whiteboard OS.

### 2.14 Tana (split products)

- **URLs:** [Tana (agentic meetings)](https://tana.inc/), [Agents](https://tana.inc/learn/features/agents), [MCP](https://tana.inc/learn/features/mcp), [Agent memory essay](https://tana.inc/blog/how-to-build-ai-agent-memory-with-a-knowledge-graph), [Tana Outliner](https://outliner.tana.inc/knowledge-graph)
- **FACT:** By 2026 the company ships two products. **Tana** = agentic meeting platform + typed context graph. **Tana Outliner** = the earlier supertag PKM, now renamed.
- **Store (Tana):** Permissioned context graph. Types, fields, edges. Meetings, decisions, tasks land as objects. Built-in and user-configured agents (prompt, capabilities, schedule, voice).
- **Retrieval:** Built-in chat; MCP `contextRetrieval`, `semanticSearchItems`, `getTypes`, `listEdges`, item read/write.
- **Write path:** Agents file during/after meetings as **proposals the user approves**. Re-extract updates rather than twins (company claim). External MCP agents can write back.
- **Who compresses:** Meeting extraction into typed records. Not a chat log as truth — the graph record is the claim.
- **Who acts:** Meeting-time agents with tools (GitHub, Slack, Linear, Jira, HubSpot, …). Team workspace, not a personal life vault.
- **Vs this product:** Closest **commercial** “typed graph + agents act.” Different user (team meeting vs one person’s life). Steal the *loop* (talk → typed object → approve → tool act → graph stays current). Do not steal semantic/embedding retrieval, a meeting OS, or a human outliner.

### 2.15 Flowith

- **URLs:** [flowith.io](https://flowith.io/home/), [Knowledge Garden](https://doc.flowith.io/knowledge-garden/introduction-to-flowith-knowledge-garden), [Skills and memory](https://doc.flowith.io/flowithos/skill-and-memory)
- **Store:** Canvas flows + “Knowledge Garden” (imported materials split into units) + Markdown **Skills** + persistent **Memories** (brand voice, preferences — they say not secrets).
- **Retrieval:** Auto-match garden units during a task; Pro mode uses skills/memories.
- **Write path:** Import; agent execution on a canvas; user-edited skills/memories.
- **Who compresses:** Seed/deconstruct pipeline.
- **Who acts:** FlowithOS agent (browser/OS automation, presets). Creation/execution OS, not a life graph.
- **Vs this product:** Harness/canvas competitor. Do not add a flow editor.

### 2.16 OpenAI ChatGPT memory (Dreaming V3)

- **URLs:** [Dreaming announcement](https://openai.com/index/chatgpt-memory-dreaming/), [Memory FAQ](https://help.openai.com/en/articles/8590148)
- **Store:** Saved memories + synthesized memory state. Reviewable summary page. Temporary Chat opts out.
- **Retrieval:** Injected into later chats. User can ask what is remembered. Provenance UI (book icon) claimed in help text.
- **Write path:** Chat. Background dreaming after conversations. User can add/edit/delete on the summary page.
- **Who compresses:** OpenAI’s background process (Dreaming V0 in 2025, V3 in 2026). Temporal revision (upcoming trip becomes past) is a marketed behavior.
- **Who acts:** ChatGPT in-chat (and connected apps where enabled). Not a user-owned graph.
- **Vs this product:** Policy contrast. Foundation already chose “user/agent writes the node” over “vendor dreams a summary.”

### 2.17 Anthropic memory

- **URLs:** [Managed Agents memory](https://platform.claude.com/docs/en/managed-agents/memory), [Memory stores API](https://platform.claude.com/docs/en/api/beta/memory_stores/memories/create)
- **Store (API, beta `agent-memory-2026-07-22`):** Workspace-scoped **memory stores** = small text files (path-addressed, ≤100KB), mounted at `/mnt/memory/`. Immutable versions per edit. Consumer chat memory is a separate, settings-controlled summary list (secondary sources; treat consumer UI details as **INFERENCE** from help/blog, not this repo).
- **Retrieval:** Agent file tools + list/retrieve APIs. Not a typed life ontology.
- **Write path:** Agent writes files; API create/update. Archive makes a store read-only.
- **Who compresses:** The agent (or chat-memory synthesizer on claude.ai).
- **Who acts:** Claude / Managed Agents, plus whatever tools the session has.
- **Vs this product:** Filesystem memory is Letta/Claude-shaped. Do not add `/memory` as a second store. A Foundation vault is the store.

### 2.18 Microsoft Copilot Memory + Microsoft Graph

- **URLs:** [Manage Copilot Memory](https://support.microsoft.com/en-us/microsoft-365-copilot/manage-copilot-memory-in-microsoft-365-copilot), [Copilot Studio memory](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/memory-overview), [Copilot connectors](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview), [Connectors API](https://learn.microsoft.com/en-us/graph/api/resources/connectors-api-overview?view=graph-rest-1.0)
- **Store:** Two layers. (1) **Copilot Memory** — per-user saved inferences/preferences from chat; Studio agents get a per-user folder (28-day idle delete on Studio). (2) **Microsoft Graph** — mail, calendar, files, people, plus **Copilot connectors** that index or federate external items with ACLs into the tenant graph.
- **Retrieval:** Semantic + full-text over the tenant index; permission trim. Copilot grounds answers in Graph + memories.
- **Write path:** Chat → memory. Connectors sync/federate. Graph writes are the ordinary M365 object APIs (events, messages), not “memory.”
- **Who compresses:** Microsoft pipelines (memory merge; semantic index).
- **Who acts:** Copilot in M365 (draft, schedule, search) under tenant policy.
- **Vs this product:** Graph-as-world-model at **org** scale, embedding/ACL-first, bodies live in M365. Foundation’s `data.origin` is the personal, ref-only version of “Graph stays SoT.” Do not ingest M365 bodies. Do not become tenant search.

### 2.19 Google NotebookLM (Gemini Notebook)

- **URLs:** [notebooklm.google](https://notebooklm.google/) (rename to Gemini Notebook claimed July 2026 on that page), [Audio Overview help](https://support.google.com/notebooklm/answer/16212820?hl=en)
- **Store:** Per-notebook uploaded sources. Answers are source-grounded.
- **Retrieval:** Chat with citations; Studio artifacts (audio/video overviews, reports).
- **Write path:** User uploads / Drive sources. Deep Research can add web reports as sources (product claim).
- **Who compresses:** Gemini over the notebook’s sources (audio/video hosts, summaries).
- **Who acts:** Explains and generates artifacts. Does not run the user’s life.
- **Vs this product:** Source-grounded research desk. Complementary, not a competitor for the niche.

### 2.20 LlamaIndex PropertyGraph

- **URLs:** [Property Graph Index guide](https://developers.llamaindex.ai/python/framework/module_guides/indexing/lpg_index_guide/), [Introduction post](https://www.llamaindex.ai/blog/introducing-the-property-graph-index-a-powerful-new-way-to-build-knowledge-graphs-with-llms)
- **Store:** Labeled property graph (nodes + relation types + properties), backed by Neo4j / Memgraph / in-memory / etc., usually with embeddings on nodes.
- **Retrieval:** Composable: vector context, LLM synonym, text-to-Cypher, custom walks, rerank.
- **Write path:** `kg_extractors` on chunks at index time. Direct store APIs for insert/update.
- **Who compresses:** Extractors + optional community patterns (GraphRAG-like).
- **Who acts:** Whatever agent wraps a `QueryEngineTool`. Library, not a product.
- **Vs this product:** Toolkit for “extract a KG from documents.” Foundation already has the operated graph. Do not add extract-and-embed as default write.

### 2.21 Papers (2024–2026) that change the question

| Paper | URL | Why it matters here |
| --- | --- | --- |
| Zep (2025) | https://arxiv.org/abs/2501.13956 | Temporal KG as agent memory; episode / entity / community; invalidation not overwrite. |
| AriGraph (2024, IJCAI 2025) | https://arxiv.org/abs/2407.04363 | **Knowledge-graph world model**: semantic + episodic graph updated from observations so an agent can plan, not only retrieve. Evaluated in text games. |
| A-Mem (2025) | https://arxiv.org/abs/2502.12110 | Agent-written Zettelkasten notes + links; new notes can rewrite old attributes (“memory evolution”). |
| Second Me / HMM (2025) | https://arxiv.org/abs/2503.08102 | Identity compiled into model weights. Contrast. |
| Graph-based Agent Memory survey (2026) | https://arxiv.org/abs/2602.05665 | Taxonomy: graph memory as the 2025–26 frontier vs linear/vector logs. |
| WorldDB (2026) | https://arxiv.org/abs/2604.18478 | Content-addressed nested “worlds,” edges as write-time programs (supersede / contradict / same_as). LongMemEval-s numbers claimed vs Hydra/Supermemory. |
| Agent-native memory systems (2026) | https://arxiv.org/abs/2606.24775 | Memory as data management: representation, extraction, retrieval, maintenance. **No single architecture wins all workloads.** |
| MemWM (2026) | https://arxiv.org/abs/2608.07107 | World model + memory bank of **transition rules** so next-state imagination stays fact-faithful. ALFWorld / WebShop / ScienceWorld. |

**INFERENCE:** The research frontier that matches this niche is not “better RAG.” It is **structured current state + history + (sometimes) a world model for planning**. AriGraph and MemWM are about acting in an environment. Zep/WorldDB are about not lying after facts change. A-Mem is about agent-written structure — closer to Foundation’s `upsert`/`link`, except A-Mem rewrites old notes automatically.

---

## 3. Comparison to this product

### 3.1 Already have (FACT)

| Job | Foundation surface |
| --- | --- |
| Current picture | Node + status + `data` + live edges |
| History | Activity + `undo` |
| Resolve | `lookup`, origin uniqueness, create-time duplicate preflight |
| Agenda | `working_set` (children / about-person / trip event + parent chain + due sort) |
| Ontology growth | `inspect_ontology` / `manage_type` / `manage_relation` |
| Capture | Chief of Staff recipe; `suggested_links` (proposal only) |
| Thin act | EA mail draft + calendar from `data.due`; handoff skill |
| Multi-bot shared world | One graph, one API key — not per-bot memory |

### 3.2 Capabilities still missing that would help agents **act**

Only items that help goals / people / projects / decisions. Each has a steelman **why not**.

#### A. World-action receipts (INFERENCE — highest leverage)

**Gap:** An agent can put a due on the calendar or draft mail, but the graph has no first-class “this node caused that world move” except a generic origin ref and an activity row on the *graph* write. Handoff says “done means the calendar event is gone,” but nothing in the vault can prove the event existed or was deleted.

**What to consider:** A small, typed receipt on the node or as an edge metadata: `system` + `id` + `kind` (`calendar.upsert` / `calendar.delete` / `mail.draft` / `mail.sent`) + timestamp. Still **ref only**. No body.

**Why it helps act:** The next bot can see “calendar already has this due” and not twin events; “sent” vs “drafted”; close the handoff loop without asking the user to re-narrate.

**Steelman why not:** Origin uniqueness was designed so Gmail/Calendar stay SoT. A second receipt schema becomes a baby ledger. Activity `actor_label` plus bot discipline might be enough. A new field is not a new MCP tool — but it is a graph-shape change and would need ARCHITECTURE/SPEC if done.

#### B. Outstanding obligation to a person (INFERENCE)

**Gap:** `working_set` on a person walks `about` / `relates_to`. It does not distinguish “I owe them a reply,” “they owe me a decision,” or “we promised this by Friday.” `task` + `about` can encode that **if bots always write it**. Recipes do not require it.

**What to consider:** Convention first (recipe): every promise becomes a `task` with `about` the person and `child_of` the goal/project, plus `data.due`. Optional later: a seed relation `owes` / `promised` (authored via `manage_relation` today — no new tool).

**Why it helps act:** Chief of Staff can brief “people you owe” without a PKM people-CRM. EA can draft the one message that closes the task.

**Steelman why not:** A new seed relation invites type soup (hygiene already watches this). `about` + `task` is enough if the starter prompts insist. Do not add a CRM UI.

#### C. Decision in force (INFERENCE)

**Gap:** `decision` is a seed type and may hang under area/project/goal. Status exists on every node. There is no documented convention for **in force / superseded / reversed**, and `working_set` does not prefer “the current decision on this project.”

**What to consider:** Recipe + optional `data` enum on `decision` (same pattern as `spend.stage`). Agents acting on a project should `search` / `working_set` and treat only `active` + `in_force` as binding. Supersede by status change; activity keeps the old picture.

**Why it helps act:** Stops two bots executing opposite plans. Matches Graphiti’s “invalidate, don’t delete” without copying Graphiti.

**Steelman why not:** Status + activity already express this. An enum is ontology creep. Users will ignore it unless Chief of Staff is strict.

#### D. Blocked-by / waiting-on (INFERENCE)

**Gap:** Holon work items have `blocked_by` and `WaitFor`. Foundation tasks have status and due. Nothing says “this goal is waiting on a person / a trip / an external id.” Handoff names the next *bot*, not the next *world condition*.

**What to consider:** An authored associative relation `blocked_by` (or reuse `supports` in the opposite direction with a recipe). Hygiene can report goals that are active, have no open child tasks, and have no blocker — stalled work.

**Why it helps act:** Agents stop nagging a task that cannot move. Morning brief can say “waiting on X” instead of listing it as overdue busywork.

**Steelman why not:** Easy to become a Paperclip ticket tracker. Wait/wake belongs in the **harness** (Holon, OpenClaw), not the vault. A relation that bots forget to write is worse than none.

#### E. Valid-time on associative edges (INFERENCE / steal-shape from Graphiti)

**Gap:** Edges are live or unlinked. “Worked with X” vs “works with X” is a title/payload problem. Activity on unlink is history, but point-in-time “as of June” is not a query.

**What to consider:** Optional `valid_from` / `valid_to` on edge metadata (not embeddings, not a new tool). `working_set` and `search` stay current-only unless a later SPEC asks otherwise.

**Why it helps act:** Agents stop emailing an old company, or treating an ended collaboration as current.

**Steelman why not:** Bi-temporal is a research/product sink (Zep’s whole company). Foundation already chose current picture + activity. Metadata nobody queries is clutter. Unlink + a `lesson` / `note` is the cheap version.

#### F. Conflict walk: trip vs dues vs person (GUESS, cheaper as recipe)

**Gap:** `working_set` on a `trip` already walks event-like neighbors. Agents can call it twice. There is no single “do not schedule over this trip” check.

**What to consider:** Recipe only: before EA writes a calendar event, `working_set` the relevant trip/area. Do **not** add a 15th tool.

**Steelman why not:** Even a recipe can overfit one timezone (`America/New_York` is already hardcoded for due). Capacity planning is a different product.

#### G. Capture feed as origin, not as tape (INFERENCE)

**Gap:** Limitless/Rabbit/Friend produce a day tape. Foundation will not store that tape. Agents still need a legal way to say “this task came from that lifelog” without ingesting the transcript.

**What to consider:** If a feed is ever allowed, add `pendant` / `lifelog` to the **origin system enum** (ref only) — same rule as Gmail. Filing stays `upsert` of typed nodes. No auto-extract-as-truth.

**Steelman why not:** Origin enum growth is a SPEC change. Most users will not have a pendant. Auto-file from transcripts becomes Rewind.

#### H. World-model / next-state (paper-interesting, do not add) (FACT that papers exist; INFERENCE that it is out of niche)

AriGraph and MemWM help agents **imagine** the next environment state. A life graph that stored imagined futures next to current picture would pollute SoT.

**Steelman to add a scratch type:** an authored `scenario` artifact hanging beside a goal, clearly not current. Still a PKM temptation.

**Recommendation:** Do not add. Bots can reason in context and write only the chosen `task` / `decision`.

### 3.3 Ranked for this product

| Priority | Item | Form | New MCP tool? |
| --- | --- | --- | --- |
| 1 | World-action receipts (ref only) | `data` shape or edge metadata + recipe | No |
| 2 | Person-obligation convention (`task` + `about` + due) | Prompt/skill only | No |
| 3 | Decision in-force convention | Optional field + recipe | No |
| 4 | `blocked_by` relation + stalled-goal hygiene | Ontology + hygiene recipe | No |
| 5 | Origin enum for a capture feed, if a feed exists | SPEC later | No |
| — | Valid-time on edges | Only if receipts + conventions fail | No |
| — | World-model / dreaming / embeddings / viewer | Do not add | — |

**INFERENCE:** The missing act layer is mostly **convention and receipts**, not new architecture. The 14-tool lock should stay.

---

## 4. Explicit do-not-steal

These fight the locked niche. If a future note recommends them, it is answering a different question.

| Do not steal | Why it fights |
| --- | --- |
| Embedding-first memory (Mem0, Cognee default, LlamaIndex extract, Tana `semanticSearchItems` as the brain) | Retrieval is not embeddings. Ontology is types/relations. |
| Chat-log-as-truth (Mem0 add, Graphiti episode-as-the-life, OptMem log, OpenAI/Claude/Copilot dreaming) | Memory stays policy. Node = current picture. |
| PKM editors (Heptabase whiteboards, Tana Outliner, Flowith canvas, any Today/Inbox/composer in `/view`) | Not a Momentum/Anytype/Obsidian clone. Viewer is read-only and updates only when asked. |
| Per-bot org charts in the graph | Already refused (Paperclip). Bots are harness recipes. |
| Per-bot spend caps / agent-company control plane | Already refused. `spend` is a project money line, not a bot budget. |
| Append-only compress tree as the store (OptMem) | Already refused. Activity is history. |
| Personal weights as memory (Second Me) | Not inspectable, not multi-bot, not operable. |
| Wearable tape as the product (Limitless, Friend, dead Humane) | Capture ≠ world model. Cloud tape dies (Humane). |
| Computer-use as the vault (Rabbit DLAM, FlowithOS) | Actuators belong in the harness. |
| Tenant Graph + ACL search (Microsoft Graph Copilot) | Wrong scale, wrong SoT, embeddings + body index. |
| Companion-without-objects (Friend) | No goals/people/projects/decisions to act on. |

---

## 5. So-what

An AI-native second brain, in 2026, is being built three ways:

1. **Memory layers** that make chats less forgetful (Mem0, Letta blocks, vendor dreaming, OptMem).
2. **Extracted temporal graphs** that make chats queryable as facts (Graphiti/Zep, Cognee, WorldDB).
3. **Operated world models** that agents read and write so they can do work (this product; Holon for code work; Tana for team meetings; M365 Graph for tenant work).

This product is already in bucket 3. The field does not require a new store. It requires a tighter **act loop** on the objects already in the ontology: receipts back from calendar/mail, obligations hung on people, decisions that are clearly in force, and optional blockers — all as recipes and small `data`/relation conventions, not as a 15th tool, not as embeddings, not as a viewer project.

If only one thing is filed forward: **world-action receipts, ref only**, so handoff “done” is checkable in the graph.

---

## 6. What could not be verified

- Live behavior of any third-party product (no accounts were created; marketing pages and docs can drift).
- Limitless/Pendant commercial status after the Dec 2025 Meta/Rewind shutdown — pages still described API/MCP; shipping reality for new users is unclear.
- OpenAI Dreaming V3 internals beyond the public blog/FAQ (compute claims, exact schema).
- Consumer Claude memory UI details (primary API docs were used; consumer rollout blogs disagree on dates/paths).
- Whether Tana’s “proposal before write” is actually enforced for all MCP writes.
- WorldDB / Hydra DB / Supermemory numbers (paper claims only; no independent rerun).
- Persona (`buildpersona.ai`) vs Personal.ai — confirmed different sites; Persona was not treated as in-scope beyond a footnote.
- This vault’s live graph (intentionally unread).

---

## 7. What to watch

- **Graphiti/Zep custom ontology + MCP** — if they let users *author* types the way Foundation does, they become a real niche competitor rather than a memory sidecar.
- **Tana meeting graph** — if it grows a personal (not team) vault with origin-ref discipline, it is the closest product analog.
- **Holon wait/wake** — if harnesses Foundation already names (OpenClaw, Hermes, Grok Bot) absorb WorkItem/wait, Foundation should stay the world model and not copy the runtime.
- **Vendor memory dreaming** (OpenAI V3, Claude, Copilot) — pressure to “just use ChatGPT memory.” The answer stays: that is policy memory, not the operated graph.
- **Capture APIs** (Limitless leftovers, Rabbit journal, phone OS memory) — only interesting as new `data.origin` systems.
- **Papers that treat memory as write-time programs** (WorldDB) — if edge handlers stay small (supersede / contradict), they rhyme with Foundation `link` validation; if they become a rules engine, skip.
- **A-Mem-style automatic rewrite of old nodes** — tempting, fights CAS + user-confirm-on-identity. Watch, do not adopt.

---

## 8. Source list (compact)

- This product: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/MCP_TOOLS.md`, `docs/AGENTS.md`, `docs/VIEWER.md`, `docs/HARNESS.md`, `docs/GRAPH_HYGIENE.md`, `README.md`, `prompts/*.md`, `.agents/skills/handoff/SKILL.md`
- Letta: https://docs.letta.com/guides/core-concepts/stateful-agents/ · https://docs.letta.com/guides/core-concepts/memory/context-hierarchy/ · https://docs.letta.com/concepts/memfs/
- Graphiti/Zep: https://help.getzep.com/graphiti/getting-started/overview · https://github.com/getzep/graphiti · https://arxiv.org/abs/2501.13956
- Cognee: https://docs.cognee.ai/getting-started/introduction · https://www.cognee.ai/how-cognee-builds-ai-memory
- Mem0: https://docs.mem0.ai/core-concepts/how-it-works · https://github.com/mem0ai/mem0
- OptMem: https://github.com/VictorTaelin/OptMem
- Limitless: https://www.limitless.ai/developers/docs/api · https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/
- Personal.ai: https://www.personal.ai/platform · https://docs.personal.ai/documentation/training/memory-stack
- Second Me: https://github.com/mindverse/Second-Me · https://arxiv.org/abs/2503.08102
- Holon: https://holon.run/ · https://github.com/holon-run/holon
- Friend: https://techcrunch.com/2026/07/30/friend-the-lonely-ai-wearable-returns-with-a-new-voice-and-a-much-bigger-price-tag/
- Rabbit: https://www.rabbit.tech/updates · https://www.rabbit.tech/blog/first-major-update-of-2026-dlam-openclaw-and-a-surprise
- Humane: https://support.humane.com/hc/en-us/articles/34374173951373-Important-Update-for-Consumer-Ai-Pin-Customers
- Heptabase: https://wiki.heptabase.com/changelog · https://heptabase.com/
- Tana: https://tana.inc/ · https://tana.inc/learn/features/mcp
- Flowith: https://doc.flowith.io/knowledge-garden/introduction-to-flowith-knowledge-garden
- OpenAI: https://openai.com/index/chatgpt-memory-dreaming/ · https://help.openai.com/en/articles/8590148
- Anthropic: https://platform.claude.com/docs/en/managed-agents/memory
- Microsoft: https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview · https://support.microsoft.com/en-us/microsoft-365-copilot/manage-copilot-memory-in-microsoft-365-copilot
- NotebookLM: https://notebooklm.google/ · https://support.google.com/notebooklm/answer/16212820
- LlamaIndex: https://developers.llamaindex.ai/python/framework/module_guides/indexing/lpg_index_guide/
- Papers: https://arxiv.org/abs/2407.04363 · https://arxiv.org/abs/2502.12110 · https://arxiv.org/abs/2602.05665 · https://arxiv.org/abs/2604.18478 · https://arxiv.org/abs/2606.24775 · https://arxiv.org/abs/2608.07107
