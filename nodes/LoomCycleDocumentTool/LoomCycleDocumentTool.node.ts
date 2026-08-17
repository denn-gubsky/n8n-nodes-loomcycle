import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import type { DocumentToolInput, LoomcycleClient } from '@loomcycle/client';
import { z } from 'zod';

import { getClient } from '../LoomCycle/helpers/client';
import { buildTool, executeToolFn } from '../_shared/clusterTool';

/**
 * `LoomCycle Document Tool` — cluster sub-node exposing loomcycle's
 * chunked-graph Document store to n8n's AI Agent (RFC AK + BS; loomcycle
 * ≥ v1.4, SQL Memory required).
 *
 * **FULL EDITION ONLY.** The slim edition cannot ship this: `@n8n/ai-node-sdk`
 * supports Chat Models and Memory but has no tool-supply API, so a community
 * Tool sub-node has to be built on `@langchain/core` — which n8n Cloud's
 * scanner bans.
 *
 * Deliberately a CURATED subset of the action node's 36 ops. A tool's schema is
 * part of the model's prompt, so 36 ops with ~30 conditional fields would burn
 * context and invite malformed calls. What an agent actually needs is to read,
 * search and append — the destructive and administrative ops (delete, federation
 * sync, canvas import, type definition) stay operator-only on the action node.
 */
const DocumentInputSchema = z.object({
	op: z
		.enum([
			'documents_summary',
			'get_document',
			'query_documents',
			'create_document',
			'create_chunk',
			'get_chunk',
			'update_chunk',
			'query_chunks',
			'add_tags',
			'list_tags',
			'backlinks',
			'related',
			'export_md',
		])
		.describe('Which Document operation to invoke'),
	scope: z
		.enum(['agent', 'user', 'tenant'])
		.optional()
		.describe('Which store to address. Default "user". "tenant" is shared across the whole tenant.'),
	id: z
		.string()
		.optional()
		.describe('Document id (get_document, export_md) or chunk id (get_chunk, update_chunk, add_tags, backlinks, related)'),
	path: z.string().optional().describe('Path-tree name, e.g. /docs/launch. Alternative to id on get_document; names a new document on create_document.'),
	document_id: z.string().optional().describe('Document the chunk belongs to. Required for create_chunk.'),
	parent_id: z.string().optional().describe('Parent chunk for create_chunk. Omit to attach to the document root.'),
	title: z.string().optional().describe('Title for a new document or chunk. What graph recall and [[name]] links match against.'),
	body: z
		.string()
		.optional()
		.describe('Markdown body of a chunk. [[name]] creates a reference edge; bodies are embedded on write so search can find them.'),
	type: z.string().optional().describe('Chunk type, e.g. decision / requirement. On query_chunks this filter includes subtypes.'),
	status: z.string().optional().describe('Chunk status, e.g. open / done'),
	tags: z
		.array(z.string())
		.optional()
		.describe('Nested tags use "/". On create/update this REPLACES the whole tag set; on add_tags it is the delta to add.'),
	tag: z.string().optional().describe('Exact tag to filter by (query_chunks / query_documents)'),
	tag_prefix: z.string().optional().describe('Match a tag or anything nested under it (query_chunks)'),
	under_path: z.string().optional().describe('Restrict to documents at or under this path'),
	revision: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('update_chunk only — the chunk\'s current revision, for optimistic concurrency. A stale value is refused rather than silently overwriting.'),
	limit: z.number().int().positive().optional().describe('Max results to return'),
});

export class LoomCycleDocumentTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Document Tool',
		name: 'loomCycleDocumentTool',
		icon: 'file:LoomCycleDocumentTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Read, search + author loomcycle documents as a tool the AI Agent can call',
		defaults: { name: 'LoomCycle Document Tool' },
		codex: { categories: ['AI'], subcategories: { AI: ['Tools'] } },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'string',
				default: 'loomcycle_document',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent — must be unique across sibling tools',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 5 },
				default:
					'Read, search and author structured documents in loomcycle. A document is a tree of typed chunks. Use op=documents_summary to see what exists, op=query_chunks (with type/status/tag/under_path) or op=related to find content, op=get_document / op=get_chunk to read, op=create_document then op=create_chunk (with document_id, parent_id, title, body) to write, op=update_chunk (pass revision) to revise, op=add_tags to label, op=export_md to render a whole document as Markdown.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
			{
				displayName: 'Default Scope',
				name: 'defaultScope',
				type: 'options',
				default: 'user',
				options: [
					{ name: 'Agent', value: 'agent' },
					{ name: 'User', value: 'user' },
					{ name: 'Tenant (Shared)', value: 'tenant' },
				],
				description:
					'Store used when the model does not name one. Pinning this to `agent` or `user` is the safer default — `tenant` is read by every user and agent in the tenant, so an agent writing there on the strength of untrusted input contaminates a shared surface.',
			},
			{
				displayName: 'Requires SQL Memory on the loomcycle sidecar (LOOMCYCLE_SQLMEM_ENABLED=1). Every op refuses without it, and `tenant` scope additionally needs both memory_scopes and sql_scopes granted with tenant.',
				name: 'sqlMemoryNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_document') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const defaultScope = this.getNodeParameter('defaultScope', 0, 'user') as DocumentToolInput['scope'];
		const client = await getClient(this);

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: DocumentInputSchema,
			fn: (args) => runDocumentOp(client, args, defaultScope),
		});

		return { response: tool };
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const defaultScope = this.getNodeParameter('defaultScope', 0, 'user') as DocumentToolInput['scope'];
		const client = await getClient(this);
		return executeToolFn.call(this, {
			schema: DocumentInputSchema,
			fn: (args) => runDocumentOp(client, args, defaultScope),
		});
	}
}

/**
 * Assemble the op-discriminated payload, omitting every field the model did not
 * supply. The omit matters as much here as on the action node: an absent `tags`
 * means "leave unchanged" while `[]` means "clear", so forwarding a defaulted
 * empty array would let a model wipe a chunk's tags as a side effect of an
 * unrelated edit.
 */
async function runDocumentOp(
	client: LoomcycleClient,
	args: z.infer<typeof DocumentInputSchema>,
	defaultScope: DocumentToolInput['scope'],
): Promise<unknown> {
	if (args.op === 'create_chunk' && !args.document_id) {
		throw new Error('document_id is required for create_chunk');
	}
	if (args.op === 'update_chunk' && !args.id) {
		throw new Error('id is required for update_chunk');
	}

	const input: DocumentToolInput = {
		op: args.op,
		scope: args.scope ?? defaultScope,
	};

	const copy: Array<keyof typeof args & keyof DocumentToolInput> = [
		'id',
		'path',
		'document_id',
		'parent_id',
		'title',
		'body',
		'type',
		'status',
		'tags',
		'tag',
		'tag_prefix',
		'under_path',
		'revision',
		'limit',
	];
	for (const key of copy) {
		const value = args[key as keyof typeof args];
		if (value !== undefined) {
			(input as Record<string, unknown>)[key] = value;
		}
	}

	return client.document(input);
}
