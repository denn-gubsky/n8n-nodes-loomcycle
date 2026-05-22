import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { AgentStatus, ChannelScope, RunOptions } from '@loomcycle/client';

import { getClient, getCredentialDefault } from './helpers/client';
import { wrapLoomcycleError } from './helpers/errors';
import { buildSegments } from './helpers/segments';
import { drainRunStream } from './helpers/streaming';
import { loadAgents, loadChannels, loadMemoryScopes } from './helpers/loadOptions';
import { runOps, memoryOps, channelOps } from './descriptions';

/**
 * Umbrella action node for the loomcycle agentic runtime. Op-discriminated
 * across three resources in this sub-phase: `run`, `memory`, `channel`.
 *
 * Programmatic execute() (not declarative routing) because the load-bearing
 * paths go through `@loomcycle/client` rather than raw HTTP — typed-error
 * mapping + SSE drain + credential-default fall-through all live in JS.
 */
export class LoomCycle implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle',
		name: 'loomCycle',
		icon: 'file:LoomCycle.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Drive a loomcycle agentic runtime — Run / Memory / Channel ops over HTTP+SSE',
		defaults: { name: 'LoomCycle' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'loomCycleApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Run', value: 'run' },
					{ name: 'Memory', value: 'memory' },
					{ name: 'Channel', value: 'channel' },
				],
				default: 'run',
			},
			...runOps,
			...memoryOps,
			...channelOps,
		],
	};

	methods = {
		loadOptions: {
			loadAgents,
			loadChannels,
			loadMemoryScopes,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const client = await getClient(this);

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				let row: IDataObject | undefined;

				if (resource === 'run') {
					row = await executeRun.call(this, client, operation, i);
				} else if (resource === 'memory') {
					row = await executeMemory.call(this, client, operation, i);
				} else if (resource === 'channel') {
					row = await executeChannel.call(this, client, operation, i);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`);
				}

				if (row !== undefined) {
					returnData.push({ json: row, pairedItem: { item: i } });
				}
			} catch (err) {
				const wrapped = wrapLoomcycleError(err, this.getNode());
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: wrapped.message },
						error: wrapped as NodeOperationError,
						pairedItem: { item: i },
					});
					continue;
				}
				throw wrapped;
			}
		}

		return [returnData];
	}
}

// ---- Resource dispatchers ----

async function executeRun(
	this: IExecuteFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'spawn') {
		const agent = this.getNodeParameter('agent', i) as string;
		const prompt = this.getNodeParameter('prompt', i) as string;
		const userIdParam = this.getNodeParameter('userId', i, '') as string;
		const userTierParam = this.getNodeParameter('userTier', i, '') as string;
		const treatPromptAsUntrusted = this.getNodeParameter('treatPromptAsUntrusted', i, false) as boolean;
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		const userTier = userTierParam || (await getCredentialDefault(this, 'userTier'));

		const runOpts: RunOptions = {
			agent,
			segments: buildSegments(prompt, treatPromptAsUntrusted),
		};
		if (userId) runOpts.userId = userId;
		if (userTier) runOpts.userTier = userTier;
		if (additionalFields.sessionId) runOpts.sessionId = additionalFields.sessionId as string;
		if (additionalFields.agentId) runOpts.agentId = additionalFields.agentId as string;
		if (additionalFields.userBearer) runOpts.userBearer = additionalFields.userBearer as string;

		const allowedTools = parseCsv(additionalFields.allowedTools as string);
		if (allowedTools !== undefined) runOpts.allowedTools = allowedTools;
		const allowedHosts = parseCsv(additionalFields.allowedHosts as string);
		if (allowedHosts !== undefined) runOpts.allowedHosts = allowedHosts;
		const webSearchFilter = additionalFields.webSearchFilter;
		if (webSearchFilter === 'drop' || webSearchFilter === 'keep') {
			runOpts.webSearchFilter = webSearchFilter;
		}

		const result = await drainRunStream(client.runStreaming(runOpts));
		return result as unknown as IDataObject;
	}

	if (operation === 'getStatus') {
		const agentId = this.getNodeParameter('agentId', i) as string;
		const agent = await client.getAgent(agentId);
		return agent as unknown as IDataObject;
	}

	if (operation === 'wait') {
		const agentId = this.getNodeParameter('agentId', i) as string;
		const pollIntervalMs = this.getNodeParameter('pollIntervalMs', i, 1000) as number;
		const timeoutSec = this.getNodeParameter('timeoutSec', i, 300) as number;
		const deadline = Date.now() + timeoutSec * 1000;

		while (true) {
			const agent = await client.getAgent(agentId);
			if (agent.status !== 'running') {
				return agent as unknown as IDataObject;
			}
			if (Date.now() >= deadline) {
				throw new NodeOperationError(
					this.getNode(),
					`Timed out after ${timeoutSec}s waiting for agent ${agentId} to finish (current status: ${agent.status}).`,
				);
			}
			await sleep(pollIntervalMs);
		}
	}

	if (operation === 'cancel') {
		const agentId = this.getNodeParameter('agentId', i) as string;
		const reason = this.getNodeParameter('reason', i, '') as string;
		const result = await client.cancelAgent(agentId, reason ? { reason } : undefined);
		return result as unknown as IDataObject;
	}

	if (operation === 'listAgents') {
		const userIdParam = this.getNodeParameter('userId', i, '') as string;
		const statusFilter = this.getNodeParameter('statusFilter', i, '') as string;
		const userId = userIdParam || (await getCredentialDefault(this, 'userId'));
		if (!userId) {
			throw new NodeOperationError(
				this.getNode(),
				'User ID is required for List Agents — set per-node or as a Default User ID on the credential.',
			);
		}
		const opts = statusFilter ? { status: statusFilter as AgentStatus } : undefined;
		const agents = await client.listUserAgents(userId, opts);
		return { agents } as unknown as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unknown run operation: ${operation}`);
}

async function executeMemory(
	this: IExecuteFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'listScopes') {
		const resp = await client.listMemoryScopes();
		return resp as unknown as IDataObject;
	}

	if (operation === 'listScopeIDs') {
		const scope = this.getNodeParameter('scope', i) as string;
		const resp = await client.listMemoryScopeIDs(scope);
		return resp as unknown as IDataObject;
	}

	if (operation === 'listEntries') {
		const scope = this.getNodeParameter('scope', i) as string;
		const scopeID = this.getNodeParameter('scopeID', i) as string;
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const optsAny: { prefix?: string; limit?: number; signal?: AbortSignal } = {};
		if (additionalFields.prefix) optsAny.prefix = additionalFields.prefix as string;
		if (typeof additionalFields.limit === 'number') optsAny.limit = additionalFields.limit;
		const resp = await client.listMemoryEntries(scope, scopeID, optsAny);
		return resp as unknown as IDataObject;
	}

	if (operation === 'getEntry') {
		const scope = this.getNodeParameter('scope', i) as string;
		const scopeID = this.getNodeParameter('scopeID', i) as string;
		const key = this.getNodeParameter('key', i) as string;
		const resp = await client.getMemoryEntry(scope, scopeID, key);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unknown memory operation: ${operation}`);
}

async function executeChannel(
	this: IExecuteFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'listChannels') {
		const resp = await client.listChannels();
		return resp as unknown as IDataObject;
	}

	const channel = this.getNodeParameter('channel', i) as string;
	const scope = this.getNodeParameter('scope', i, 'global') as ChannelScope;
	const userIdParam = this.getNodeParameter('userId', i, '') as string;
	const userId = scope === 'user' ? userIdParam || (await getCredentialDefault(this, 'userId')) : undefined;
	if (scope === 'user' && !userId) {
		throw new NodeOperationError(
			this.getNode(),
			'User ID is required when Scope = User — set per-node or as a Default User ID on the credential.',
		);
	}

	if (operation === 'publish') {
		const rawPayload = this.getNodeParameter('payload', i, '{}') as unknown;
		const payload = parseJsonField(rawPayload);
		const deliverAt = this.getNodeParameter('deliverAt', i, '') as string;
		const resp = await client.publishChannel(channel, {
			scope,
			userId,
			payload,
			deliverAt: deliverAt || undefined,
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'subscribe') {
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const resp = await client.subscribeChannel(channel, {
			scope,
			userId,
			fromCursor: (additionalFields.fromCursor as string) || undefined,
			maxMessages: typeof additionalFields.maxMessages === 'number' ? additionalFields.maxMessages : undefined,
			waitMs: typeof additionalFields.waitMs === 'number' ? additionalFields.waitMs : undefined,
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'peek') {
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const resp = await client.peekChannel(channel, {
			scope,
			userId,
			fromCursor: (additionalFields.fromCursor as string) || undefined,
			maxMessages: typeof additionalFields.maxMessages === 'number' ? additionalFields.maxMessages : undefined,
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'ack') {
		const cursor = this.getNodeParameter('cursor', i) as string;
		const resp = await client.ackChannel(channel, { scope, userId, cursor });
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unknown channel operation: ${operation}`);
}

// ---- Local helpers (kept inline; not shared) ----

function parseCsv(raw: unknown): string[] | undefined {
	if (typeof raw !== 'string' || raw.trim() === '') return undefined;
	const items = raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return items.length > 0 ? items : undefined;
}

function parseJsonField(raw: unknown): unknown {
	if (typeof raw !== 'string') return raw;
	const trimmed = raw.trim();
	if (trimmed === '') return {};
	try {
		return JSON.parse(trimmed);
	} catch {
		return raw;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
