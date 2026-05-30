import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type {
	AgentStatus,
	ChannelScope,
	CreateChannelOptions,
	HookFailMode,
	HookPhase,
	RegisterHookOptions,
	RunOptions,
	SetMemoryEntryOptions,
	SubstrateToolInput,
	UpdateChannelOptions,
} from '@loomcycle/client';

import { getClient, getCredentialDefault } from './helpers/client';
import { wrapLoomcycleError } from './helpers/errors';
import { buildSegments } from './helpers/segments';
import { drainRunStream } from './helpers/streaming';

/**
 * Shared execute engine for the loomcycle action nodes. Each standalone
 * node (LoomCycleRun, LoomCycleMemory, …) is a thin INodeType whose
 * `execute()` delegates here with its fixed `resource`. The per-resource
 * dispatch + typed-error mapping + SSE drain + credential-default
 * fall-through all live in JS (not declarative routing) because the
 * load-bearing paths go through `@loomcycle/client`.
 *
 * The eight node classes used to be one umbrella node discriminated by a
 * `resource` parameter; they were split into separate node types (v2.0.0)
 * so each entity carries its own canvas icon — n8n renders one icon per
 * node type. This engine preserves the original dispatch verbatim; only
 * the entry point changed from `getNodeParameter('resource')` to the
 * caller-supplied `resource` argument.
 */
