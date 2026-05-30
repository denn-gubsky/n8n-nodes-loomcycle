import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `a2aServerCardDef` resource — A2A
 * (Agent2Agent, RFC G, loomcycle v0.14.x) SERVER-side admin. Manages the
 * agent card loomcycle PUBLISHES (provider / capabilities / skills) so
 * external A2A clients can discover and call loomcycle's own agents. 5 ops
 * mapping to `client.a2aServerCardDef({op})`:
 *
 *   - Create / Fork / Get / List Versions / Retire
 *
 * Generic op-discriminated def-admin: the card body rides in the overlay
 * JSON, reusing the shared buildSubstrateInput path (same as AgentDef).
 *
 * Op options array is alphabetised by name.
 */
export const a2aServerCardDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['a2aServerCardDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Publish an A2A server card exposing loomcycle agents',
				action: 'Create an A2A server card definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork an A2A server card definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get an A2A server card definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List A2A server card definition versions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire an A2A server card definition',
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
			show: { resource: ['a2aServerCardDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description: 'A2A server card definition name',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['a2aServerCardDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['a2aServerCardDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['a2aServerCardDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version',
	},
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['a2aServerCardDef'], operation: ['create', 'fork'] } },
		description:
			'The published agent card as JSON — e.g. `{"name":"loomcycle","description":"...","provider":{...},"capabilities":{...}}`. For Fork this is the diff merged onto the parent.',
	},
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['a2aServerCardDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately',
	},
];
