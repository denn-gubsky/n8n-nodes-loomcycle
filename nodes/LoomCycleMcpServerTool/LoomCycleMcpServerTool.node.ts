import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { z } from 'zod';
import type { RunOptions, SubstrateToolInput } from '@loomcycle/client';
import { NotFoundError } from '@loomcycle/client';

import { getClient, getCredentialDefault } from '../LoomCycle/helpers/client';
import { buildSegments } from '../LoomCycle/helpers/segments';
import { drainRunStream } from '../LoomCycle/helpers/streaming';
import { extractEnvVarsFromHeaders } from '../LoomCycle/helpers/envVarHints';
import { buildTool } from '../_shared/clusterTool';

/**
 * `LoomCycle MCP Server Tool` — **the strategic differentiator** for the
 * n8n integration.
 *
 * Wires a single MCP server registration into loomcycle's substrate
 * idempotently (get-then-create), then exposes a tool the parent AI
 * Agent can call to delegate work to a loomcycle agent that has access
 * to that MCP server's tool surface.
 *
 * Flow on `supplyData`:
 *   1. Read tool config (name, transport, URL, headers, the loomcycle
 *      agent to spawn).
 *   2. Refuse stdio transport with `NodeOperationError` (stdio MCP
 *      servers must live in loomcycle.yaml — the substrate enforces
 *      this; we surface it pre-wire for a cleaner error).
 *   3. Idempotent ensure: `mcpServerDef({op:"get", name})` → on
 *      `NotFoundError`, `mcpServerDef({op:"create", ...})`. This means
 *      the second-and-Nth canvas runs are no-ops; the first run does
 *      the actual registration.
 *   4. Return a tool that, when invoked, spawns the configured
 *      loomcycle agent with `allowed_tools: ["mcp__<name>__*"]` so
 *      the agent has access to the just-registered MCP server's tools.
 *
 * Lifecycle: **`cleanupOnEnd: false` default** — registrations persist
 * across workflow executions so multiple agentic teams share stable
 * MCP fleets without churn. Opt in to retire-on-workflow-end via the
 * sub-node parameter when you want ephemeral / scoped registrations.
 */
const McpServerInputSchema = z.object({
	prompt: z.string().describe('Prompt sent to the loomcycle agent (which has access to the MCP server\'s tools)'),
});

