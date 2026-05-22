import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `memory` resource. **Read-only in this
 * sub-phase** — the `@loomcycle/client` adapter exposes 4 read methods:
 *   - List Scopes      → listMemoryScopes
 *   - List Scope IDs   → listMemoryScopeIDs
 *   - List Entries     → listMemoryEntries
 *   - Get              → getMemoryEntry
 *
 * Set / Delete / Search are intentionally deferred: the substrate's
 * Memory writes go through the in-band Memory tool (called from inside
 * an agent run), not via admin HTTP. Exposing them from this node would
 * require either (a) new adapter methods + new admin endpoints on the
 * loomcycle side, or (b) routing through a one-shot agent — option (b)
 * was the pre-v0.9.2 Channel-Subscribe workaround we explicitly chose
 * NOT to repeat. Once option (a) lands upstream, these ops join here.
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
		],
		default: 'listScopes',
	},

	// ---- Scope (used by List Scope IDs / List Entries / Get) ----
	{
		displayName: 'Scope Name or ID',
		name: 'scope',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadMemoryScopes' },
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['memory'], operation: ['listScopeIDs', 'listEntries', 'getEntry'] },
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ---- Scope ID (used by List Entries / Get) ----
	{
		displayName: 'Scope ID',
		name: 'scopeID',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['memory'], operation: ['listEntries', 'getEntry'] },
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

	// ---- Key (used by Get) ----
	{
		displayName: 'Key',
		name: 'key',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['memory'], operation: ['getEntry'] } },
		description: 'Entry key to fetch',
	},
];
