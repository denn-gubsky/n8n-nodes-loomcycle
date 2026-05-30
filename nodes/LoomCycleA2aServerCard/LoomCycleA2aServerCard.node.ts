import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { a2aServerCardDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle A2A Server Card — A2A (Agent2Agent, RFC G) server-side admin:
 * manage the agent card loomcycle publishes to expose its own agents to
 * external A2A clients (create / fork / get / list / retire). Per-resource
 * action node (v2.1.0).
 */
export class LoomCycleA2aServerCard implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle A2A Server Card',
		name: 'loomCycleA2aServerCard',
		icon: 'file:LoomCycleA2aServerCard.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Publish/manage the A2A server card exposing loomcycle agents (RFC G) over HTTP',
		defaults: { name: 'LoomCycle A2A Server Card' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'a2aServerCardDef' },
			...a2aServerCardDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'a2aServerCardDef');
	}
}
