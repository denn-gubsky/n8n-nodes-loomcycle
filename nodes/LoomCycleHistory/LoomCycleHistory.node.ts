import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { historyOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle History — past chats as first-class objects (RFC BE, loomcycle
 * ≥ v1.20). Browse, search, annotate, pin, archive, recap and resume the
 * conversation sessions a deployment has accumulated.
 *
 * The owner is resolved server-side from the authenticated principal, so you
 * choose a scope (self / user / tenant / global) rather than naming an owner.
 *
 * Note that `Search` matches the chat TITLE only; `Related` is the semantic,
 * content-aware path.
 */
export class LoomCycleHistory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle History',
		name: 'loomCycleHistory',
		icon: 'file:LoomCycleHistory.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Browse, search + annotate past loomcycle chats',
		defaults: { name: 'LoomCycle History' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'history' },
			...historyOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'history');
	}
}
