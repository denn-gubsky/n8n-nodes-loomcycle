import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { erasureOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Erasure — subject erasure (RFC BL P5, loomcycle ≥ v1.45).
 *
 * The natural home for a GDPR data-subject-request workflow. Report is
 * read-only; Execute defaults to a dry run and requires an explicit
 * confirmation to commit, because the deletion is irreversible.
 *
 * The Execute response is the ONLY durable record of tier-3 residue — facts
 * about the subject that erasure could not reach — so persist this node's
 * output rather than discarding it.
 */
export class LoomCycleErasure implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Erasure',
		name: 'loomCycleErasure',
		icon: 'file:LoomCycleErasure.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Report or erase everything held about one subject',
		defaults: { name: 'LoomCycle Erasure' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'erasure' },
			...erasureOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'erasure');
	}
}
