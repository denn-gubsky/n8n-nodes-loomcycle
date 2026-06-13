import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `snapshot` resource — runtime snapshot
 * lifecycle (loomcycle v0.8.17+). Backup / restore the substrate state from
 * n8n (e.g. snapshot before a deploy, restore on rollback). 6 ops:
 *
 *   - Create     → createSnapshot
 *   - Delete     → deleteSnapshot
 *   - Export URL → exportSnapshotURL (synchronous; returns a bearer-authed URL)
 *   - Get        → getSnapshot (full envelope incl. json_content)
 *   - List       → listSnapshots
 *   - Restore    → restoreSnapshot (from a snapshot id OR an inline envelope)
 *
 * Bespoke executor (these are not op-discriminated SubstrateToolInput calls).
 *
 * Op options array is alphabetised by name.
 */
export const snapshotOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['snapshot'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Capture the running state into a snapshot envelope',
				action: 'Create a snapshot',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a snapshot by ID (idempotent)',
				action: 'Delete a snapshot',
			},
			{
				name: 'Export URL',
				value: 'exportUrl',
				description: 'Return the bearer-authed download URL for a snapshot envelope (no HTTP call)',
				action: 'Get a snapshot export URL',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Fetch the full snapshot envelope (including json_content)',
				action: 'Get a snapshot',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List captured snapshots (most recent first)',
				action: 'List snapshots',
			},
			{
				name: 'Restore',
				value: 'restore',
				description: 'Restore state from a snapshot ID or an inline envelope (idempotent)',
				action: 'Restore a snapshot',
			},
		],
		default: 'list',
	},

	// ---- Snapshot ID (Get / Delete / Export URL) ----
	{
		displayName: 'Snapshot Name or ID',
		name: 'snapshotId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadSnapshots' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['snapshot'], operation: ['get', 'delete', 'exportUrl'] } },
		description:
			'The snapshot to act on. Choose from the list, or specify an ID via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ---- Restore: source toggle ----
	{
		displayName: 'Restore From',
		name: 'restoreSource',
		type: 'options',
		default: 'byId',
		displayOptions: { show: { resource: ['snapshot'], operation: ['restore'] } },
		options: [
			{ name: 'Snapshot ID (Same Instance)', value: 'byId', description: 'Restore a snapshot captured on this deployment' },
			{ name: 'Inline Envelope (JSON)', value: 'inline', description: 'Restore from an envelope captured elsewhere (e.g. a Get output)' },
		],
		description: 'Restore from a stored snapshot ID, or from an inline envelope JSON',
	},
	{
		displayName: 'Snapshot Name or ID',
		name: 'snapshotId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadSnapshots' },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['snapshot'], operation: ['restore'], restoreSource: ['byId'] } },
		description: 'The snapshot to restore. Choose from the list, or specify an ID via an expression.',
	},
	{
		displayName: 'Envelope (JSON)',
		name: 'restoreJson',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		required: true,
		displayOptions: { show: { resource: ['snapshot'], operation: ['restore'], restoreSource: ['inline'] } },
		description: 'A snapshot envelope (the `json_content` from a Get, or an exported envelope) to restore from',
	},
	{
		displayName: 'Include Interaction History',
		name: 'includeHistory',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['snapshot'], operation: ['restore'] } },
		description: 'Whether to restore the optional interaction_history section as well (only if the snapshot captured it)',
	},

	// ---- Create: options ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['snapshot'], operation: ['create'] } },
		options: [
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				description: 'Free-text marker stored on the snapshot for later lookup',
			},
			{
				displayName: 'Include Interaction History',
				name: 'includeHistory',
				type: 'boolean',
				default: false,
				description: 'Whether to capture the optional interaction_history section (large; opt-in)',
			},
			{
				displayName: 'Include History Since',
				name: 'includeHistorySince',
				type: 'dateTime',
				default: '',
				description: 'Only capture interaction history at/after this timestamp. Honoured only when Include Interaction History is on.',
			},
			{
				displayName: 'Max Bytes',
				name: 'maxBytes',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Override the operator\'s snapshot size cap. 0 = use the deployment default.',
			},
		],
	},

	// ---- List: filters ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['snapshot'], operation: ['list'] } },
		options: [
			{
				displayName: 'Label Contains',
				name: 'labelContains',
				type: 'string',
				default: '',
				description: 'Only list snapshots whose label contains this substring',
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
];
