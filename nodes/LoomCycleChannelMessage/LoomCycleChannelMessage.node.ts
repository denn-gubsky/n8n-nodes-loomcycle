import type {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import type { ChannelScope } from '@loomcycle/client';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { wrapLoomcycleError } from '../LoomCycle/helpers/errors';
import { loadChannels } from '../LoomCycle/helpers/loadOptions';
import { runSubscribeLoop, subscribeOnce } from './helpers/subscribe';

/**
 * `LoomCycle: Channel Message` — trigger that fires when a new
 * message lands on a watched loomcycle channel.
 *
 * Two delivery modes:
 *   - `auto-ack`: direct long-poll subscribeChannel (at-most-once;
 *     fastest path)
 *   - `peek-ack`: peekChannel + explicit ackChannel after emit (at-
 *     least-once; survives workflow crashes mid-processing)
 *
 * Both modes ride the v0.9.2 PR #180 Channel CRUD wire surface — no
 * one-shot agents.
 */
export class LoomCycleChannelMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Channel Message',
		name: 'loomCycleChannelMessage',
		icon: 'file:LoomCycleChannelMessage.svg',
		group: ['trigger'],
		version: 1,
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
						description: 'Direct long-poll subscribe; substrate auto-commits the cursor',
					},
					{
						name: 'Peek + Explicit Ack (At-Least-Once)',
						value: 'peek-ack',
						description: 'Peek non-destructively, emit, then ack — survives crashes mid-processing',
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Max Messages per Batch',
						name: 'maxMessages',
						type: 'number',
						default: 10,
						typeOptions: { minValue: 1, maxValue: 1000 },
						description: 'Maximum number of messages to return per long-poll round',
					},
					{
						displayName: 'Wait Ms',
						name: 'waitMs',
						type: 'number',
						default: 30000,
						typeOptions: { minValue: 0, maxValue: 60000 },
						description: 'Long-poll wait timeout for auto-ack mode (server cap typically 30s). For peek-ack mode, sleep between empty peeks.',
					},
					{
						displayName: 'Error Backoff (Ms)',
						name: 'backoffMs',
						type: 'number',
						default: 5000,
						typeOptions: { minValue: 500, maxValue: 60000 },
						description: 'How long to wait after an error before retrying',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			loadChannels,
		},
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const channel = this.getNodeParameter('channel', '') as string;
		const scope = (this.getNodeParameter('scope', 'global') as ChannelScope) ?? 'global';
		const userIdParam = (this.getNodeParameter('userId', '') as string) ?? '';
		const deliveryMode = (this.getNodeParameter('deliveryMode', 'auto-ack') as 'auto-ack' | 'peek-ack') ?? 'auto-ack';
		const additionalFields = (this.getNodeParameter('additionalFields', {}) as Record<string, unknown>) ?? {};

		if (!channel) {
			throw wrapLoomcycleError(new Error('Channel name is required'), this.getNode());
		}

		const userId =
			scope === 'user' ? userIdParam || (await getCredentialDefault(this, 'userId')) : undefined;
		if (scope === 'user' && !userId) {
			throw wrapLoomcycleError(
				new Error('User ID is required when scope=user — set per-node or as Default User ID on the credential'),
				this.getNode(),
			);
		}

		const client = await getClient(this);
		const ac = new AbortController();

		const loopOpts = {
			client,
			channel,
			scope,
			userId,
			deliveryMode,
			maxMessages: (additionalFields.maxMessages as number) ?? 10,
			waitMs: (additionalFields.waitMs as number) ?? 30000,
			backoffMs: (additionalFields.backoffMs as number) ?? 5000,
			signal: ac.signal,
		} as const;

		void runSubscribeLoop.call(this, loopOpts);

		async function manualTriggerFunction(this: ITriggerFunctions): Promise<void> {
			const oneShotAc = new AbortController();
			await subscribeOnce.call(this, { ...loopOpts, signal: oneShotAc.signal });
		}

		return {
			closeFunction: async () => {
				ac.abort();
			},
			manualTriggerFunction: manualTriggerFunction.bind(this),
		};
	}
}
