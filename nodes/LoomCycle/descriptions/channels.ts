import type { INodeProperties } from 'n8n-workflow';

/**
 * Operation descriptions for the `channel` resource. Eight ops covering
 * message-flow CRUD + runtime-channel admin CRUD:
 *
 * Message flow (v0.9.2 — loomcycle PR #180):
 *   - Publish         → publishChannel (with optional deliver_at)
 *   - Subscribe       → subscribeChannel (auto-ack batch)
 *   - Peek            → peekChannel (non-destructive)
 *   - Ack             → ackChannel (advance committed cursor)
 *   - List Channels   → listChannels (admin listing)
 *
 * Admin CRUD (v0.11.5 — added in n8n 1.2.0):
 *   - Create Channel  → createChannel (runtime-substrate channel; yaml
 *                       channels refuse mutation with HTTP 409)
 *   - Update Channel  → updateChannel (partial update; nil fields stay
 *                       unchanged; yaml channels refuse)
 *   - Delete Channel  → deleteChannel (cascades messages + cursors;
 *                       yaml channels refuse)
 *
 * Every message-flow op (except List Channels) takes a `scope`
 * parameter: `global` for admin-scoped channels and `user` for
 * per-user-scoped channels. Admin CRUD ops always operate at the
 * substrate scope — no `scope` field; the channel's `scope` attribute
 * is part of its own definition.
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
				name: 'Create Channel',
				value: 'createChannel',
				description: 'Create a runtime-substrate channel. Yaml-declared channels refuse with HTTP 409.',
				action: 'Create a channel',
			},
			{
				name: 'Delete Channel',
				value: 'deleteChannel',
				description: 'Delete a runtime-substrate channel + cascade its messages. Yaml-declared channels refuse with HTTP 409.',
				action: 'Delete a channel',
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
			{
				name: 'Update Channel',
				value: 'updateChannel',
				description: 'Partial update of a runtime-substrate channel\'s attributes. Yaml-declared channels refuse with HTTP 409.',
				action: 'Update a channel',
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

	// ---- Create / Update / Delete Channel: channel name ----
	{
		displayName: 'Channel Name',
		name: 'channelName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['channel'], operation: ['createChannel', 'updateChannel', 'deleteChannel'] } },
		description:
			'Name of the runtime-substrate channel. Must not collide with a yaml-declared channel name (HTTP 409 `channel_yaml_immutable`). For Update / Delete the channel must already exist as a runtime channel.',
	},

	// ---- Create Channel: attributes (alphabetised by displayName per n8n-nodes-base) ----
	{
		displayName: 'Channel Settings',
		name: 'channelSettings',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		displayOptions: { show: { resource: ['channel'], operation: ['createChannel'] } },
		options: [
			{
				displayName: 'Default TTL Seconds',
				name: 'defaultTtl',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Seconds before a message expires from the queue. 0 = no TTL.',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Free-form description shown in listings + dashboards',
			},
			{
				displayName: 'Max Messages',
				name: 'maxMessages',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Maximum messages retained in the queue. 0 = unbounded.',
			},
			{
				displayName: 'Period',
				name: 'period',
				type: 'string',
				default: '',
				description: 'Free-form retention hint. Informational only — not enforced by the substrate.',
			},
			{
				displayName: 'Publisher',
				name: 'publisher',
				type: 'string',
				default: '',
				description: 'Free-form attribution string. Informational only — not enforced by the substrate.',
			},
			{
				displayName: 'Scope',
				name: 'scope',
				type: 'options',
				default: 'global',
				options: [
					{ name: 'Agent', value: 'agent', description: 'Per-agent_id queue' },
					{ name: 'Global', value: 'global', description: 'Single global queue' },
					{ name: 'User', value: 'user', description: 'Per-user_id queue' },
				],
				description: 'Queue partitioning. Defaults to `global` if omitted.',
			},
			{
				displayName: 'Semantic',
				name: 'semantic',
				type: 'options',
				default: 'queue',
				options: [
					{ name: 'Queue', value: 'queue', description: 'FIFO consumer semantics with cursor commit' },
					{ name: 'Topic', value: 'topic', description: 'Broadcast — every consumer sees every message' },
				],
				description: 'Delivery semantic. Defaults to `queue`.',
			},
		],
	},

	// ---- Update Channel: attributes (partial update) ----
	{
		displayName: 'Update Fields',
		name: 'updateSettings',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		displayOptions: { show: { resource: ['channel'], operation: ['updateChannel'] } },
		description: 'Only the fields you set here are updated. Omitted fields stay unchanged.',
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'New description text',
			},
			{
				displayName: 'Semantic',
				name: 'semantic',
				type: 'options',
				default: 'queue',
				options: [
					{ name: 'Queue', value: 'queue' },
					{ name: 'Topic', value: 'topic' },
				],
				description: 'Change the delivery semantic',
			},
			{
				displayName: 'Default TTL Seconds',
				name: 'defaultTtl',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Adjust the message TTL. 0 = no TTL.',
			},
			{
				displayName: 'Max Messages',
				name: 'maxMessages',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Adjust the retention cap. 0 = unbounded.',
			},
		],
	},
];
