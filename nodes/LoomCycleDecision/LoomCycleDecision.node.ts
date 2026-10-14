import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadDecisionModels } from '../LoomCycle/helpers/loadOptions';
import { decisionOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Decision — ask a loomcycle decision model typed questions (choice,
 * yes / no, score) about a piece of state, and get each answer with its
 * probabilities (RFC EB, loomcycle ≥ v1.107). The cheap classifier in front of
 * an IF or Switch node.
 */
export class LoomCycleDecision implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Decision',
		name: 'loomCycleDecision',
		icon: 'file:LoomCycleDecision.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Ask a loomcycle decision model typed questions and branch on the answers',
		defaults: { name: 'LoomCycle Decision' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'decision' },
			...decisionOps,
		],
	};

	methods = {
		loadOptions: {
			loadDecisionModels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'decision');
	}
}
