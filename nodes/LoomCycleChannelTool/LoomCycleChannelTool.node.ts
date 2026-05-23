import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { z } from 'zod';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { buildTool } from '../_shared/clusterTool';

/**
 * `LoomCycle Channel Tool` — cluster sub-node exposing Channel Publish +
 * Peek as a tool the AI Agent can call. (Subscribe is intentionally a
 * trigger node, not a tool; Ack would couple to durable cursor state
 * better handled by the action node.)
 */
const ChannelInputSchema = z.object({
	op: z.enum(['publish', 'peek']).describe('Channel operation to invoke'),
	channel: z.string().describe('Channel name'),
	scope: z.enum(['global', 'user']).default('global').describe('Channel scope'),
	userId: z
		.string()
		.optional()
		.describe('User_id for scope=user. Falls through to the credential default if empty.'),
	payload: z
		.unknown()
		.optional()
		.describe('JSON-serialisable payload (publish only). Required for publish.'),
	deliverAt: z
		.string()
		.optional()
		.describe('Optional RFC3339 deferred-delivery timestamp (publish only)'),
	fromCursor: z.string().optional().describe('Resume cursor (peek only). Empty = oldest non-expired row.'),
	maxMessages: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('Max messages to return (peek only). Defaults to 10 substrate-side.'),
});

export class LoomCycleChannelTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Channel Tool',
		name: 'loomCycleChannelTool',
		icon: 'file:LoomCycleChannelTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Loomcycle Channel ops (publish + peek) as a tool the AI Agent can call',
		defaults: { name: 'LoomCycle Channel Tool' },
		codex: { categories: ['AI'], subcategories: { AI: ['Tools'] } },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'string',
				default: 'loomcycle_channel',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 3 },
				default:
					'Publish or peek at loomcycle channel messages. Use op=publish+channel+payload to publish; op=peek+channel to non-destructively read.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_channel') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const client = await getClient(this);
		const credentialUserIdDefault = await getCredentialDefault(this, 'userId');

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: ChannelInputSchema,
			fn: async (args) => {
				const scope = args.scope ?? 'global';
				const userId = scope === 'user' ? args.userId || credentialUserIdDefault : undefined;
				if (scope === 'user' && !userId) {
					throw new Error('userId required when scope=user (set on tool args or as credential default)');
				}

				if (args.op === 'publish') {
					if (args.payload === undefined) {
						throw new Error('payload is required for publish');
					}
					return client.publishChannel(args.channel, {
						scope,
						userId,
						payload: args.payload,
						deliverAt: args.deliverAt,
					});
				}
				// peek
				return client.peekChannel(args.channel, {
					scope,
					userId,
					fromCursor: args.fromCursor,
					maxMessages: args.maxMessages,
				});
			},
		});

		return { response: tool };
	}
}
