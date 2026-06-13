import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { executeLoomCycle } from '../LoomCycle/execute';
import { llmOps } from '../LoomCycle/descriptions';

/**
 * LoomCycle LLM — direct calls to loomcycle's LLM gateway (chat completion +
 * embeddings) as a workflow step, with provider routing / auth / retry handled
 * substrate-side. Distinct from the LoomCycle Chat Model sub-node (which feeds
 * an AI Agent) — this is a plain action node for RAG / embedding pipelines.
 */
export class LoomCycleLlm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle LLM',
		name: 'loomCycleLlm',
		icon: 'file:LoomCycleLlm.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Chat completion + embeddings via loomcycle\'s LLM gateway',
		defaults: { name: 'LoomCycle LLM' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'hidden', default: 'llm' },
			...llmOps,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return executeLoomCycle(this, 'llm');
	}
}
