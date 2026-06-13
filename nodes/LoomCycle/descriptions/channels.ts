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
				name: 'Await',
				value: 'await',
				description: 'Fan-in: wait until a predicate (any / all / at least N) is met across multiple channels (loomcycle ≥ v0.25)',
				action: 'Await across channels',
			},
			{
				name: 'Broadcast',
				value: 'broadcast',
				description: 'Fan-out: publish the same payload to multiple channels atomically (loomcycle ≥ v0.25)',
				action: 'Broadcast to channels',
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
				name: 'Purge Channel',
				value: 'purgeChannel',
				description: 'Clear all buffered messages from a channel, keeping its definition + cursors. Allowed on yaml channels too.',
				action: 'Purge a channel',
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
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack', 'purgeChannel'] },
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ---- Channels list (Await / Broadcast — fan-in / fan-out, comma-separated) ----
	{
		displayName: 'Channels (Comma-Separated)',
		name: 'channels',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'orders, alerts, audit',
		displayOptions: { show: { resource: ['channel'], operation: ['await', 'broadcast'] } },
		description: 'Comma-separated channel names. Max 32. Await fans in across them; Broadcast publishes the same payload to all (atomic at the declare pre-flight).',
	},

	// ---- Scope (Publish / Subscribe / Peek / Ack / Await / Broadcast) ----
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		default: 'global',
		displayOptions: {
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack', 'await', 'broadcast'] },
		},
		options: [
			{ name: 'Global (Admin)', value: 'global', description: 'Admin-scoped channel — single global queue' },
			{ name: 'User (Per-User)', value: 'user', description: 'Per-user-scoped channel — independent queue per user_id' },
		],
		description: 'Whether the channel operates at the admin (global) or per-user scope',
	},

	// ---- User ID (per-user scope) ----
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['channel'], operation: ['publish', 'subscribe', 'peek', 'ack', 'await', 'broadcast'], scope: ['user'] },
		},
		description: 'User_id for the per-user scope. Empty = use the credential\'s Default User ID.',
	},

	// ---- Await: predicate mode + threshold ----
	{
		displayName: 'Mode',
		name: 'awaitMode',
		type: 'options',
		default: 'any',
		displayOptions: { show: { resource: ['channel'], operation: ['await'] } },
		options: [
			{ name: 'Any', value: 'any', description: 'Fire as soon as ANY channel has a message' },
			{ name: 'All', value: 'all', description: 'Fire when EVERY channel has at least one message' },
			{ name: 'At Least N', value: 'at_least', description: 'Fire when at least N of the channels have a message' },
		],
		description: 'Fan-in predicate. Non-committing — the cursor is never advanced.',
	},
	{
		displayName: 'N (At Least)',
		name: 'awaitN',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['channel'], operation: ['await'], awaitMode: ['at_least'] } },
		description: 'Number of channels that must have a message before the predicate fires',
	},

	// ---- Publish: payload + optional deliver_at ----
	{
		displayName: 'Payload',
		name: 'payload',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: { resource: ['channel'], operation: ['publish', 'broadcast'] } },
		description: 'JSON payload to publish — the substrate stores it verbatim. For Broadcast it is published to every listed channel.',
	},
	{
		displayName: 'Deliver At',
		name: 'deliverAt',
		type: 'dateTime',
		default: '',
		displayOptions: { show: { resource: ['channel'], operation: ['publish', 'broadcast'] } },
		description: 'Optional deferred-delivery timestamp (ISO 8601). Empty = deliver immediately.',
	},

	// ---- Subscribe / Peek: cursor + limits ----
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['channel'], operation: ['subscribe', 'peek', 'await'] } },
		options: [
			{
				displayName: 'From Cursor',
				name: 'fromCursor',
				type: 'string',
				default: '',
				description: 'Resume reading from this cursor. Empty = use the committed cursor (Subscribe) or start of queue (Peek / Await).',
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
				displayName: 'Wait Ms (Subscribe / Await)',
				name: 'waitMs',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 60000 },
				description: 'Long-poll wait if the predicate is unmet (Subscribe / Await). Ignored for Peek.',
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
