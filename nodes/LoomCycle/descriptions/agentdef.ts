import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `agentDef` resource — substrate-admin
 * management of versioned agent definitions (v0.8.5+, content_sha256 in
 * v0.9.x). 7 ops mapping to the op-discriminated `client.agentDef({op})`
 * adapter call:
 *
 *   - Create   → register a new agent definition (description + overlay)
 *   - Fork     → branch from an existing def_id with an overlay diff
 *   - Get      → return the active row for a name
 *   - List     → list all versions for a name (lineage tree)
 *   - Promote  → make a specific def_id the active version
 *   - Retire   → mark a def_id (or name's active) as retired
 *   - Verify   → content_sha256 comparison ("is my bundle deployed?")
 *
 * The substrate refuses scope-violating mutations via
 * `SubstrateToolRefusedError` (wired through helpers/errors.ts).
 *
 * Op options array is alphabetised by name.
 */
export const agentDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['agentDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register a new agent definition (initial version)',
				action: 'Create an agent definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork an agent definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get an agent definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List agent definition versions',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make a specific def_id the active version',
				action: 'Promote an agent definition',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire an agent definition',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Compare a content_sha256 against the deployed active row',
				action: 'Verify an agent definition hash',
			},
		],
		default: 'list',
	},

	// ---- Name (used by Get / List / Create / Retire / Verify) ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['agentDef'], operation: ['get', 'list', 'create', 'retire', 'verify'] },
		},
		description: 'Agent definition name (matches the agent\'s yaml frontmatter / .md filename stem)',
	},

	// ---- Def ID (used by Promote, optional override for Retire) ----
	{
		displayName: 'Def ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['promote'] } },
		description: 'Specific def_id to act on. Versions are returned by List Versions.',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['agentDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},

	// ---- Description (Create / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version. Helps audit the lineage later.',
	},

	// ---- Overlay JSON (Create / Fork) ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description:
			'JSON object containing the agent\'s content-bearing fields (e.g. model, max_iterations, allowed_tools, system_prompt). For Fork this is merged onto the parent. For Create this defines the initial row.',
	},

	// ---- Promote-After-Create (Create / Fork) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['agentDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately. If false, the new row exists but no agent uses it until a separate Promote call.',
	},

	// ---- Content SHA256 (Verify) ----
	{
		displayName: 'Content SHA256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['agentDef'], operation: ['verify'] } },
		description: 'Local content_sha256 (typically from `loomcycle hash agent &lt;path&gt;`) to compare against the deployed active row',
	},
];
