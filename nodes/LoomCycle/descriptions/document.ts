import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `document` resource — loomcycle's
 * chunked-graph Document store (RFC AK, extended by RFC BS / BO / CE).
 * Op-discriminated, mapped to `client.document(...)`.
 *
 * A Document is a tree of typed CHUNKS: the document row carries identity and
 * a root chunk; every unit of content is a chunk with a body, a type, tags and
 * a position under its parent. Chunks may also link across documents, so the
 * store is a graph, not just a tree.
 *
 * **Requires SQL Memory on the sidecar** (`LOOMCYCLE_SQLMEM_ENABLED=1`); every
 * op refuses without it. `scope: tenant` additionally needs the operator to
 * have granted BOTH `memory_scopes` and `sql_scopes` with `tenant`.
 *
 * The RFC CC fact tier (remember / list_facts / judge_fact / …) lives on the
 * separate **LoomCycle Fact** node — same wire method, different audience.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const documentOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{
				name: 'Add Tags',
				value: 'add_tags',
				description: 'Add tags to a chunk (a delta — leaves existing tags in place)',
				action: 'Add tags to a chunk',
			},
			{
				name: 'Backlinks',
				value: 'backlinks',
				description: 'List chunks that link TO this chunk (RFC BS)',
				action: 'Get backlinks for a chunk',
			},
			{
				name: 'Create Chunk',
				value: 'create_chunk',
				description: 'Create a chunk under a parent, with a body / type / tags',
				action: 'Create a chunk',
			},
			{
				name: 'Create Document',
				value: 'create_document',
				description: 'Create a document (optionally naming it in the Path tree); returns its ID plus the root chunk ID',
				action: 'Create a document',
			},
			{
				name: 'Define Type',
				value: 'define_type',
				description: 'Declare a chunk type with its field schema',
				action: 'Define a chunk type',
			},
			{
				name: 'Delete Chunk',
				value: 'delete_chunk',
				description: 'Delete a chunk and its descendants (refuses a document root — use Delete Document)',
				action: 'Delete a chunk',
			},
			{
				name: 'Delete Document',
				value: 'delete_document',
				description: 'Delete a document, its chunks and its edges in one transaction',
				action: 'Delete a document',
			},
			{
				name: 'Diff Remote',
				value: 'diff_remote',
				description: 'Dry run: what a pull or push against the bound peer would change, without touching either side (RFC CE)',
				action: 'Diff a document against its remote',
			},
			{
				name: 'Diff Revisions',
				value: 'diff',
				description: 'Unified diff of a chunk body between two revisions (RFC BS)',
				action: 'Diff two chunk revisions',
			},
			{
				name: 'Documents Summary',
				value: 'documents_summary',
				description: 'Roll-up of the documents in scope (counts, titles) without fetching chunks',
				action: 'Summarise documents',
			},
			{
				name: 'Export Canvas',
				value: 'export_canvas',
				description: 'Export the chunk graph as JSON Canvas (the format Obsidian Canvas uses)',
				action: 'Export a document as canvas',
			},
			{
				name: 'Export Markdown',
				value: 'export_md',
				description: 'Render a document to Markdown (round-trippable by default; clean prose with metadata off)',
				action: 'Export a document as markdown',
			},
			{
				name: 'Get Asset',
				value: 'get_asset',
				description: 'Fetch an image chunk\'s stored asset metadata (RFC BO)',
				action: 'Get a chunk asset',
			},
			{
				name: 'Get Chunk',
				value: 'get_chunk',
				description: 'Fetch one chunk by ID, including its current revision',
				action: 'Get a chunk',
			},
			{
				name: 'Get Document',
				value: 'get_document',
				description: 'Fetch a document by ID or by its Path-tree path',
				action: 'Get a document',
			},
			{
				name: 'Get Edges',
				value: 'get_edges',
				description: 'List the edges attached to a chunk, optionally filtered by kind (RFC BS)',
				action: 'Get chunk edges',
			},
			{
				name: 'Get Version',
				value: 'get_version',
				description: 'Fetch one historical revision of a chunk body (RFC BS)',
				action: 'Get a chunk revision',
			},
			{
				name: 'History',
				value: 'history',
				description: 'List the body-change history of a chunk (RFC BS)',
				action: 'Get chunk history',
			},
			{
				name: 'Import Canvas',
				value: 'import_canvas',
				description: 'Build a document from a JSON Canvas node/edge graph',
				action: 'Import a canvas',
			},
			{
				name: 'Import Markdown',
				value: 'import_md',
				description: 'Build a document from export_md-shaped Markdown (headings become hierarchy)',
				action: 'Import markdown',
			},
			{
				name: 'Link Chunks',
				value: 'link_chunks',
				description: 'Create an edge between two chunks (cross-document allowed; both must exist)',
				action: 'Link two chunks',
			},
			{
				name: 'List Tags',
				value: 'list_tags',
				description: 'List the tags in use, with counts (RFC BS)',
				action: 'List tags',
			},
			{
				name: 'List Types',
				value: 'list_types',
				description: 'List the declared chunk types',
				action: 'List chunk types',
			},
			{
				name: 'Move Chunk',
				value: 'move_chunk',
				description: 'Re-parent a chunk (cycle-guarded: a move making a chunk its own ancestor is refused)',
				action: 'Move a chunk',
			},
			{
				name: 'Query Chunks',
				value: 'query_chunks',
				description: 'Filter chunks by document / type / status / tag / path, or via a read-only SQL escape hatch',
				action: 'Query chunks',
			},
			{
				name: 'Query Documents',
				value: 'query_documents',
				description: 'Filter documents by tag / title',
				action: 'Query documents',
			},
			{
				name: 'Related',
				value: 'related',
				description: 'Vector-related chunks — semantically near this one (RFC BS)',
				action: 'Get related chunks',
			},
			{
				name: 'Remove Tags',
				value: 'remove_tags',
				description: 'Remove tags from a chunk (a delta — leaves the others in place)',
				action: 'Remove tags from a chunk',
			},
			{
				name: 'Reorder Chunk',
				value: 'reorder_chunk',
				description: 'Change a chunk\'s sibling position under its current parent',
				action: 'Reorder a chunk',
			},
			{
				name: 'Set Asset',
				value: 'set_asset',
				description: 'Attach binary image bytes to a chunk (RFC BO)',
				action: 'Set a chunk asset',
			},
			{
				name: 'Set Path',
				value: 'set_path',
				description: 'Attach or re-home a document\'s name in the Path tree',
				action: 'Set a document path',
			},
			{
				name: 'Set Remote',
				value: 'set_remote',
				description: 'Bind this document to a peer loomcycle document source for sync (RFC CE)',
				action: 'Bind a document to a remote',
			},
			{
				name: 'Sync',
				value: 'sync',
				description: 'Reconcile keyed chunks with the bound peer — pull (default) or push (RFC CE)',
				action: 'Sync a document with its remote',
			},
			{
				name: 'Unlink Chunks',
				value: 'unlink_chunks',
				description: 'Remove an edge between two chunks',
				action: 'Unlink two chunks',
			},
			{
				name: 'Update Chunk',
				value: 'update_chunk',
				description: 'Update a chunk body / title / fields. Pass Revision for optimistic concurrency.',
				action: 'Update a chunk',
			},
		],
		default: 'documents_summary',
	},

	// ---- Scope: every op ----
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'user',
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{ name: 'Agent', value: 'agent' },
			{ name: 'User', value: 'user' },
			{ name: 'Tenant (Shared)', value: 'tenant' },
		],
		description:
			'Which store to address. `user` keys on the authenticated principal\'s subject; `tenant` is shared and additionally requires the operator to have granted BOTH memory_scopes and sql_scopes with `tenant`. Resolved server-side from the bearer — a routing hint, not an authority grant.',
	},

	// ---- ID: chunk-or-document identifier, per op ----
	{
		displayName: 'ID',
		name: 'id',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: [
					'get_document',
					'delete_document',
					'get_chunk',
					'update_chunk',
					'delete_chunk',
					'move_chunk',
					'reorder_chunk',
					'add_tags',
					'remove_tags',
					'set_asset',
					'get_asset',
					'history',
					'get_version',
					'diff',
					'backlinks',
					'related',
					'unlinked_mentions',
					'set_path',
					'set_remote',
					'sync',
					'diff_remote',
					'export_md',
					'export_canvas',
				],
			},
		},
		description: 'The target ID — a DOCUMENT ID for Get / Delete Document, Set Path, Export, Set Remote, Sync and Diff Remote; a CHUNK ID for every chunk-level op. Get Document also accepts a Path instead.',
	},

	// ---- Path: create / address a document by name ----
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		default: '',
		placeholder: '/docs/launch',
		displayOptions: {
			show: { resource: ['document'], operation: ['create_document', 'get_document', 'set_path'] },
		},
		description:
			'Path-tree name for the document (e.g. /docs/launch). On Create Document this names the new document; on Get Document it is an alternative to ID; on Set Path it is the new name. Requires the Path VFS (loomcycle ≥ v1.4).',
	},

	// ---- Title ----
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['document'], operation: ['create_document', 'create_chunk', 'update_chunk'] },
		},
		description: 'Human-readable title. Required in practice for a document; for a chunk it is what graph recall and `[[name]]` links match against.',
	},

	// ---- Document ID: chunk ops that scope to a document ----
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['create_chunk', 'query_chunks', 'import_md', 'import_canvas', 'list_tags'],
			},
		},
		description: 'The document these chunks belong to. On Import Markdown / Import Canvas, omit to create a NEW document; supply it to import under an existing one.',
	},

	// ---- Parent / new parent ----
	{
		displayName: 'Parent Chunk ID',
		name: 'parentId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['create_chunk', 'import_md'] } },
		description: 'Chunk to nest under. Omit on Create Chunk to attach to the document root.',
	},
	{
		displayName: 'New Parent Chunk ID',
		name: 'newParentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['move_chunk'] } },
		description: 'Chunk to re-parent under. A move that would make the chunk its own ancestor is refused.',
	},

	// ---- Body ----
	{
		displayName: 'Body',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['create_chunk', 'update_chunk'] } },
		description:
			'Markdown body. `[[name]]` becomes a references edge (re-derived on every write, resolved through the Path tree); `![[target]]` transcludes at export time. Bodies are embedded on write when the chunk type supports it (RFC BU), which is what makes Memory → Search find them.',
	},

	// ---- Type ----
	{
		displayName: 'Chunk Type',
		name: 'type',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['document'], operation: ['create_chunk', 'update_chunk', 'query_chunks', 'define_type'] },
		},
		description: 'Chunk type, e.g. `decision` / `requirement` / `mermaid` / `image`. Type drives how the body is embedded (RFC BU) and how retrieval expands subtypes.',
	},

	// ---- Status ----
	{
		displayName: 'Status',
		name: 'status',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['document'], operation: ['create_chunk', 'update_chunk', 'query_chunks'] },
		},
		description: 'Free-form chunk status, e.g. `open` / `done`. A TeamDef run bound to a chunk task board writes the current team state here (RFC BT).',
	},

	// ---- Tags (replace-set vs delta) ----
	{
		displayName: 'Tags (Comma-Separated)',
		name: 'tags',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['create_document', 'create_chunk', 'update_chunk', 'add_tags', 'remove_tags'],
			},
		},
		description:
			'Nested tags use `/` (e.g. `area/backend`). On Create / Update this REPLACE-SETS the whole tag set — leave empty to leave tags unchanged, and note that clearing them requires Remove Tags. On Add / Remove Tags it is the delta.',
	},
	{
		displayName: 'Tag',
		name: 'tag',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['query_chunks', 'query_documents'] } },
		description: 'Match an exact tag',
	},
	{
		displayName: 'Tag Prefix',
		name: 'tagPrefix',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['query_chunks'] } },
		description: 'Match a tag or anything nested under it (e.g. `area` matches `area/backend`)',
	},

	// ---- Position / revisions ----
	{
		displayName: 'Position',
		name: 'position',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['document'], operation: ['reorder_chunk'] } },
		description: 'Zero-based sibling position under the current parent',
	},
	{
		displayName: 'Revision',
		name: 'revision',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['document'], operation: ['update_chunk', 'get_version'] } },
		description:
			'On Update Chunk this is OPTIMISTIC CONCURRENCY: pass the chunk\'s current revision and the write is a guarded atomic bump — a stale value returns a conflict instead of silently losing the other writer\'s edit. 0 = omit the guard. On Get Version it selects which historical revision to read.',
	},
	{
		displayName: 'From Revision',
		name: 'fromRevision',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['document'], operation: ['diff'] } },
		description: 'Older revision of the pair to diff',
	},
	{
		displayName: 'To Revision',
		name: 'toRevision',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['document'], operation: ['diff'] } },
		description: 'Newer revision of the pair to diff',
	},

	// ---- Edges ----
	{
		displayName: 'From Chunk ID',
		name: 'fromId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['link_chunks', 'unlink_chunks'] } },
		description: 'Edge source chunk. Cross-document edges are allowed — both endpoints just have to exist.',
	},
	{
		displayName: 'To Chunk ID',
		name: 'toId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['link_chunks', 'unlink_chunks'] } },
		description: 'Edge target chunk',
	},
	{
		displayName: 'Edge Kind',
		name: 'kind',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['document'], operation: ['link_chunks', 'unlink_chunks', 'get_edges'] },
		},
		description: 'Edge label, e.g. `depends_on` / `references`. On Get Edges, empty = every kind. Auto `[[name]]` edges use `references` and are regenerated from bodies, so they are not worth hand-managing.',
	},

	// ---- Query filters ----
	{
		displayName: 'Under Path',
		name: 'underPath',
		type: 'string',
		default: '',
		placeholder: '/docs',
		displayOptions: { show: { resource: ['document'], operation: ['query_chunks'] } },
		description: 'Restrict to chunks of documents at or under this Path-tree path',
	},
	{
		displayName: 'SQL',
		name: 'sql',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['query_chunks'] } },
		description:
			'Escape hatch: a raw read-only SELECT against the chunk tables, gated by the SQL Memory statement validator (no ATTACH / PRAGMA / multi-statement / writes). Use the structured filters above unless you need a join they cannot express.',
	},
	{
		displayName: 'Title Contains',
		name: 'titleContains',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['document'], operation: ['query_documents'] } },
		description: 'Case-insensitive substring match on the document title',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['query_chunks', 'query_documents', 'documents_summary', 'history', 'backlinks', 'related', 'unlinked_mentions'],
			},
		},
		description: 'Max number of results to return',
	},

	// ---- Types ----
	{
		displayName: 'Type Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['define_type'] } },
		description: 'Name of the chunk type to declare',
	},
	{
		displayName: 'Fields (JSON)',
		name: 'fields',
		type: 'json',
		default: '{}',
		displayOptions: {
			show: { resource: ['document'], operation: ['create_chunk', 'update_chunk', 'define_type'] },
		},
		description:
			'Structured fields as a JSON object. On Define Type this is the field schema; on a chunk it is the per-chunk values. Note that a value hidden in here is NOT queryable — tags have their own join tables precisely because a tag buried in `fields` could never be filtered on.',
	},

	// ---- Markdown / canvas IO ----
	{
		displayName: 'Include Metadata',
		name: 'includeMetadata',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['document'], operation: ['export_md'] } },
		description:
			'Whether to embed round-trippable metadata + edges as HTML comments so Import Markdown can rebuild the graph. Turn OFF for clean human-facing Markdown, which does NOT round-trip.',
	},
	{
		displayName: 'Markdown',
		name: 'markdown',
		type: 'string',
		typeOptions: { rows: 8 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['import_md'] } },
		description:
			'Markdown shaped the way Export Markdown emits it: headings become the chunk hierarchy, a `&lt;!-- loom: … --&gt;` comment carries chunk metadata and a `&lt;!-- loom-edges: … --&gt;` trailer carries edges. Fenced code blocks are not read as structure.',
	},
	{
		displayName: 'Canvas (JSON)',
		name: 'canvas',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['import_canvas'] } },
		description: 'A JSON Canvas node/edge graph — the shape Export Canvas emits',
	},

	// ---- Assets (RFC BO) ----
	{
		displayName: 'Asset Binary Property',
		name: 'assetBinaryProperty',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['set_asset'] } },
		description:
			'Binary property on the input item holding the image bytes. The node base64-encodes it and sends the media type alongside. Read an asset back as n8n binary with Get Asset.',
	},

	// ---- Federation (RFC CE) ----
	{
		displayName: 'Source Name',
		name: 'source',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['set_remote'] } },
		description:
			'Name of the peer document source to bind to. Resolved tenant substrate first (a DocumentSourceDef — see the LoomCycle Document Source node), then static `document_sources:` yaml, then the shared substrate.',
	},
	{
		displayName: 'Remote Ref',
		name: 'remoteRef',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['set_remote'] } },
		description: 'Identifier of the peer document this one is bound to',
	},
	{
		displayName: 'Direction',
		name: 'direction',
		type: 'options',
		default: 'pull',
		displayOptions: { show: { resource: ['document'], operation: ['sync'] } },
		options: [
			{ name: 'Pull (Peer → Local)', value: 'pull' },
			{ name: 'Push (Local → Peer)', value: 'push' },
		],
		description:
			'Which way keyed chunks reconcile. Sync matches on `natural_key` and carries body, tags, hierarchy and manual links; a diverged body is overwritten in place with the old body kept in the LOSING side\'s history. Chunks without a natural_key are excluded and counted. Run Diff Remote first to see what would change.',
	},
];
