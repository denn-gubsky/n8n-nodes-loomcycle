import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { factOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Fact — the RFC CC verified-writes tier over the Document store
 * (loomcycle ≥ v1.54; entity tier from v1.42, `remember` from v1.55).
 *
 * A fact is a claim ABOUT A SUBJECT that stores the exact source span it was
 * drawn from, so a write-time judge can check the claim against its own
 * evidence. A fact that fails is withheld from reads rather than deleted.
 *
 * Shares the wire method with LoomCycle Document; split out because the
 * audience differs — structure editing versus claim-making.
 */
export class LoomCycleFact implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Fact',
		name: 'loomCycleFact',
		icon: 'file:LoomCycleFact.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Record, verify + recall loomcycle facts with their evidence',
		defaults: { name: 'LoomCycle Fact' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'fact' },
			...factOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'fact');
	}
}
