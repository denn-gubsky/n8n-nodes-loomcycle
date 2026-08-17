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
 * `LoomCycle Fact Tool` — cluster sub-node exposing loomcycle's RFC CC
 * verified-writes fact tier to n8n's AI Agent (loomcycle ≥ v1.54, SQL Memory
 * required).
 *
 * **FULL EDITION ONLY** — see LoomCycleDocumentTool for why slim cannot ship it.
 *
 * Three deliberate omissions from the action node's 10 ops, all about who is
 * allowed to decide what:
 *
 *  - **`judge_fact` is not here.** A judge verdict is the substrate's integrity
 *    mechanism; letting the same agent that wrote a fact also rule it supported
 *    collapses the check into self-attestation. Judging stays on the action node,
 *    where a human or a separate workflow performs it.
 *  - **`supersede_chunk` is not here.** Retiring a fact is a two-id operation an
 *    agent has no reliable way to get right mid-conversation, and a wrong pairing
 *    silently rewrites history. Corrections go through an operator.
 *  - **`propose_entity` is not here.** It is already the only ontology write an
 *    agent may make, and its output is inert until an operator accepts it — so
 *    exposing it to a tool loop mostly generates queue noise.
 *
 * `remember` IS here, because recording what a person told you is exactly what
 * an agent in a conversation is positioned to do.
 */
const FactInputSchema = z.object({
	op: z
		.enum([
			'list_facts',
			'graph_recall',
			'verbatim_answer',
			'search',
			'upsert_chunk',
			'remember',
			'verification_stats',
		])
		.describe('Which Fact operation to invoke'),
	scope: z
		.enum(['agent', 'user', 'tenant'])
		.optional()
		.describe('Which store to address. Default comes from the node config.'),
	subject: z
		.string()
		.optional()
		.describe('The entity a fact is ABOUT (upsert_chunk / remember). Pair it with type — a fact carries both, a plain chunk carries neither.'),
	type: z
		.string()
		.optional()
		.describe('Entity type, e.g. person / project. On list_facts this is the filter, and it INCLUDES SUBTYPES. Note list_facts does NOT filter by subject.'),
	document_id: z.string().optional().describe('Document to file the fact under. REQUIRED for upsert_chunk — a fact is still a chunk.'),
	natural_key: z
		.string()
		.optional()
		.describe('Stable identity for the fact, e.g. person:ada-lovelace or subject|predicate|object. Upserting twice with the same key updates ONE fact instead of duplicating.'),
	title: z.string().optional().describe('Short label for the fact'),
	body: z.string().optional().describe('The claim itself (upsert_chunk)'),
	source_quote: z
		.string()
		.optional()
		.describe('The EXACT source text the claim came from, copied verbatim — not a paraphrase. A write-time judge checks the claim against this span, and a fact with no span cannot be verified.'),
	text: z
		.string()
		.optional()
		.describe('remember only — one self-contained sentence a person supplied. Stored verbatim AND used as its own source span, so write what you mean recorded, not an instruction about it.'),
	query: z
		.string()
		.optional()
		.describe('verbatim_answer: the lookup question. graph_recall: matches starting chunks by title. search: matched semantically against chunk bodies.'),
	include_refuted: z
		.boolean()
		.optional()
		.describe('Also return facts a judge marked unsupported. Off by default — these are withheld deliberately, so only ask for them to audit what failed.'),
	include_retired: z.boolean().optional().describe('Also return facts that have been superseded. Off by default, so you get only what is currently true.'),
	limit: z.number().int().positive().optional().describe('Max results to return'),
});

export class LoomCycleFactTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle Fact Tool',
		name: 'loomCycleFactTool',
		icon: 'file:LoomCycleFactTool.svg',
		group: ['transform'],
		version: 1,
		description: 'Record + recall loomcycle facts with their evidence, as a tool the AI Agent can call',
		defaults: { name: 'LoomCycle Fact Tool' },
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
				default: 'loomcycle_fact',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent — must be unique across sibling tools',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 5 },
				default:
					'Record and recall verified facts about people, projects and things. Every fact stores the exact source text it came from, so ALWAYS pass source_quote copied verbatim when writing one. Use op=verbatim_answer+query to answer a lookup question with a stored fact quoted exactly, op=list_facts+type or op=graph_recall+query to browse, op=search+query to find by body text, op=upsert_chunk (document_id + subject + type + natural_key + body + source_quote) to record a derived fact, op=remember+text to record a statement a person just told you.',
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
					'Store used when the model does not name one. Prefer `agent` or `user`: anything written to `tenant` is read by every user and agent in it, so a fact an agent derived from untrusted text does not belong there.',
			},
			{
				displayName: 'Allow Writes',
				name: 'allowWrites',
				type: 'boolean',
				default: true,
				description:
					'Whether the agent may record facts (upsert_chunk / remember) as well as read them. Turn off for a read-only recall tool — a useful posture when the agent processes untrusted input, since a fact it writes becomes evidence later reasoning trusts.',
			},
			{
				displayName: 'Judging, superseding and ontology proposals are deliberately NOT exposed here. A judge verdict is the substrate\'s integrity check, so an agent ruling on its own fact would collapse it into self-attestation; superseding pairs two chunk IDs, and a mis-pairing silently rewrites history. Use the LoomCycle Fact action node for those.',
				name: 'omittedOpsNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_fact') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const defaultScope = this.getNodeParameter('defaultScope', 0, 'user') as DocumentToolInput['scope'];
		const allowWrites = this.getNodeParameter('allowWrites', 0, true) as boolean;
		const client = await getClient(this);

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: FactInputSchema,
			fn: (args) => runFactOp(client, args, defaultScope, allowWrites),
		});

		return { response: tool };
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const defaultScope = this.getNodeParameter('defaultScope', 0, 'user') as DocumentToolInput['scope'];
		const allowWrites = this.getNodeParameter('allowWrites', 0, true) as boolean;
		const client = await getClient(this);
		return executeToolFn.call(this, {
			schema: FactInputSchema,
			fn: (args) => runFactOp(client, args, defaultScope, allowWrites),
		});
	}
}

const WRITE_OPS = new Set(['upsert_chunk', 'remember']);

async function runFactOp(
	client: LoomcycleClient,
	args: z.infer<typeof FactInputSchema>,
	defaultScope: DocumentToolInput['scope'],
	allowWrites: boolean,
): Promise<unknown> {
	// Enforced here rather than by narrowing the schema, so a blocked attempt
	// returns a message the agent can read and adapt to instead of a Zod parse
	// failure it cannot interpret.
	if (!allowWrites && WRITE_OPS.has(args.op)) {
		throw new Error(
			`op=${args.op} is a write and this tool is configured read-only. Recall facts instead, or ask the operator to enable writes.`,
		);
	}
	if (args.op === 'upsert_chunk' && !args.document_id) {
		throw new Error('document_id is required for upsert_chunk — a fact is a chunk, so it must live in a document');
	}
	if (args.op === 'remember' && !args.text) {
		throw new Error('text is required for remember');
	}

	const input: DocumentToolInput = {
		op: args.op,
		scope: args.scope ?? defaultScope,
	};

	const copy: string[] = [
		'subject',
		'type',
		'document_id',
		'natural_key',
		'title',
		'body',
		'source_quote',
		'text',
		'query',
		'include_refuted',
		'include_retired',
		'limit',
	];
	for (const key of copy) {
		const value = (args as Record<string, unknown>)[key];
		if (value !== undefined) {
			(input as Record<string, unknown>)[key] = value;
		}
	}

	return client.document(input);
}
