import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadChannels } from '../LoomCycle/helpers/loadOptions';
import { channelOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Channel — publish / subscribe / peek / ack + channel admin CRUD.
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleChannel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Channel',
		name: 'loomCycleChannel',
		icon: 'file:LoomCycleChannel.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Publish to and consume loomcycle channels over HTTP',
		defaults: { name: 'LoomCycle Channel' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'channel' },
			...channelOps,
		],
	};

	methods = {
		loadOptions: {
			loadChannels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'channel');
	}
}
