import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadAgents } from '../LoomCycle/helpers/loadOptions';
import { scheduleDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Schedule — substrate-native scheduled-run admin (RFC E):
 * create / fork / get / list / retire.
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleSchedule implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Schedule',
		name: 'loomCycleSchedule',
		icon: 'file:LoomCycleSchedule.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage loomcycle substrate-native scheduled runs over HTTP',
		defaults: { name: 'LoomCycle Schedule' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'scheduleDef' },
			...scheduleDefOps,
		],
	};

	methods = {
		loadOptions: {
			loadAgents,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'scheduleDef');
	}
}
