import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `memoryBackendDef` resource — pluggable
 * memory-backend admin (RFC I, loomcycle v0.15). Defines a named memory
 * backend (in-process default or an external Mem9-style REST store + ranker)
 * that agents' Memory tool dispatches to. 5 ops mapping to
 * `client.memoryBackendDef({op})`:
 *
 *   - Create / Fork / Get / List Versions / Retire
 *
 * Generic op-discriminated def-admin: the backend body rides in the overlay
 * JSON, so this reuses the shared buildSubstrateInput path (same as AgentDef).
 * Endpoint auth uses env-var / credential references — never a plaintext token.
 *
 * Op options array is alphabetised by name.
 */
export const memoryBackendDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['memoryBackendDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register a new named memory backend',
				action: 'Create a memory backend definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork a memory backend definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get a memory backend definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List memory backend definition versions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire a memory backend definition',
			},
		],
		default: 'list',
	},

	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['memoryBackendDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description: 'Memory backend definition name — how agents / memory_backend overlays reference this store',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['memoryBackendDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['memoryBackendDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['memoryBackendDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version',
	},
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['memoryBackendDef'], operation: ['create', 'fork'] } },
		description:
			'The backend definition as JSON — keys like `kind` (e.g. `in_process` / `rest`), `endpoint`, `auth` (env-var / credential reference), and ranker config (semantic + recency weights). For Fork this is the diff merged onto the parent. Use env-var references for secrets — plaintext never travels this wire path.',
	},
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['memoryBackendDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately',
	},
];
