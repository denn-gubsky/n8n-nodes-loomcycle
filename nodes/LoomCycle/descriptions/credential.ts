import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `credential` resource — loomcycle's own
 * encrypted credential store (RFC AR / CN, loomcycle ≥ v1.113 for the typed
 * adapter). A stored credential is referenced as `$cred:<name>` in MCP server
 * headers, hook headers and signing secrets, and per-tool credentials; it is
 * resolved per call (agent > user > tenant) and its value is never returned.
 *
 *   - Create (store or rotate) → createCredential({scope, name, value, …})
 *   - Get                      → getCredential({scope, name})   (metadata only)
 *   - List                     → listCredentials(scope)          (metadata only)
 *   - Delete                   → deleteCredential({scope, name})
 *
 * The VALUE is read from a LoomCycle Secret credential, never from a node
 * parameter, so it stays out of the workflow JSON and the execution data.
 *
 * Op options array is alphabetised by name.
 */
export const credentialOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['credential'] } },
		options: [
			{
				name: 'Create or Rotate',
				value: 'create',
				description: 'Store a secret in loomcycle under a name, or replace the value stored under it',
				action: 'Store a credential in loomcycle',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a stored credential. Everything referencing $cred:&lt;name&gt; stops resolving.',
				action: 'Delete a credential',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Read a credential\'s metadata (never its value), e.g. to check it exists and has not expired',
				action: 'Get a credential',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List the credentials in a scope, metadata only',
				action: 'List credentials',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Scope',
		name: 'credentialScope',
		type: 'options',
		default: 'tenant',
		displayOptions: { show: { resource: ['credential'] } },
		options: [
			{ name: 'Tenant', value: 'tenant', description: 'Shared by the whole tenant. Needs a tenant-level token.' },
			{ name: 'User', value: 'user', description: 'The calling token\'s own user. Any user token may manage these.' },
		],
		description: 'Where the credential lives. A reference resolves agent first, then user, then tenant.',
	},
	{
		displayName: 'Name',
		name: 'credentialName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'slack-token',
		displayOptions: { show: { resource: ['credential'], operation: ['create', 'get', 'delete'] } },
		description: 'Referenced elsewhere as $cred:&lt;name&gt;',
	},
	{
		displayName:
			'The value comes from the LoomCycle Secret credential selected above, so it is never saved in this workflow or its executions. loomcycle encrypts it (LOOMCYCLE_SECRET_KEY must be set there) and never returns it.',
		name: 'credentialValueNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['credential'], operation: ['create'] } },
	},
	{
		displayName: 'Send It To',
		name: 'urlPolicy',
		type: 'options',
		default: 'keep',
		displayOptions: { show: { resource: ['credential'], operation: ['create'] } },
		options: [
			{
				name: 'Anywhere It Is Referenced',
				value: 'keep',
				description: 'No restriction. When rotating an existing credential, its current restriction is kept.',
			},
			{
				name: 'Only These URLs',
				value: 'list',
				description: 'Only to destinations under the https URLs below (MCP server, hook, peer, git source). Never as a model-provider key.',
			},
			{
				name: 'Nowhere (Compare Only)',
				value: 'none',
				description: 'Stored but never sent. Such a credential cannot sign hook deliveries.',
			},
		],
		description: 'Where loomcycle may send the value',
	},
	{
		displayName: 'Allowed URLs (Comma-Separated)',
		name: 'allowedUrls',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://mcp.slack.com, https://n8n.example.com/webhook/',
		displayOptions: { show: { resource: ['credential'], operation: ['create'], urlPolicy: ['list'] } },
		description:
			'Https URLs only, each covering itself and everything under it. A hook signing credential must cover the hook\'s URL, so for a hook served over plain http (a LAN n8n) choose Anywhere It Is Referenced.',
	},
	{
		displayName: 'Additional Fields',
		name: 'credentialFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['credential'], operation: ['create'] } },
		options: [
			{
				displayName: 'Expires At',
				name: 'expiresAt',
				type: 'dateTime',
				default: '',
				description: 'After this moment loomcycle refuses the credential everywhere it is referenced. Must be in the future.',
			},
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				default: '',
				description: 'A user name sent with the value where a destination takes one, such as HTTP basic auth for a git source',
			},
		],
	},
];
