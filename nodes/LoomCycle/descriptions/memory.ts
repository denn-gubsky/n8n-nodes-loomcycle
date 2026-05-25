import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `memory` resource. Six ops covering
 * read + write CRUD against the substrate's memory subsystem:
 *   - List Scopes      → listMemoryScopes
 *   - List Scope IDs   → listMemoryScopeIDs
 *   - List Entries     → listMemoryEntries
 *   - Get Entry        → getMemoryEntry
 *   - Set Entry        → setMemoryEntry        (v0.11.5 — added in n8n 1.2.0)
 *   - Delete Entry     → deleteMemoryEntry     (v0.11.5 — added in n8n 1.2.0)
 *
 * Set / Delete were previously deferred (the demo proposal noted that
 * memory writes "await the @loomcycle/client adapter to expose them").
 * @loomcycle/client v0.11.5 shipped both via `POST /v1/_memory/{scope}/
 * {scope_id}/{key}` (PUT-semantic upsert) and `DELETE` on the same path.
 *
 * Set is idempotent (re-writes overwrite). The optional `embed=true`
 * flag triggers a synchronous embedding via the operator-configured
 * embedder; the response's `embedded` flag + optional `embed_warning`
 * report whether the embedding actually landed (graceful degradation
 * when no embedder is configured).
 *
 * Op options array is alphabetised by name.
 */
export const memoryOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['memory'] } },
		options: [
			{
				name: 'Delete Entry',
				value: 'deleteEntry',
				description: 'Delete one memory entry by (scope, scope_id, key). Idempotent.',
				action: 'Delete a memory entry',
			},
			{
				name: 'Get Entry',
				value: 'getEntry',
				description: 'Get a single memory entry by (scope, scope_id, key)',
				action: 'Get a memory entry',
			},
			{
				name: 'List Entries',
				value: 'listEntries',
				description: 'List entries for a (scope, scope_id) pair with optional prefix + limit',
				action: 'List memory entries',
			},
			{
				name: 'List Scope IDs',
				value: 'listScopeIDs',
				description: 'List the scope_ids known for a given scope, with row counts',
				action: 'List memory scope ids',
			},
			{
				name: 'List Scopes',
				value: 'listScopes',
				description: 'List the scope kinds known to the substrate (e.g. agent, user)',
				action: 'List memory scopes',
			},
			{
				name: 'Set Entry',
				value: 'setEntry',
				description: 'Upsert one memory entry by (scope, scope_id, key). Idempotent — re-writes overwrite.',
				action: 'Set a memory entry',
			},
		],
		default: 'listScopes',
	},

	// ---- Scope (used by List Scope IDs / List Entries / Get / Set / Delete) ----
	{
		displayName: 'Scope Name or ID',
		name: 'scope',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadMemoryScopes' },
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['memory'], operation: ['listScopeIDs', 'listEntries', 'getEntry', 'setEntry', 'deleteEntry'] },
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ---- Scope ID (used by List Entries / Get / Set / Delete) ----
	{
		displayName: 'Scope ID',
		name: 'scopeID',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['memory'], operation: ['listEntries', 'getEntry', 'setEntry', 'deleteEntry'] },
		},
		description: 'Identifier within the scope (e.g. an agent_id when scope=agent, or a user_id when scope=user)',
	},

	// ---- List Entries options ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['memory'], operation: ['listEntries'] } },
		options: [
			{
				displayName: 'Key Prefix',
				name: 'prefix',
				type: 'string',
				default: '',
				description: 'Return only entries whose key starts with this prefix',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Max number of results to return',
			},
		],
	},

	// ---- Key (used by Get / Set / Delete) ----
	{
		displayName: 'Key',
		name: 'key',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['memory'], operation: ['getEntry', 'setEntry', 'deleteEntry'] } },
		description: 'Entry key to fetch / write / delete',
	},

	// ---- Set Entry: value (required) + embed / ttl_seconds (optional) ----
	{
		displayName: 'Value',
		name: 'value',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['memory'], operation: ['setEntry'] } },
		description: 'Opaque JSON value to upsert. The substrate stores it verbatim — read back via Get Entry returns this same value.',
	},
	{
		displayName: 'Set Options',
		name: 'setOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['memory'], operation: ['setEntry'] } },
		options: [
			{
				displayName: 'Compute Embedding',
				name: 'embed',
				type: 'boolean',
				default: false,
				description:
					'Whether to synchronously compute + store an embedding via the operator-configured embedder. Response reports whether the embedding actually landed; the k/v row always lands either way.',
			},
			{
				displayName: 'TTL Seconds',
				name: 'ttlSeconds',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Optional TTL in seconds. 0 = no expiry (default).',
			},
		],
	},
];
