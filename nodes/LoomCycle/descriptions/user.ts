import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `user` resource — tenant-owned users and their
 * delegated bearer tokens (RFC BX Phase 2, loomcycle ≥ v1.50).
 *
 * **The tenant is always derived server-side from the authenticated principal**,
 * so there is no tenant field anywhere here. Requires a persistent store (503
 * otherwise).
 *
 * Scoped to READS plus one revocation. Identity CRUD (create / update / delete)
 * is deliberately absent: provisioning and removing users is operator work that
 * belongs in the loomcycle CLI / Web UI, not something a workflow should do as a
 * side effect. `Revoke Token` stays because cutting off a leaked credential is
 * exactly the kind of thing you want to automate on an alert.
 *
 * **Mint Token is absent for a different reason**, the same one as on the
 * Operator Token node: the substrate returns the bearer plaintext once, and
 * surfacing it would persist a live credential into n8n execution data
 * (CLAUDE.md §security.6). The executor refuses it defensively too, and a test
 * locks its absence.
 *
 * Distinct from the Directory node: a Directory "user" is derived from run
 * activity, whereas these are stored identity rows.
 *
 * Options arrays are alphabetised by name per the n8n-nodes-base convention.
 */
export const userOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['user'] } },
		options: [
			{
				name: 'List',
				value: 'list',
				description: 'List the tenant\'s users with a running-count summary',
				action: 'List users',
			},
			{
				name: 'List Tokens',
				value: 'listTokens',
				description: 'List a user\'s delegated tokens — metadata only, never the plaintext',
				action: 'List user tokens',
			},
			{
				name: 'Revoke Token',
				value: 'revokeToken',
				description: 'Revoke one delegated token by def_id, effective immediately',
				action: 'Revoke a user token',
			},
		],
		default: 'list',
	},

	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['user'], operation: ['listTokens', 'revokeToken'] },
		},
		description: 'The user\'s subject ID — its identifier within the tenant. A cross-tenant subject is an opaque 404.',
	},
	{
		// The lint rule masks any param whose name matches /token/, but a def_id
		// is an IDENTIFIER, not a credential — List Tokens returns it in plain
		// text and an operator has to read and copy it to revoke one. Masking it
		// would break the only workflow this field exists for.
		displayName: 'Token Def ID',
		name: 'tokenDefId',
		// eslint-disable-next-line n8n-nodes-base/node-param-type-options-password-missing
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['user'], operation: ['revokeToken'] } },
		description: 'The delegated token to revoke, from List Tokens. A def_id belonging to another user is an opaque 404.',
	},
	{
		displayName: 'This node is read-only apart from Revoke Token. Creating, updating and deleting users is operator work — do it via the loomcycle CLI or Web UI. Minting a token is unavailable for a stronger reason: the substrate returns the bearer plaintext exactly once, and a node output would persist a live credential into n8n execution data. Listing tokens returns metadata only.',
		name: 'userMintNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['user'] } },
	},
];
