import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { memoryBackendDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Memory Backend — versioned MemoryBackendDef admin (create / fork /
 * get / list / retire). Defines a named memory backend (in-process default or
 * an external REST store + ranker) that agents' Memory tool dispatches to
 * (RFC I, loomcycle v0.15).
 */
export class LoomCycleMemoryBackend implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Memory Backend',
		name: 'loomCycleMemoryBackend',
		icon: 'file:LoomCycleMemoryBackend.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage versioned loomcycle memory-backend definitions',
		defaults: { name: 'LoomCycle Memory Backend' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'memoryBackendDef' },
			...memoryBackendDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'memoryBackendDef');
	}
}
