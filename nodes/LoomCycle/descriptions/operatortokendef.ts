import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `operatorTokenDef` resource — OperatorTokenDef
 * admin (RFC L, loomcycle v0.17 multi-tenant authorization). Manages the
 * per-principal bearer tokens that authorise `/v1/*`.
 *
 * SECURITY (CLAUDE.md §6): the substrate's `create` / `rotate` ops return the
 * token PLAINTEXT once in the response — surfacing that here would persist a
 * live bearer into n8n's execution data, violating "credentials never leave
 * the credential boundary." So this node deliberately exposes ONLY the
 * non-secret lifecycle ops:
 *
 *   - Get / List / Retire
 *
 * Mint + rotate a token via the loomcycle Web UI / CLI, where the secret is
 * shown once and not logged.
 *
 * Op options array is alphabetised by name.
 */
export const operatorTokenDefOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['operatorTokenDef'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Return the active token row for a name (metadata only — never the secret)',
				action: 'Get an operator token definition',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List operator token definitions (metadata only)',
				action: 'List operator token definitions',
			},
			{
				name: 'Retire',
				value: 'retire',
				description: 'Revoke a token by name (or def_id)',
				action: 'Retire an operator token definition',
			},
		],
		default: 'list',
	},

	// ---- Mint/rotate-elsewhere notice ----
	{
		displayName: 'Mint + Rotate Tokens via the Loomcycle Web UI / CLI',
		name: 'mintNotice',
		type: 'notice',
		default: '',
		description:
			'This node exposes only the non-secret lifecycle (Get / List / Retire). `create` / `rotate` return the token plaintext once — issuing them here would persist a live bearer into n8n execution data, so mint + rotate are intentionally left to the loomcycle Web UI / CLI where the secret is shown once and not logged.',
	},

	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['operatorTokenDef'], operation: ['get', 'list', 'retire'] } },
		description: 'Operator token definition name (the token\'s logical identifier, not the secret)',
	},
	{
		displayName: 'Def ID (Optional)',
		name: 'defId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['operatorTokenDef'], operation: ['retire'] } },
		description: 'Specific def_id to retire. Leave empty to retire the active version of the name above.',
	},
];