export class LoomCycleMcpServerTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle MCP Server Tool',
		name: 'loomCycleMcpServerTool',
		icon: 'file:LoomCycleMcpServerTool.svg',
		group: ['transform'],
		version: 1,
		description:
			'Registers an MCP server in the loomcycle substrate (idempotent), then exposes a tool that delegates to a loomcycle agent using that MCP server',
		defaults: { name: 'LoomCycle MCP Server Tool' },
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
				default: 'loomcycle_mcp',
				required: true,
				description: 'Name of the tool surfaced to the parent AI Agent',
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				typeOptions: { rows: 3 },
				default:
					'Delegate a task to a loomcycle agent that has access to the configured MCP server. Pass the task as the prompt.',
				description: 'Description the AI Agent sees when deciding whether to call the tool',
			},
			{
				displayName: 'MCP Server Name',
				name: 'mcpName',
				type: 'string',
				default: '',
				required: true,
				description:
					'Registration name in loomcycle — referenced by agents as `mcp__&lt;name&gt;__&lt;tool&gt;`. Must be unique across the substrate; collisions with static yaml entries are refused.',
			},
			{
				displayName: 'Transport',
				name: 'transport',
				type: 'options',
				default: 'streamable-http',
				required: true,
				options: [
					{ name: 'HTTP', value: 'http', description: 'Classic JSON-RPC over HTTP POST' },
					{ name: 'Streamable HTTP', value: 'streamable-http', description: 'MCP Streamable HTTP transport (recommended)' },
				],
				description: 'Transport for the MCP server. Stdio is intentionally not supported here — register stdio MCPs in loomcycle.yaml.',
			},
			{
				displayName: 'URL',
				name: 'mcpUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://mcp.example.com/v1',
				description: 'MCP server endpoint URL. Hostname must be in loomcycle\'s HTTPHostAllowlist.',
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'fixedCollection',
				placeholder: 'Add Header',
				default: {},
				typeOptions: { multipleValues: true },
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								required: true,
								description:
									'Supports `${LOOMCYCLE_FOO}` env-var substitution + `${run.user_bearer:-FALLBACK}` per-run substitution',
							},
						],
					},
				],
				description:
					'Headers attached to every MCP call. Use template strings (`${LOOMCYCLE_FOO_TOKEN}`) — plaintext credentials never travel through this wire path.',
			},
			{
				displayName: 'Loomcycle Agent',
				name: 'agent',
				type: 'string',
				default: '',
				required: true,
				description:
					'Loomcycle agent name to spawn when the parent AI Agent invokes this tool. The spawn will include `mcp__&lt;name&gt;__*` in allowed_tools so the agent can reach the MCP server.',
			},
			{
				displayName: 'Cleanup On Workflow End',
				name: 'cleanupOnEnd',
				type: 'boolean',
				default: false,
				description:
					'Whether to retire the MCP server registration when the workflow execution ends. Default false: registrations persist so multiple agentic teams share stable MCP fleets without churn.',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const toolName = this.getNodeParameter('toolName', 0, 'loomcycle_mcp') as string;
		const toolDescription = this.getNodeParameter('toolDescription', 0, '') as string;
		const mcpName = this.getNodeParameter('mcpName', 0) as string;
		const transport = this.getNodeParameter('transport', 0) as string;
		const mcpUrl = this.getNodeParameter('mcpUrl', 0) as string;
		const headersParam = this.getNodeParameter('headers', 0, {}) as unknown;
		const agent = this.getNodeParameter('agent', 0) as string;
		const cleanupOnEnd = this.getNodeParameter('cleanupOnEnd', 0, false) as boolean;

		if (transport !== 'http' && transport !== 'streamable-http') {
			throw new NodeOperationError(
				this.getNode(),
				`Transport must be HTTP or Streamable-HTTP. Stdio MCP servers must be declared in loomcycle.yaml — dynamic registration does not support stdio.`,
			);
		}

		const headers = collectHeaders(headersParam);
		const client = await getClient(this);
		const userIdDefault = await getCredentialDefault(this, 'userId');
		const userTierDefault = await getCredentialDefault(this, 'userTier');

		// Idempotent ensure: try get; on NotFoundError, create.
		try {
			await client.mcpServerDef({ op: 'get', name: mcpName });
		} catch (err) {
			if (!(err instanceof NotFoundError)) {
				throw err;
			}
			const createInput: SubstrateToolInput = {
				op: 'create',
				name: mcpName,
				promote: true,
				// transport / url / headers ride on the index-signature
				// (SubstrateToolInput has `[extra: string]: unknown`).
				transport,
				url: mcpUrl,
			};
			if (Object.keys(headers).length > 0) createInput.headers = headers;
			await client.mcpServerDef(createInput);
		}

		// Env-var hints (defence-in-depth — surface in the node's log so
		// operators see which env vars must exist on the loomcycle side).
		const envVars = extractEnvVarsFromHeaders(headersParam);
		if (envVars.length > 0) {
			this.logger.info?.(
				`[LoomCycleMcpServerTool] MCP server ${mcpName} registered. Required env vars on loomcycle: ${envVars.join(', ')}`,
			);
		}

		const allowedToolGlob = `mcp__${mcpName}__*`;

		const tool = buildTool({
			name: toolName,
			description: toolDescription,
			schema: McpServerInputSchema,
			fn: async (args) => {
				const runOpts: RunOptions = {
					agent,
					segments: buildSegments(args.prompt, true), // model-supplied prompt → untrusted
					allowedTools: [allowedToolGlob],
				};
				if (userIdDefault) runOpts.userId = userIdDefault;
				if (userTierDefault) runOpts.userTier = userTierDefault;

				const result = await drainRunStream(client.runStreaming(runOpts));
				return result.finalText;
			},
		});

		const supplyData: SupplyData = { response: tool };

		if (cleanupOnEnd) {
			supplyData.closeFunction = async () => {
				try {
					await client.mcpServerDef({ op: 'retire', name: mcpName });
				} catch {
					// Best-effort cleanup; n8n's lifecycle calls closeFunction
					// at workflow-end and we don't want a failed retire to
					// taint the workflow's success state.
				}
			};
		}

		return supplyData;
	}
}

/**
 * Collect headers from the n8n fixedCollection shape into a map.
 * Identical to the helper inside the umbrella node's executeMcpServerDef
 * — kept local because the umbrella's lives in a closure and we want
 * the cluster sub-node to be standalone.
 */
function collectHeaders(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (!raw || typeof raw !== 'object') return out;
	const headerCollection = (raw as { header?: unknown }).header;
	if (!Array.isArray(headerCollection)) return out;
	for (const entry of headerCollection) {
		if (!entry || typeof entry !== 'object') continue;
		const name = (entry as { name?: unknown }).name;
		const value = (entry as { value?: unknown }).value;
		if (typeof name === 'string' && name && typeof value === 'string') {
			out[name] = value;
		}
	}
	return out;
}
