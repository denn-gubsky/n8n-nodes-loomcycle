import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { interruptionOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Interruption — human-in-the-loop over Interruption.ask
 * (list pending asks by user / run, resolve one with a human's answer).
 * The answer unblocks the parked agent. Pair with the LoomCycle: Interrupt
 * Pending trigger to drive the whole ask → human → resolve loop in n8n.
 */
export class LoomCycleInterruption implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Interruption',
		name: 'loomCycleInterruption',
		icon: 'file:LoomCycleInterruption.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'List + resolve loomcycle agent interruptions (human-in-the-loop)',
		defaults: { name: 'LoomCycle Interruption' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'interruption' },
			...interruptionOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'interruption');
	}
}