export async function executeLoomCycle(
	ctx: IExecuteFunctions,
	resource: string,
): Promise<INodeExecutionData[][]> {
	const items = ctx.getInputData();
	const returnData: INodeExecutionData[] = [];
	const client = await getClient(ctx);

	for (let i = 0; i < items.length; i++) {
		const operation = ctx.getNodeParameter('operation', i) as string;

		try {
			let row: IDataObject | undefined;

			if (resource === 'run') {
				row = await executeRun(ctx, client, operation, i);
			} else if (resource === 'memory') {
				row = await executeMemory(ctx, client, operation, i);
			} else if (resource === 'channel') {
				row = await executeChannel(ctx, client, operation, i);
			} else if (resource === 'agentDef') {
				row = await executeAgentDef(ctx, client, operation, i);
			} else if (resource === 'skillDef') {
				row = await executeSkillDef(ctx, client, operation, i);
			} else if (resource === 'mcpServerDef') {
				row = await executeMcpServerDef(ctx, client, operation, i);
			} else if (resource === 'scheduleDef') {
				row = await executeScheduleDef(ctx, client, operation, i);
			} else if (resource === 'webhookDef') {
				row = await executeWebhookDef(ctx, client, operation, i);
			} else if (resource === 'a2aAgentDef') {
				row = await executeA2aAgentDef(ctx, client, operation, i);
			} else if (resource === 'a2aServerCardDef') {
				row = await executeA2aServerCardDef(ctx, client, operation, i);
			} else if (resource === 'hook') {
				row = await executeHook(ctx, client, operation, i);
			} else {
				throw new NodeOperationError(ctx.getNode(), `Unknown resource: ${resource}`);
			}

			if (row !== undefined) {
				returnData.push({ json: row, pairedItem: { item: i } });
			}
		} catch (err) {
			const wrapped = wrapLoomcycleError(err, ctx.getNode());
			if (ctx.continueOnFail()) {
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

type LoomClient = Awaited<ReturnType<typeof getClient>>;

// ---- Resource dispatchers ----

async function executeRun(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'spawn') {
		const agent = ctx.getNodeParameter('agent', i) as string;
		const prompt = ctx.getNodeParameter('prompt', i) as string;
		const userIdParam = ctx.getNodeParameter('userId', i, '') as string;
		const userTierParam = ctx.getNodeParameter('userTier', i, '') as string;
		const treatPromptAsUntrusted = ctx.getNodeParameter('treatPromptAsUntrusted', i, false) as boolean;
		const additionalFields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const userId = userIdParam || (await getCredentialDefault(ctx, 'userId'));
		const userTier = userTierParam || (await getCredentialDefault(ctx, 'userTier'));

		const runOpts: RunOptions = {
			agent,
			segments: buildSegments(prompt, treatPromptAsUntrusted),
		};
		if (userId) runOpts.userId = userId;
		if (userTier) runOpts.userTier = userTier;
		if (additionalFields.sessionId) runOpts.sessionId = additionalFields.sessionId as string;
		if (additionalFields.agentId) runOpts.agentId = additionalFields.agentId as string;
		if (additionalFields.userBearer) runOpts.userBearer = additionalFields.userBearer as string;

		// RFC F (v0.12.x): per-tool named credentials map. Template-string
		// values only — never persisted, never logged by the runtime.
		const userCredentials = collectNameValuePairs(additionalFields.userCredentials, 'credential');
		if (Object.keys(userCredentials).length > 0) runOpts.userCredentials = userCredentials;

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
		const agentId = ctx.getNodeParameter('agentId', i) as string;
		const agent = await client.getAgent(agentId);
		return agent as unknown as IDataObject;
	}

	if (operation === 'wait') {
		const agentId = ctx.getNodeParameter('agentId', i) as string;
		const pollIntervalMs = ctx.getNodeParameter('pollIntervalMs', i, 1000) as number;
		const timeoutSec = ctx.getNodeParameter('timeoutSec', i, 300) as number;
		const deadline = Date.now() + timeoutSec * 1000;

		while (true) {
			const agent = await client.getAgent(agentId);
			if (agent.status !== 'running') {
				return agent as unknown as IDataObject;
			}
			if (Date.now() >= deadline) {
				throw new NodeOperationError(
					ctx.getNode(),
					`Timed out after ${timeoutSec}s waiting for agent ${agentId} to finish (current status: ${agent.status}).`,
				);
			}
			await sleep(pollIntervalMs);
		}
	}

	if (operation === 'cancel') {
		const agentId = ctx.getNodeParameter('agentId', i) as string;
		const reason = ctx.getNodeParameter('reason', i, '') as string;
		const result = await client.cancelAgent(agentId, reason ? { reason } : undefined);
		return result as unknown as IDataObject;
	}

	if (operation === 'listAgents') {
		const userIdParam = ctx.getNodeParameter('userId', i, '') as string;
		const statusFilter = ctx.getNodeParameter('statusFilter', i, '') as string;
		const userId = userIdParam || (await getCredentialDefault(ctx, 'userId'));
		if (!userId) {
			throw new NodeOperationError(
				ctx.getNode(),
				'User ID is required for List Agents — set per-node or as a Default User ID on the credential.',
			);
		}
		const opts = statusFilter ? { status: statusFilter as AgentStatus } : undefined;
		const agents = await client.listUserAgents(userId, opts);
		return { agents } as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown run operation: ${operation}`);
}

async function executeMemory(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'listScopes') {
		const resp = await client.listMemoryScopes();
		return resp as unknown as IDataObject;
	}

	if (operation === 'listScopeIDs') {
		const scope = ctx.getNodeParameter('scope', i) as string;
		const resp = await client.listMemoryScopeIDs(scope);
		return resp as unknown as IDataObject;
	}

	if (operation === 'listEntries') {
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const additionalFields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const optsAny: { prefix?: string; limit?: number; signal?: AbortSignal } = {};
		if (additionalFields.prefix) optsAny.prefix = additionalFields.prefix as string;
		if (typeof additionalFields.limit === 'number') optsAny.limit = additionalFields.limit;
		const resp = await client.listMemoryEntries(scope, scopeID, optsAny);
		return resp as unknown as IDataObject;
	}

	if (operation === 'getEntry') {
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const key = ctx.getNodeParameter('key', i) as string;
		const resp = await client.getMemoryEntry(scope, scopeID, key);
		return resp as unknown as IDataObject;
	}

	if (operation === 'setEntry') {
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const key = ctx.getNodeParameter('key', i) as string;
		const rawValue = ctx.getNodeParameter('value', i, '{}') as unknown;
		// Pre-validate empty/blank — setEntry is a destructive upsert,
		// and parseJsonField's strict mode coerces an empty trimmed
		// string to `{}` (its general default for empty input). For a
		// memory write that's almost always operator error (likely an
		// unset expression), surface as a clear NodeOperationError
		// instead of silently overwriting the stored value with an
		// empty object.
		if (typeof rawValue === 'string' && rawValue.trim() === '') {
			throw new NodeOperationError(
				ctx.getNode(),
				'Value is required for Set Entry — enter a valid JSON value (object, array, primitive, or null). An empty value would silently overwrite the stored entry with `{}`.',
			);
		}
		// Strict JSON: memory writes that aren't valid JSON values land
		// server-side as raw strings — surprising on read-back, so we
		// require valid JSON syntactically (anything from a primitive
		// to an object is fine; the substrate stores opaque JSON).
		const value = parseJsonField(rawValue, { strict: true, node: ctx.getNode() });
		const setOptions = ctx.getNodeParameter('setOptions', i, {}) as IDataObject;
		const opts: SetMemoryEntryOptions = { value };
		if (setOptions.embed === true) opts.embed = true;
		if (typeof setOptions.ttlSeconds === 'number' && setOptions.ttlSeconds > 0) {
			opts.ttl_seconds = setOptions.ttlSeconds;
		}
		const resp = await client.setMemoryEntry(scope, scopeID, key, opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'deleteEntry') {
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const key = ctx.getNodeParameter('key', i) as string;
		await client.deleteMemoryEntry(scope, scopeID, key);
		// Adapter returns void on 204; surface a consistent ok envelope for n8n
		return { ok: true, scope, scope_id: scopeID, key } as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown memory operation: ${operation}`);
}

async function executeChannel(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'listChannels') {
		const resp = await client.listChannels();
		return resp as unknown as IDataObject;
	}

	// Channel admin CRUD (v0.11.5) — these operate at the substrate
	// scope (runtime channel registry), distinct from the per-message
	// scope/userId triple used by publish/subscribe/peek/ack.
	if (operation === 'createChannel') {
		const name = ctx.getNodeParameter('channelName', i) as string;
		const settings = ctx.getNodeParameter('channelSettings', i, {}) as IDataObject;
		const opts: CreateChannelOptions = { name };
		if (settings.description) opts.description = settings.description as string;
		if (settings.scope) opts.scope = settings.scope as string;
		if (settings.semantic) opts.semantic = settings.semantic as string;
		if (typeof settings.defaultTtl === 'number' && settings.defaultTtl > 0) {
			opts.default_ttl = settings.defaultTtl;
		}
		if (typeof settings.maxMessages === 'number' && settings.maxMessages > 0) {
			opts.max_messages = settings.maxMessages;
		}
		if (settings.publisher) opts.publisher = settings.publisher as string;
		if (settings.period) opts.period = settings.period as string;
		const resp = await client.createChannel(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'updateChannel') {
		const name = ctx.getNodeParameter('channelName', i) as string;
		const settings = ctx.getNodeParameter('updateSettings', i, {}) as IDataObject;
		const opts: UpdateChannelOptions = {};
		if (settings.description !== undefined) opts.description = settings.description as string;
		if (settings.semantic) opts.semantic = settings.semantic as string;
		// IMPORTANT: guard with `> 0` to avoid forwarding the n8n
		// collection's default value (0) as a "zero out TTL / cap"
		// update. A partial-update collection means "fields the operator
		// touched"; an untouched defaultTtl/maxMessages reads as 0 here,
		// and forwarding that would silently destroy any TTL or cap
		// previously configured on the channel. Match the createChannel
		// guard.
		if (typeof settings.defaultTtl === 'number' && settings.defaultTtl > 0) {
			opts.default_ttl = settings.defaultTtl;
		}
		if (typeof settings.maxMessages === 'number' && settings.maxMessages > 0) {
			opts.max_messages = settings.maxMessages;
		}
		const resp = await client.updateChannel(name, opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'deleteChannel') {
		const name = ctx.getNodeParameter('channelName', i) as string;
		await client.deleteChannel(name);
		// Adapter returns void on success; surface a consistent ok envelope
		return { ok: true, name } as IDataObject;
	}

	const channel = ctx.getNodeParameter('channel', i) as string;
	const scope = ctx.getNodeParameter('scope', i, 'global') as ChannelScope;
	const userIdParam = ctx.getNodeParameter('userId', i, '') as string;
	const userId = scope === 'user' ? userIdParam || (await getCredentialDefault(ctx, 'userId')) : undefined;
	if (scope === 'user' && !userId) {
		throw new NodeOperationError(
			ctx.getNode(),
			'User ID is required when Scope = User — set per-node or as a Default User ID on the credential.',
		);
	}

	if (operation === 'publish') {
		const rawPayload = ctx.getNodeParameter('payload', i, '{}') as unknown;
		// Strict JSON: a Channel publish payload that isn't a valid JSON
		// value (object/array/string/number) would land server-side as a
		// raw string — confusing for downstream consumers expecting
		// structured data. Throw early so the operator sees the typo.
		const payload = parseJsonField(rawPayload, { strict: true, node: ctx.getNode() });
		const deliverAt = ctx.getNodeParameter('deliverAt', i, '') as string;
		const resp = await client.publishChannel(channel, {
			scope,
			userId,
			payload,
			deliverAt: deliverAt || undefined,
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'subscribe') {
		const additionalFields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
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
		const additionalFields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const resp = await client.peekChannel(channel, {
			scope,
			userId,
			fromCursor: (additionalFields.fromCursor as string) || undefined,
			maxMessages: typeof additionalFields.maxMessages === 'number' ? additionalFields.maxMessages : undefined,
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'ack') {
		const cursor = ctx.getNodeParameter('cursor', i) as string;
		const resp = await client.ackChannel(channel, { scope, userId, cursor });
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown channel operation: ${operation}`);
}

// ---- Substrate-admin dispatchers (AgentDef / SkillDef / MCPServerDef) ----

async function executeAgentDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.agentDef(input);
	return { result: resp } as IDataObject;
}

async function executeSkillDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.skillDef(input);
	return { result: resp } as IDataObject;
}

async function executeMcpServerDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);

	// MCPServerDef-specific: structured Register UI assembles transport
	// + url + headers as direct overlay fields (Fork uses the JSON
	// overlay textarea instead).
	if (operation === 'create') {
		const transport = ctx.getNodeParameter('transport', i) as string;
		if (transport !== 'http' && transport !== 'streamable-http') {
			throw new NodeOperationError(
				ctx.getNode(),
				`Transport must be HTTP or Streamable-HTTP. Stdio MCP servers must be declared in loomcycle.yaml (not via dynamic registration).`,
			);
		}
		const url = ctx.getNodeParameter('url', i) as string;
		const headers = collectNameValuePairs(ctx.getNodeParameter('headers', i, {}), 'header');
		input.transport = transport;
		input.url = url;
		if (Object.keys(headers).length > 0) input.headers = headers;
	}

	const resp = await client.mcpServerDef(input);
	return { result: resp } as IDataObject;
}

/**
 * Substrate-native scheduled-run admin (RFC E, v0.12.x). Mirrors the
 * AgentDef/SkillDef op-discriminated shape, but the schedule body
 * (agent / prompt / cron / user_id / user_tier / credentials) is assembled
 * into the `overlay` object rather than the generic verify/promote knobs.
 * 5 ops only — no `promote` op, no `verify` op (RFC E v1.x schema).
 */
async function executeScheduleDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input: SubstrateToolInput = { op: operation as SubstrateToolInput['op'] };

	const name = ctx.getNodeParameter('name', i, '') as string;
	if (name) input.name = name;
	const defId = ctx.getNodeParameter('defId', i, '') as string;
	if (defId) input.def_id = defId;
	const parentDefId = ctx.getNodeParameter('parentDefId', i, '') as string;
	if (parentDefId) input.parent_def_id = parentDefId;
	const description = ctx.getNodeParameter('defDescription', i, '') as string;
	if (description) input.description = description;

	if (operation === 'create' || operation === 'fork') {
		input.promote = ctx.getNodeParameter('promote', i, true) as boolean;

		// Build the overlay (the schedule's content-bearing fields). For
		// Fork, start from the operator's JSON diff and layer credentials
		// on top; for Create, assemble from the structured fields. Strict
		// parse on Fork so a malformed overlay surfaces as a clear error
		// rather than a string masquerading as an object.
		const overlay: Record<string, unknown> = {};
		if (operation === 'fork') {
			const parsed = parseJsonField(ctx.getNodeParameter('overlay', i, '{}'), {
				strict: true,
				node: ctx.getNode(),
			});
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				Object.assign(overlay, parsed as Record<string, unknown>);
			}
		}

		if (operation === 'create') {
			const schedule = ctx.getNodeParameter('schedule', i) as string;
			const agent = ctx.getNodeParameter('agent', i) as string;
			const prompt = ctx.getNodeParameter('prompt', i) as string;
			const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const treatPromptAsUntrusted = extra.treatPromptAsUntrusted === true;

			overlay.schedule = schedule;
			overlay.agent = agent;
			overlay.prompt = buildSegments(prompt, treatPromptAsUntrusted);
			if (extra.userId) overlay.user_id = extra.userId as string;
			if (extra.userTier) overlay.user_tier = extra.userTier as string;
			if (extra.timezone) overlay.timezone = extra.timezone as string;
			if (typeof extra.enabled === 'boolean') overlay.enabled = extra.enabled;
			if (typeof extra.catchUpMax === 'number' && extra.catchUpMax > 0) {
				overlay.catch_up_max = extra.catchUpMax;
			}
			const requiredCredentials = parseCsv(extra.requiredCredentials as string);
			if (requiredCredentials !== undefined) overlay.required_credentials = requiredCredentials;
		}

		// Per-fire named credentials (template strings only) — shared by
		// Create and Fork. A template fork declaring required_credentials
		// loud-fails server-side if these keys are missing.
		const userCredentials = collectNameValuePairs(
			ctx.getNodeParameter('userCredentials', i, {}),
			'credential',
		);
		if (Object.keys(userCredentials).length > 0) overlay.user_credentials = userCredentials;

		if (Object.keys(overlay).length > 0) input.overlay = overlay;
	}

	const resp = await client.scheduleDef(input);
	return { result: resp } as IDataObject;
}

/**
 * Inbound webhook admin (RFC H, v0.14.x). Manages WebhookDef rows — a
 * loomcycle-hosted HTTP endpoint that, when POSTed to by an external system,
 * spawns an agent run or publishes to a channel. INBOUND direction, distinct
 * from the outbound pre/post-tool callbacks managed by the Hook resource.
 *
 * Create assembles the overlay from the structured essentials (agent /
 * channel / enabled) layered on top of an optional advanced-overlay JSON
 * (auth, rate_limit, payload_mapping, sync_response). 5 ops, no verify.
 *
 * Auth secrets are env-var REFERENCES (signing_secret_env / bearer_token_env)
 * resolved from loomcycle's own env — plaintext credentials never cross this
 * wire path (CLAUDE.md §security).
 */
async function executeWebhookDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input: SubstrateToolInput = { op: operation as SubstrateToolInput['op'] };

	const name = ctx.getNodeParameter('name', i, '') as string;
	if (name) input.name = name;
	const defId = ctx.getNodeParameter('defId', i, '') as string;
	if (defId) input.def_id = defId;
	const parentDefId = ctx.getNodeParameter('parentDefId', i, '') as string;
	if (parentDefId) input.parent_def_id = parentDefId;
	const description = ctx.getNodeParameter('defDescription', i, '') as string;
	if (description) input.description = description;

	if (operation === 'create' || operation === 'fork') {
		input.promote = ctx.getNodeParameter('promote', i, true) as boolean;

		// Base from the advanced/overlay JSON (the full def diff for fork;
		// auth/rate_limit/payload_mapping/sync_response for create), then
		// layer the structured create fields on top so they win.
		const overlay: Record<string, unknown> = {};
		const parsed = parseJsonField(ctx.getNodeParameter('overlay', i, '{}'), {
			strict: true,
			node: ctx.getNode(),
		});
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			Object.assign(overlay, parsed as Record<string, unknown>);
		}

		if (operation === 'create') {
			const agent = ctx.getNodeParameter('agent', i, '') as string;
			const channel = ctx.getNodeParameter('channel', i, '') as string;
			const enabled = ctx.getNodeParameter('enabled', i, true) as boolean;
			if (agent) overlay.agent = agent;
			if (channel) overlay.channel = channel;
			overlay.enabled = enabled;
		}

		if (Object.keys(overlay).length > 0) input.overlay = overlay;
	}

	const resp = await client.webhookDef(input);
	return { result: resp } as IDataObject;
}

/**
 * A2A agent admin (RFC G, v0.14.x) — CLIENT side: defines an EXTERNAL A2A
 * agent (agent_card_url / endpoint / auth / expected_skills) that loomcycle
 * agents can call as a tool. Generic op-discriminated def-admin (the def body
 * rides in the overlay JSON), so it reuses buildSubstrateInput like AgentDef.
 */
async function executeA2aAgentDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.a2aAgentDef(input);
	return { result: resp } as IDataObject;
}

/**
 * A2A server-card admin (RFC G, v0.14.x) — SERVER side: the agent card
 * loomcycle publishes (provider / capabilities) to expose its own agents to
 * external A2A clients. Generic def-admin; body in the overlay JSON.
 */
async function executeA2aServerCardDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.a2aServerCardDef(input);
	return { result: resp } as IDataObject;
}

/**
 * Pre/post-tool webhook registration. `registerHook` makes loomcycle POST
 * hook payloads to a consumer-run callback URL (typically an n8n Webhook
 * trigger node). `owner` defaults to the node id so re-runs are idempotent
 * on (owner, name) without the operator inventing an owner string.
 */
async function executeHook(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'register') {
		const ownerParam = ctx.getNodeParameter('owner', i, '') as string;
		const opts: RegisterHookOptions = {
			owner: ownerParam || `n8n:${ctx.getNode().id}`,
			name: ctx.getNodeParameter('name', i) as string,
			phase: ctx.getNodeParameter('phase', i) as HookPhase,
			callbackUrl: ctx.getNodeParameter('callbackUrl', i) as string,
		};
		const agents = parseCsv(ctx.getNodeParameter('agents', i, '') as string);
		if (agents !== undefined) opts.agents = agents;
		const tools = parseCsv(ctx.getNodeParameter('tools', i, '') as string);
		if (tools !== undefined) opts.tools = tools;
		const failMode = ctx.getNodeParameter('failMode', i, 'open') as HookFailMode;
		if (failMode) opts.failMode = failMode;
		const timeoutMs = ctx.getNodeParameter('timeoutMs', i, 0) as number;
		if (typeof timeoutMs === 'number' && timeoutMs > 0) opts.timeoutMs = timeoutMs;

		const resp = await client.registerHook(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'list') {
		const hooks = await client.listHooks();
		return { hooks } as unknown as IDataObject;
	}

	if (operation === 'delete') {
		const id = ctx.getNodeParameter('hookId', i) as string;
		await client.deleteHook(id);
		// Adapter returns void on success; surface a consistent ok envelope
		return { ok: true, id } as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown hook operation: ${operation}`);
}

/**
 * Build the SubstrateToolInput body shared by AgentDef / SkillDef /
 * MCPServerDef. The closed-set op union covers create/fork/get/list/
 * promote/retire; verify and rediscover ride the [extra: string]: unknown
 * index signature on SubstrateToolInput.
 */
function buildSubstrateInput(ctx: IExecuteFunctions, operation: string, i: number): SubstrateToolInput {
	const input: SubstrateToolInput = { op: operation as SubstrateToolInput['op'] };

	const name = ctx.getNodeParameter('name', i, '') as string;
	if (name) input.name = name;

	const defId = ctx.getNodeParameter('defId', i, '') as string;
	if (defId) input.def_id = defId;

	const parentDefId = ctx.getNodeParameter('parentDefId', i, '') as string;
	if (parentDefId) input.parent_def_id = parentDefId;

	const description = ctx.getNodeParameter('defDescription', i, '') as string;
	if (description) input.description = description;

	if (operation === 'create' || operation === 'fork') {
		const promote = ctx.getNodeParameter('promote', i, false) as boolean;
		input.promote = promote;
		const overlay = parseJsonField(ctx.getNodeParameter('overlay', i, '{}'));
		if (overlay && typeof overlay === 'object' && Object.keys(overlay as object).length > 0) {
			input.overlay = overlay as Record<string, unknown>;
		}
	}

	if (operation === 'verify') {
		const contentSha256 = ctx.getNodeParameter('contentSha256', i, '') as string;
		if (contentSha256) input.content_sha256 = contentSha256;
	}

	return input;
}

/**
 * Collect an n8n fixedCollection of `{ name, value }` rows into a map.
 * The input shape is `{ <key>: [{ name, value }, ...] }` — `key` is the
 * collection's option name (`header` for MCP headers, `credential` for
 * named-credential maps). Empty when the operator added no rows.
 */
function collectNameValuePairs(raw: unknown, key: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!raw || typeof raw !== 'object') return out;
	const collection = (raw as Record<string, unknown>)[key];
	if (!Array.isArray(collection)) return out;
	for (const entry of collection) {
		if (!entry || typeof entry !== 'object') continue;
		const name = (entry as { name?: unknown }).name;
		const value = (entry as { value?: unknown }).value;
		if (typeof name === 'string' && name && typeof value === 'string') {
			out[name] = value;
		}
	}
	return out;
}

// ---- Local helpers ----

function parseCsv(raw: unknown): string[] | undefined {
	if (typeof raw !== 'string' || raw.trim() === '') return undefined;
	const items = raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return items.length > 0 ? items : undefined;
}

function parseJsonField(
	raw: unknown,
	opts: { strict?: boolean; node?: import('n8n-workflow').INode } = {},
): unknown {
	if (typeof raw !== 'string') return raw;
	const trimmed = raw.trim();
	if (trimmed === '') return {};
	try {
		return JSON.parse(trimmed);
	} catch (err) {
		if (opts.strict && opts.node) {
			const snippet = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
			throw new NodeOperationError(opts.node, `Invalid JSON: ${snippet} — ${(err as Error).message}`);
		}
		return raw;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
