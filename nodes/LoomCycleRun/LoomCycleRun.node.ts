import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadAgents } from '../LoomCycle/helpers/loadOptions';
import { runOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Run — spawn / inspect / wait / cancel / list agent runs.
 *
 * One of the per-resource action nodes split out of the former umbrella
 * node (v2.0.0) so each entity carries its own canvas icon. A hidden
 * `resource` parameter pins the shared op descriptions (which gate on
 * `resource: ['run']`) to this node; execute() delegates to the shared
 * engine with the fixed resource.
 */
export class LoomCycleRun implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Run',
		name: 'loomCycleRun',
		icon: 'file:LoomCycleRun.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Spawn and manage loomcycle agent runs over HTTP+SSE',
		defaults: { name: 'LoomCycle Run' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'run' },
			...runOps,
		],
	};

	methods = {
		loadOptions: {
			loadAgents,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'run');
	}
}
