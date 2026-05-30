import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadAgents, loadChannels } from '../LoomCycle/helpers/loadOptions';
import { webhookDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Webhook — manage loomcycle inbound webhook endpoints (RFC H):
 * create / fork / get / list / retire. An external POST to the loomcycle-
 * hosted endpoint spawns an agent run or publishes to a channel.
 *
 * INBOUND direction — distinct from the LoomCycle Hook node (outbound
 * pre/post-tool callbacks). Per-resource action node (v2.1.0).
 */
export class LoomCycleWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Webhook',
		name: 'loomCycleWebhook',
		icon: 'file:LoomCycleWebhook.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage loomcycle inbound webhook endpoints (RFC H) over HTTP',
		defaults: { name: 'LoomCycle Webhook' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'webhookDef' },
			...webhookDefOps,
		],
	};

	methods = {
		loadOptions: {
			loadAgents,
			loadChannels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'webhookDef');
	}
}
