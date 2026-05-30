import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { a2aAgentDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle A2A Agent — A2A (Agent2Agent, RFC G) client-side admin: register
 * external A2A agents loomcycle can call as tools (create / fork / get /
 * list / retire). Per-resource action node (v2.1.0).
 */
export class LoomCycleA2aAgent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle A2A Agent',
		name: 'loomCycleA2aAgent',
		icon: 'file:LoomCycleA2aAgent.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Register external A2A agents loomcycle can call (RFC G) over HTTP',
		defaults: { name: 'LoomCycle A2A Agent' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'a2aAgentDef' },
			...a2aAgentDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'a2aAgentDef');
	}
}
