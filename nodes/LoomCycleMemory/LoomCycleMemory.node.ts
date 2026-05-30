import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadMemoryScopes } from '../LoomCycle/helpers/loadOptions';
import { memoryOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Memory — get / set / list / delete substrate memory entries.
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleMemory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Memory',
		name: 'loomCycleMemory',
		icon: 'file:LoomCycleMemory.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Read and write loomcycle substrate memory over HTTP',
		defaults: { name: 'LoomCycle Memory' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'memory' },
			...memoryOps,
		],
	};

	methods = {
		loadOptions: {
			loadMemoryScopes,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'memory');
	}
}
