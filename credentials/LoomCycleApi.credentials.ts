import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * LoomCycle API credential.
 *
 * One credential per loomcycle deployment. The bearer token matches
 * loomcycle's `LOOMCYCLE_AUTH_TOKEN` env var; anyone holding it can
 * drive the runtime. Treat it as operator-trust.
 *
 * Optional defaults (userId, userTier, mcpUrl) are surfaced as
 * per-node parameter defaults — action nodes read them via
 * `this.getCredentials('loomCycleApi')` and fall through to per-node
 * parameter overrides.
 */
export class LoomCycleApi implements ICredentialType {
	name = 'loomCycleApi';

	displayName = 'LoomCycle API';

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://github.com/denn-gubsky/n8n-nodes-loomcycle#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://127.0.0.1:8787',
			required: true,
			placeholder: 'http://127.0.0.1:8787',
			description: 'Base URL of the loomcycle HTTP API. The /healthz endpoint is used to validate the credential.',
		},
		{
			displayName: 'Bearer Token',
			name: 'bearerToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Bearer token authorising every /v1/* call. Matches the loomcycle deployment\'s LOOMCYCLE_AUTH_TOKEN env var.',
		},
		{
			displayName: 'Default User ID',
			name: 'userId',
			type: 'string',
			default: '',
			description:
				'Optional default user_id forwarded by action nodes when not overridden per-node. Leave empty if every node will set its own.',
		},
		{
			displayName: 'Default User Tier',
			name: 'userTier',
			type: 'string',
			default: '',
			description:
				'Optional default user_tier forwarded by action nodes when not overridden per-node. Leave empty for the loomcycle default.',
		},
		{
			displayName: 'MCP URL (optional)',
			name: 'mcpUrl',
			type: 'string',
			default: '',
			description:
				'Optional URL of the loomcycle MCP server (Vector 1 of the integration). Not required for the action / trigger / cluster nodes; used by external orchestrators referenced in node descriptions.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.bearerToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/healthz',
			method: 'GET',
		},
	};
}
