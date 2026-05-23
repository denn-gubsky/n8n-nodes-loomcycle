import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `skillDef` resource — substrate-admin
 * management of versioned skill definitions (v0.8.22+). 7 ops mapping
 * to `client.skillDef({op})`. Mirrors agentDef exactly; skill-specific
 * overlay fields (body, allowed_tools) live inside the overlay JSON.
 *
 * Op options array is alphabetised by name.
 */
export const skillDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['skillDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register a new skill definition (initial version)',
				action: 'Create a skill definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork a skill definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get a skill definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List skill definition versions',
			},
			{
				name: 'Promote',
				value: 'promote',
				description: 'Make a specific def_id the active version',
				action: 'Promote a skill definition',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or active row for a name) as retired',
				action: 'Retire a skill definition',
			},
			{
				name: 'Verify',
				value: 'verify',
				description: 'Compare a content_sha256 against the deployed active row',
				action: 'Verify a skill definition hash',
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
			show: { resource: ['skillDef'], operation: ['get', 'list', 'create', 'retire', 'verify'] },
		},
		description: 'Skill definition name (matches the skill\'s yaml frontmatter / .md filename stem)',
	},

	// ---- Def ID (Promote / Retire) ----
	{
		displayName: 'Def ID',
		name: 'defId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['skillDef'], operation: ['promote'] } },
		description: 'Specific def_id to act on. Versions are returned by List Versions.',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['skillDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},

	// ---- Parent Def ID (Fork) ----
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['skillDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits all fields not present in the overlay.',
	},

	// ---- Description (Create / Fork) ----
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['skillDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version',
	},

	// ---- Overlay JSON (Create / Fork) ----
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['skillDef'], operation: ['create', 'fork'] } },
		description:
			'JSON object with the skill\'s content-bearing fields (body, allowed_tools, description, etc.). Merged onto parent for Fork; defines initial row for Create.',
	},

	// ---- Promote-After-Create (Create / Fork) ----
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['skillDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately',
	},

	// ---- Content SHA256 (Verify) ----
	{
		displayName: 'Content SHA256',
		name: 'contentSha256',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['skillDef'], operation: ['verify'] } },
		description: 'Local content_sha256 (typically from `loomcycle hash skill &lt;path&gt;`) to compare against the deployed active row',
	},
];
