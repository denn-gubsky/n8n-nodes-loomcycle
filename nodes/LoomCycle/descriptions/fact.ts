import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `fact` resource — the RFC CC verified-writes
 * tier of loomcycle's Document store (loomcycle ≥ v1.54; the entity tier itself
 * from v1.42, `remember` + `judged_by` from v1.55).
 *
 * Same wire method as the Document node (`client.document(...)`), split out
 * because the audience differs: a Document op edits structure, a Fact op makes
 * or checks a CLAIM ABOUT A SUBJECT. What separates the two on the wire is that
 * a fact carries a `subject` + `type`; a document chunk carries neither, and
 * that is how the ontology gate tells them apart.
 *
 * The invariant worth understanding before using this node: a fact stores the
 * exact `source_quote` span it was drawn from, and a write-time judge checks the
 * claim against that span. A fact that fails is **withheld, not deleted** — it
 * disappears from List Facts / Graph Recall unless you pass Include Refuted.
 * `judged_at` / `judged_by` are server-stamped with NO wire field, because a
 * caller able to record "an operator decided this" could launder a machine
 * verdict into a human one.
 *
 * **Requires SQL Memory** (`LOOMCYCLE_SQLMEM_ENABLED=1`).
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const factOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['fact'] } },
		options: [
			{
				name: 'Graph Recall',
				value: 'graph_recall',
				description: 'Walk the entity graph from chunks matching a query; returns facts and their relations',
				action: 'Recall facts from the graph',
			},
			{
				name: 'Judge Fact',
				value: 'judge_fact',
				description: 'Record a verdict on whether a fact is supported by its own source span',
				action: 'Judge a fact',
			},
			{
				name: 'List Facts',
				value: 'list_facts',
				description: 'List facts about a subject / of a type. Refuted facts are withheld unless Include Refuted is on.',
				action: 'List facts',
			},
			{
				name: 'Propose Entity',
				value: 'propose_entity',
				description: 'Propose a new entity type for the tenant ontology (proposals are inert until an operator accepts)',
				action: 'Propose an entity type',
			},
			{
				name: 'Remember',
				value: 'remember',
				description: 'Store a statement a person supplied as a fact citing ITSELF. Additive only — there is no forget.',
				action: 'Remember a statement',
			},
			{
				name: 'Search',
				value: 'search',
				description: 'Semantic search over chunk bodies in this scope',
				action: 'Search chunk bodies',
			},
			{
				name: 'Supersede Fact',
				value: 'supersede_chunk',
				description: 'Replace a fact with a corrected one, keeping the original as history (supersede, never delete)',
				action: 'Supersede a fact',
			},
			{
				name: 'Upsert Fact',
				value: 'upsert_chunk',
				description: 'Create or update a fact keyed by natural_key — upserting twice with the same key updates ONE chunk',
				action: 'Upsert a fact',
			},
			{
				name: 'Verbatim Answer',
				value: 'verbatim_answer',
				description: 'Answer a question with a verified fact, quoted from its source span',
				action: 'Get a verbatim answer',
			},
			{
				name: 'Verification Stats',
				value: 'verification_stats',
				description: 'Verdict coverage for this scope — how much of what is stored has actually been checked',
				action: 'Get verification stats',
			},
		],
		default: 'list_facts',
	},

	// ---- Scope: every op ----
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'user',
		displayOptions: { show: { resource: ['fact'] } },
		options: [
			{ name: 'Agent', value: 'agent' },
			{ name: 'User', value: 'user' },
			{ name: 'Tenant (Shared)', value: 'tenant' },
		],
		description:
			'Which store to address. `tenant` additionally requires the operator to have granted BOTH memory_scopes and sql_scopes with `tenant`. Note the tenant ONTOLOGY is operator-curated: against it an agent-surface caller may only Propose Entity — update / delete / move / import are refused.',
	},

	// ---- Subject + type: what makes a fact a fact ----
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['fact'],
				operation: ['upsert_chunk', 'list_facts', 'remember', 'propose_entity'],
			},
		},
		description:
			'The entity this fact is ABOUT. A fact carries a subject + type; a plain document chunk carries neither — that is how the ontology gate distinguishes them.',
	},
	{
		displayName: 'Entity Type',
		name: 'type',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['fact'],
				operation: ['upsert_chunk', 'list_facts', 'remember', 'propose_entity'],
			},
		},
		description:
			'The entity type, e.g. `person` / `project`. Retrieval expands confirmed subtypes downward, so querying a parent type also returns its children. `preference` and `fact` are pinned as ontology roots and refused as entity types — they would become a magnet node every fact attached to.',
	},

	// ---- Upsert / supersede: the claim + its evidence ----
	{
		displayName: 'Natural Key',
		name: 'naturalKey',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['fact'], operation: ['upsert_chunk', 'judge_fact'] },
		},
		description:
			'Stable identity for the fact. Upserting twice with the same key updates ONE chunk instead of accumulating duplicates. On Judge Fact it is an alternative to Chunk ID.',
	},
	{
		displayName: 'Body',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: { show: { resource: ['fact'], operation: ['upsert_chunk'] } },
		description: 'The claim itself',
	},
	{
		displayName: 'Source Quote',
		name: 'sourceQuote',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: { show: { resource: ['fact'], operation: ['upsert_chunk'] } },
		description:
			'The exact span of source text the claim was drawn from. This is what the write-time judge checks the claim against, so a fact written without one cannot be verified — and from loomcycle v1.55.1 only an OPERATOR may vouch for a span-less fact, never an agent.',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['fact'], operation: ['upsert_chunk'] } },
		description: 'Short label for the fact — what graph recall matches titles against',
	},
	{
		// REQUIRED, verified against a live loomcycle v1.55: an upsert without it
		// is refused with `create_chunk: missing required field: document_id`.
		// A fact is still a chunk, so it has to live in a document.
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['upsert_chunk'] } },
		description: 'Document to file the fact under. Required — a fact is a chunk, so it must live in a document.',
	},

	// ---- Supersede: TWO ids. Verified live — the substrate refuses each in
	// turn if absent ("missing required field: supersedes_id (the chunk being
	// retired)", then "missing required field: id (the REPLACEMENT chunk)").
	// Supersede is a pure link between two existing chunks: write the corrected
	// fact first with Upsert Fact, then point this at both. ----
	{
		displayName: 'Replacement Chunk ID',
		name: 'id',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['supersede_chunk'] } },
		description:
			'The NEW chunk that replaces the old one — create it first with Upsert Fact and pass the ID it returns. Supersede only links the pair; it does not accept a body.',
	},
	{
		displayName: 'Supersedes Chunk ID',
		name: 'supersedesId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['supersede_chunk'] } },
		description:
			'The OLD chunk being retired. It is not deleted — it stays queryable so a question about an earlier point in time still has an answer.',
	},
	{
		displayName: 'Chunk ID',
		name: 'judgeId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['fact'], operation: ['judge_fact'] } },
		description: 'The fact being judged. You may pass Natural Key instead.',
	},

	// ---- Judge ----
	{
		displayName: 'Verdict',
		name: 'verdict',
		type: 'options',
		default: 'supported',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['judge_fact'] } },
		options: [
			{ name: 'Supported', value: 'supported', description: 'The source span supports the claim' },
			{ name: 'Unclear', value: 'unclear', description: 'The span is ambiguous about the claim' },
			{ name: 'Unsupported', value: 'unsupported', description: 'The span does not support the claim — the fact is withheld from reads' },
			{ name: 'Mistyped', value: 'mistyped', description: 'The span supports the claim, but it is filed as the wrong kind of thing' },
		],
		description:
			'The verdict to record. Confidence is derived server-side, not supplied. `mistyped` is unavailable for a fact with no span. An `unsupported` fact is retained but withheld from List Facts / Graph Recall.',
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['judge_fact'] } },
		description: 'Why this verdict — required by the substrate, so a verdict always carries its justification',
	},

	// ---- Remember ----
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['remember'] } },
		description:
			'A statement a person supplied. It is stored as a fact that CITES ITSELF — the text is both the claim and its own source span, filed as evidential. Additive only: there is no forget, so corrections go through Supersede Fact.',
	},

	// ---- Query / recall ----
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['fact'], operation: ['graph_recall', 'verbatim_answer', 'search'] } },
		description: 'On Graph Recall this finds the starting chunks by title; on Verbatim Answer it is the lookup question; on Search it is matched against chunk bodies semantically',
	},
	{
		displayName: 'Include Refuted',
		name: 'includeRefuted',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['fact'], operation: ['list_facts', 'graph_recall'] } },
		description:
			'Whether to also return facts a judge marked unsupported. They are retained but withheld by default — turn this on to audit what failed verification rather than to consume it as truth.',
	},
	{
		displayName: 'Min Score',
		name: 'minScore',
		type: 'number',
		default: 0.6,
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		displayOptions: { show: { resource: ['fact'], operation: ['verbatim_answer'] } },
		description: 'Cosine similarity floor for accepting a fact as the answer. Below it, the op prefers to return nothing over guessing.',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['fact'], operation: ['list_facts', 'graph_recall', 'search'] },
		},
		description: 'Max number of results to return',
	},
];
