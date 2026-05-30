import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { hookOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Hook — pre/post-tool webhook registration (register / list /
 * delete). The callback URL typically points at an n8n Webhook trigger.
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleHook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Hook',
		name: 'loomCycleHook',
		icon: 'file:LoomCycleHook.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Register loomcycle pre/post-tool webhook callbacks over HTTP',
		defaults: { name: 'LoomCycle Hook' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'hook' },
			...hookOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'hook');
	}
}
