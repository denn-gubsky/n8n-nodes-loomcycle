import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { usageOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Usage — token/cost attribution (RFC AV, loomcycle ≥ v1.10), per-scope
 * token budgets (RFC AW, ≥ v1.11) and the instance capability report (≥ v1.38).
 *
 * The FinOps surface: what was spent, which key paid, and what ceilings apply.
 * Budget writes stay operator-only even for a tenant member.
 */
export class LoomCycleUsage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Usage',
		name: 'loomCycleUsage',
		icon: 'file:LoomCycleUsage.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Report token usage + cost and manage token budgets',
		defaults: { name: 'LoomCycle Usage' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'usage' },
			...usageOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'usage');
	}
}
