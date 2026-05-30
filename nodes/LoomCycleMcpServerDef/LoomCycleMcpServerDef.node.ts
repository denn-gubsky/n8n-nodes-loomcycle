import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { loadMcpLibrary } from '../LoomCycle/helpers/loadOptions';
import { mcpServerDefOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle MCP Server — dynamic MCPServerDef registration (register / fork /
 * get / list / promote / retire / rediscover / verify).
 * Per-resource action node split from the former umbrella node (v2.0.0).
 */
export class LoomCycleMcpServerDef implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle MCP Server',
		name: 'loomCycleMcpServerDef',
		icon: 'file:LoomCycleMcpServerDef.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Register and manage dynamic loomcycle MCP servers over HTTP',
		defaults: { name: 'LoomCycle MCP Server' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'mcpServerDef' },
			...mcpServerDefOps,
		],
	};

	methods = {
		loadOptions: {
			loadMcpLibrary,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'mcpServerDef');
	}
}
