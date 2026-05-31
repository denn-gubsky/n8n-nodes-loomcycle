import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import type { ChannelScope } from '@loomcycle/client';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { wrapLoomcycleError } from '../LoomCycle/helpers/errors';
import { loadChannels } from '../LoomCycle/helpers/loadOptions';
import { readCursor, writeCursor } from '../LoomCycle/helpers/staticData';

/**
 * `LoomCycle: Channel Message` — polling trigger that fires when new
 * messages land on a watched loomcycle channel.
 *
 * Uses n8n's `poll()` framework (no timers — n8n Cloud forbids timer
 * primitives in community nodes; the earlier long-poll loop was replaced by
 * scheduled polling in v3.0.0). Each `poll()` does ONE round:
 *   - `auto-ack`: `subscribeChannel` with `waitMs: 0` (poll-once); the
 *     substrate auto-commits the cursor (at-most-once).
 *   - `peek-ack`: `peekChannel` from the persisted cursor, emit, then
 *     `ackChannel` (at-least-once; survives a crash before ack).
 */
export class LoomCycleChannelMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Channel Message',
		name: 'loomCycleChannelMessage',
		icon: 'file:LoomCycleChannelMessage.svg',
		group: ['trigger'],
		version: 1,
		polling: true,
		description: 'Fires when a new message arrives on a loomcycle channel',
		defaults: { name: 'LoomCycle: Channel Message' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Channel Name or ID',
				name: 'channel',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'loadChannels' },
				default: '',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Scope',
				name: 'scope',
				type: 'options',
				default: 'global',
				options: [
					{ name: 'Global (Admin)', value: 'global', description: 'Single global queue for the channel' },
					{ name: 'User (Per-User)', value: 'user', description: 'Per-user queue; userId required' },
				],
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				displayOptions: { show: { scope: ['user'] } },
				description: 'User_id for the per-user scope. Empty = use the credential\'s Default User ID.',
			},
			{
				displayName: 'Delivery Mode',
				name: 'deliveryMode',
				type: 'options',
				default: 'auto-ack',
				options: [
					{
						name: 'Auto-Ack (At-Most-Once)',
						value: 'auto-ack',
						description: 'Poll-once subscribe; the substrate auto-commits the cursor',
					},
					{
						name: 'Peek + Explicit Ack (At-Least-Once)',
						value: 'peek-ack',
						description: 'Peek from the saved cursor, emit, then ack — survives a crash before ack',
					},
				],
			},
			{
				displayName: 'Max Messages per Poll',
				name: 'maxMessages',
				type: 'number',
				default: 10,
				typeOptions: { minValue: 1, maxValue: 1000 },
				description: 'Maximum number of messages to return per poll round',
			},
		],
	};

	methods = {
		loadOptions: {
			loadChannels,
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const channel = this.getNodeParameter('channel', '') as string;
		const scope = (this.getNodeParameter('scope', 'global') as ChannelScope) ?? 'global';
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const deliveryMode = (this.getNodeParameter('deliveryMode', 'auto-ack') as 'auto-ack' | 'peek-ack') ?? 'auto-ack';
		const maxMessages = (this.getNodeParameter('maxMessages', 10) as number) ?? 10;

		if (!channel) {
			throw wrapLoomcycleError(new Error('Channel name is required'), this.getNode());
		}
		const userId = scope === 'user' ? userIdParam || (await getCredentialDefault(this, 'userId')) : undefined;
		if (scope === 'user' && !userId) {
			throw wrapLoomcycleError(
				new Error('User ID is required when scope=user — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		const cursorKey = `channel:${channel}:${scope}:${userId ?? ''}`;

		try {
			if (deliveryMode === 'peek-ack') {
				const fromCursor = readCursor(this, cursorKey) || undefined;
				const resp = await client.peekChannel(channel, { scope, userId, fromCursor, maxMessages });
				const messages = resp.messages ?? [];
				if (messages.length === 0) return null;
				const lastId = messages[messages.length - 1].id;
				await client.ackChannel(channel, { scope, userId, cursor: lastId });
				writeCursor(this, cursorKey, lastId);
				return [messages.map((m) => ({ json: m as unknown as IDataObject }))];
			}

			// auto-ack: poll-once subscribe (waitMs: 0); substrate commits the cursor.
			const resp = await client.subscribeChannel(channel, { scope, userId, maxMessages, waitMs: 0 });
			const messages = resp.messages ?? [];
			if (messages.length === 0) return null;
			return [messages.map((m) => ({ json: m as unknown as IDataObject }))];
		} catch (err) {
			throw wrapLoomcycleError(err, this.getNode());
		}
	}
}
