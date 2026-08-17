import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `user` resource — tenant-owned users and their
 * delegated bearer tokens (RFC BX Phase 2, loomcycle ≥ v1.50).
 *
 * A tenant operator manages first-class users in its OWN tenant and mints /
 * lists / revokes tokens for them. **The tenant is always derived server-side
 * from the authenticated principal**, so there is no tenant field anywhere here.
 * Requires a persistent store (503 otherwise).
 *
 * **Mint Token is deliberately absent**, exactly as on the Operator Token node:
 * the substrate returns the bearer plaintext once, and surfacing it here would
 * persist a live credential into n8n execution data (CLAUDE.md §security.6). The
 * executor refuses it defensively as well, and a test locks its absence.
 *
 * Distinct from the Directory node: a Directory "user" is derived from run
 * activity, whereas these are stored identity rows. Distinct from Erasure too —
 * deleting a user removes the identity row, not the data it owns.
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
				name: 'Create',
				value: 'create',
				description: 'Register a first-class user in the caller\'s own tenant',
				action: 'Create a user',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete the identity row. Owned data is left intact — that is Erasure\'s job.',
				action: 'Delete a user',
			},
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
			{
				name: 'Update',
				value: 'update',
				description: 'Patch mutable fields. Omitted keys are left unchanged.',
				action: 'Update a user',
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
			show: {
				resource: ['user'],
				operation: ['create', 'update', 'delete', 'listTokens', 'revokeToken'],
			},
		},
		description: 'The user\'s subject ID — its identifier within the tenant. A cross-tenant subject is an opaque 404.',
	},
	{
		displayName: 'Display Name',
		name: 'displayName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['user'], operation: ['create', 'update'] } },
		description: 'Human-readable label for the user',
	},
	{
		displayName: 'Access Mode',
		name: 'accessMode',
		type: 'options',
		default: 'tenant',
		displayOptions: { show: { resource: ['user'], operation: ['create', 'update'] } },
		options: [
			{
				name: 'Tenant (Collaborates on Shared Primitives)',
				value: 'tenant',
				description: 'Non-isolated: reaches the tenant\'s shared Library, Documents and Memory over HTTP (RFC CB)',
			},
			{
				name: 'Isolated (Confined to Own User Scope)',
				value: 'isolated',
				description: 'Confined to its own user scope; never sees the tenant\'s shared agents or data',
			},
		],
		description:
			'What the user may reach. This is what the substrate DERIVES a minted token\'s scopes from — they are never supplied on the wire — so access mode is the real authorization decision, not a label.',
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		default: 'active',
		displayOptions: { show: { resource: ['user'], operation: ['create', 'update'] } },
		options: [
			{ name: 'Active', value: 'active' },
			{ name: 'Disabled', value: 'disabled' },
		],
		description:
			'Setting a user to `disabled` also REVOKES its delegated tokens server-side, so it is a way to cut off access immediately without deleting the identity row',
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
		displayName: 'Minting a token is deliberately NOT available here. The substrate returns the bearer plaintext exactly once, and putting it in a node output would persist a live credential into n8n execution data. Mint via the loomcycle CLI or Web UI. Listing tokens returns metadata only.',
		name: 'userMintNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['user'] } },
	},
];
