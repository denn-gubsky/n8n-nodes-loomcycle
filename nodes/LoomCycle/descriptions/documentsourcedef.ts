import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `documentSourceDef` resource — remote document
 * source admin (RFC CE, loomcycle ≥ v1.54). Registers a named PEER LOOMCYCLE
 * INSTANCE as a document source, which the Document node's Set Remote / Sync /
 * Diff Remote ops then consume. 5 ops mapping to
 * `client.documentSourceDef({op})`: Create / Fork / Get / List Versions / Retire.
 *
 * A faithful mirror of MemoryBackendDef, so this reuses the shared
 * buildSubstrateInput path. **Operator-admin only.**
 *
 * Static `document_sources:` yaml stays immutable ground truth; this authors the
 * derived runtime layer. Name resolution at use time is: tenant substrate →
 * static yaml → shared substrate.
 *
 * Auth is a credential-allowlisted `api_key_env` — the env-var NAME of the key,
 * resolved at use time, never a plaintext token and never `${...}`-interpolated.
 * The peer host is dialled through loomcycle's SSRF guard.
 *
 * Op options array is alphabetised by name.
 */
export const documentSourceDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['documentSourceDef'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Register a new named peer document source',
				action: 'Create a document source definition',
			},
			{
				name: 'Fork',
				value: 'fork',
				description: 'Branch from an existing def_id with an overlay diff',
				action: 'Fork a document source definition',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active row for a name',
				action: 'Get a document source definition',
			},
			{
				name: 'List Versions',
				value: 'list',
				description: 'List all versions for a name (lineage tree)',
				action: 'List document source definition versions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Mark a def_id (or the active row for a name) as retired',
				action: 'Retire a document source definition',
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
			show: { resource: ['documentSourceDef'], operation: ['get', 'list', 'create', 'retire'] },
		},
		description:
			'Document source name — what the Document node\'s Set Remote op references as its Source Name. A create colliding with a static yaml `document_sources:` entry is refused: yaml is ground truth.',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['documentSourceDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},
	{
		displayName: 'Parent Def ID',
		name: 'parentDefId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['documentSourceDef'], operation: ['fork'] } },
		description: 'Def_id of the row to fork. The new row inherits every field absent from the overlay.',
	},
	{
		displayName: 'Description',
		name: 'defDescription',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['documentSourceDef'], operation: ['create', 'fork'] } },
		description: 'Operator-visible description of this version',
	},
	{
		displayName: 'Overlay (JSON)',
		name: 'overlay',
		type: 'json',
		default: '{}',
		typeOptions: { rows: 6 },
		displayOptions: { show: { resource: ['documentSourceDef'], operation: ['create', 'fork'] } },
		description:
			'The source definition as JSON — the peer `base_url` plus `api_key_env`, the env-var NAME of the bearer (credential-allowlisted, resolved at use time). Never put a plaintext token here: this wire path carries names, not secrets, and `${...}` interpolation is deliberately not applied. For Fork this is the diff merged onto the parent.',
	},
	{
		displayName: 'Promote to Active',
		name: 'promote',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['documentSourceDef'], operation: ['create', 'fork'] } },
		description: 'Whether to auto-promote the new version to active immediately',
	},
];
