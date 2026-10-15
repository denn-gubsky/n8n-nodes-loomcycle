import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { evaluationOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Evaluation — record scores against runs and roll them up per
 * definition version (loomcycle ≥ v1.113 over HTTP). The substrate half of an
 * evaluation loop that n8n schedules: score yesterday's runs, compare versions,
 * report.
 */
export class LoomCycleEvaluation implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Evaluation',
		name: 'loomCycleEvaluation',
		icon: 'file:LoomCycleEvaluation.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Score loomcycle runs and aggregate the scores per agent definition version',
		defaults: { name: 'LoomCycle Evaluation' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'evaluation' },
			...evaluationOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'evaluation');
	}
}
