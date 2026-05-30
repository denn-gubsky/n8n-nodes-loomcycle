import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `a2aAgentDef` resource — A2A (Agent2Agent,
 * RFC G, loomcycle v0.14.x) CLIENT-side admin. Defines an EXTERNAL A2A agent
 * (its agent card URL / endpoint / auth / expected skills) that loomcycle
 * agents can then call as a tool. 5 ops mapping to `client.a2aAgentDef({op})`:
 *
 *   - Create / Fork / Get / List Versions / Retire
 *
 * Generic op-discriminated def-admin: the def body rides in the overlay JSON,
 * so this reuses the shared buildSubstrateInput path (same as AgentDef).
 * Auth uses a credential REFERENCE (bearer_credential_ref), never a plaintext
 * token.
 *
 * Op options array is alphabetised by name.
 */
export const a2aAgentDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['a2aAgentDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register an external A2A agent loomcycle can call',
				action: 'Create an A2A agent definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork an A2A agent definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get an A2A agent definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List A2A agent definition versions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire an A2A agent definition',
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
			show: { resource: ['a2aAgentDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description: 'A2A agent definition name — how loomcycle agents reference this external agent',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['a2aAgentDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['a2aAgentDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['a2aAgentDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version',
	},
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['a2aAgentDef'], operation: ['create', 'fork'] } },
		description:
			'The external-agent definition as JSON — keys like `agent_card_url`, `endpoint`, `binding`, `auth` ({scheme, bearer_credential_ref}), `expected_skills`, `verify_signed_card`. For Fork this is the diff merged onto the parent.',
	},
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['a2aAgentDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately',
	},
];
