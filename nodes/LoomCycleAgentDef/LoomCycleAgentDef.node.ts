import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { agentDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle Agent Definition — versioned AgentDef admin (create / fork /
 * get / list / promote / retire / verify).
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleAgentDef implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Agent Definition',
		name: 'loomCycleAgentDef',
		icon: 'file:LoomCycleAgentDef.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage versioned loomcycle agent definitions over HTTP',
		defaults: { name: 'LoomCycle Agent Definition' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'agentDef' },
			...agentDefOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'agentDef');
	}
}
