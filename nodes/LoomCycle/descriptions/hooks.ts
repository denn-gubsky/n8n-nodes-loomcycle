import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `hook` resource — pre/post-tool webhook
 * registration (loomcycle hooks API). 3 ops mapping to the adapter calls:
 *
 *   - Register  → client.registerHook(opts)   (POST /v1/hooks)
 *   - List      → client.listHooks()          (GET  /v1/hooks)
 *   - Delete    → client.deleteHook(id)        (DELETE /v1/hooks/{id})
 *
 * A hook makes loomcycle POST a PreHookCall / PostHookCall payload to a
 * `callback_url` the CONSUMER runs — the natural n8n fit is to point that
 * URL at an n8n **Webhook trigger node**, so every matched tool call calls
 * back into an n8n workflow. loomcycle manages registration only; receiving
 * the callback is n8n's Webhook node, not this action node.
 *
 * Registration is in-memory on loomcycle (empty after a restart) and
 * idempotent on (owner, name) — re-registering replaces the prior entry
 * with a fresh id. `owner` is derived from the credential/workflow rather
 * than typed by the operator.
 *
 * Op options array is alphabetised by name.
 */
export const hookOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['hook'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a registered hook by ID',
				action: 'Delete a hook',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List every currently-registered hook',
				action: 'List hooks',
			},
			{
				name: 'Register',
				value: 'register',
				description: 'Register a pre/post-tool webhook callback',
				action: 'Register a hook',
			},
		],
		default: 'register',
	},

	// ---- Register parameters ----
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'Hook name. Together with the owner it forms the identity tuple — re-registering the same name replaces the prior entry.',
	},
	{
		displayName: 'Phase',
		name: 'phase',
		type: 'options',
		default: 'pre',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		options: [
			{ name: 'Pre (Before Tool Call)', value: 'pre', description: 'Loomcycle POSTs a PreHookCall before the tool runs — can rewrite or block the call' },
			{ name: 'Post (After Tool Call)', value: 'post', description: 'Loomcycle POSTs a PostHookCall after the tool runs — can rewrite the result' },
		],
		description: 'Whether the webhook fires before or after the matched tool call',
	},
	{
		displayName: 'Callback URL',
		name: 'callbackUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://n8n.example.com/webhook/loomcycle-hook',
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'Http:// or https:// URL loomcycle POSTs the hook payload to. Point this at an n8n Webhook trigger node to call back into a workflow on every matched tool call.',
	},
	{
		displayName: 'Owner',
		name: 'owner',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'App UID owning this hook. Leave empty to derive it from the workflow — (owner, name) is the idempotent identity tuple.',
	},
	{
		displayName: 'Agents (Comma-Separated)',
		name: 'agents',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'Agent name globs to match (exact or trailing-* prefix). Empty = match every agent.',
	},
	{
		displayName: 'Tools (Comma-Separated)',
		name: 'tools',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'Tool name globs to match (same syntax). Empty = match every tool.',
	},
	{
		displayName: 'Fail Mode',
		name: 'failMode',
		type: 'options',
		default: 'open',
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		options: [
			{ name: 'Open (Errors Pass Through)', value: 'open', description: 'Webhook errors are ignored — the tool call proceeds' },
			{ name: 'Closed (Errors Fail the Call)', value: 'closed', description: 'Webhook errors fail the tool call with IsError=true' },
		],
		description: 'How loomcycle treats a webhook delivery error',
	},
	{
		displayName: 'Timeout (Ms)',
		name: 'timeoutMs',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['hook'], operation: ['register'] } },
		description: 'Per-call webhook timeout in milliseconds. 0 = use the loomcycle registry default (5s).',
	},

	// ---- Delete parameter ----
	{
		displayName: 'Hook ID',
		name: 'hookId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['hook'], operation: ['delete'] } },
		description: 'The loomcycle-assigned hook ID (returned by Register / List) to delete',
	},
];
