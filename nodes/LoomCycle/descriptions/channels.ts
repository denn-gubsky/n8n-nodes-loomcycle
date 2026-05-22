import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `channel` resource. Five ops, all
 * direct adapter calls (Channel CRUD shipped on `@loomcycle/client`
 * v0.9.2 via loomcycle PR #180).
 *
 *   - Publish         → publishChannel (with optional deliver_at)
 *   - Subscribe       → subscribeChannel (auto-ack batch)
 *   - Peek            → peekChannel (non-destructive)
 *   - Ack             → ackChannel (advance committed cursor)
 *   - List Channels   → listChannels (admin listing)
 *
 * Every op (except List Channels) takes a `scope` parameter: `global`
 * for admin-scoped channels and `user` for per-user-scoped channels.
 * The `userId` parameter applies only when `scope=user`.
 *
 * Op options array is alphabetised by name.
 */
export const channelOps: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['channel'] } },
		options: [
			{
				name: 'Ack',
				value: 'ack',
				description: 'Advance the committed cursor for a (channel, scope, scope_id) tuple',
				action: 'Ack a channel cursor',
			},
			{
				name: 'List Channels',
				value: 'listChannels',
				description: 'List operator-declared channels with aggregate stats',
				action: 'List channels',
			},
			{
				name: 'Peek',
				value: 'peek',
				description: 'Non-destructive read — does not advance the committed cursor',
				action: 'Peek at channel messages',
			},
			{
				name: 'Publish',
				value: 'publish',
				description: 'Publish a JSON payload to a channel (optionally deferred)',
				action: 'Publish to a channel',
			},
			{
				name: 'Subscribe',
				value: 'subscribe',
				description: 'Long-poll for the next message batch and auto-advance the cursor',
				action: 'Subscribe to a channel',
			},
		],
		default: 'publish',
	},

	// ---- Channel name (Publish / Subscribe / Peek / Ack) ----
	{
		displayName: 'Channel Name or ID',
		name: 'channel',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'loadChannels' },
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack'] },
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ---- Scope (Publish / Subscribe / Peek / Ack) ----
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'global',
		displayOptions: {
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack'] },
		},
		options: [
			{ name: 'Global (Admin)', value: 'global', description: 'Admin-scoped channel — single global queue' },
			{ name: 'User (Per-User)', value: 'user', description: 'Per-user-scoped channel — independent queue per user_id' },
		],
		description: 'Whether the channel operates at the admin (global) or per-user scope',
	},

	// ---- User ID (Publish / Subscribe / Peek / Ack when scope=user) ----
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack'], scope: ['user'] },
		},
		description: 'User_id for the per-user scope. Empty = use the credential\'s Default User ID.',
	},

	// ---- Publish: payload + optional deliver_at ----
	{
		displayName: 'Payload',
		name: 'payload',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['channel'], operation: ['publish'] } },
		description: 'JSON payload to publish — the substrate stores it verbatim',
	},
	{
		displayName: 'Deliver At',
		name: 'deliverAt',
		type: 'dateTime',
		default: '',
		displayOptions: { show: { resource: ['channel'], operation: ['publish'] } },
		description: 'Optional deferred-delivery timestamp (ISO 8601). Empty = deliver immediately.',
	},

	// ---- Subscribe / Peek: cursor + limits ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['channel'], operation: ['subscribe', 'peek'] } },
		options: [
			{
				displayName: 'From Cursor',
				name: 'fromCursor',
				type: 'string',
				default: '',
				description: 'Resume reading from this cursor. Empty = use the committed cursor (Subscribe) or start of queue (Peek).',
			},
			{
				displayName: 'Max Messages',
				name: 'maxMessages',
				type: 'number',
				default: 10,
				typeOptions: { minValue: 1, maxValue: 1000 },
				description: 'Maximum number of messages to return in this call',
			},
			{
				displayName: 'Wait Ms (Subscribe Only)',
				name: 'waitMs',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 60000 },
				description: 'Subscribe long-poll wait if the queue is empty. Ignored for Peek.',
			},
		],
	},

	// ---- Ack: cursor ----
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['channel'], operation: ['ack'] } },
		description: 'New committed cursor — must be monotonically forward; older cursors raise a conflict',
	},
];
