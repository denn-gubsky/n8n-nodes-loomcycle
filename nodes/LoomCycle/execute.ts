import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type {
	AgentStatus,
	AwaitChannelsOptions,
	BroadcastChannelsOptions,
	ChannelAwaitMode,
	ChannelScope,
	CreateChannelOptions,
	HookFailMode,
	HookPhase,
	HistoryToolInput,
	InterruptStatus,
	CreateSnapshotOptions,
	DocumentToolInput,
	LLMChatMessage,
	LLMChatOptions,
	LLMEmbeddingsOptions,
	MemorySearchInput,
	MemorySource,
	PathToolInput,
	RegisterHookOptions,
	RunBatchOptions,
	RunOptions,
	SetMemoryEntryOptions,
	SubstrateToolInput,
	UpdateChannelOptions,
	UsageDimension,
	VolumeMode,
} from '@loomcycle/client';

import { getClient, getCredentialDefault } from './helpers/client';
import { wrapLoomcycleError } from './helpers/errors';
import { buildSegments, readImageParts } from './helpers/segments';
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
			} else if (resource === 'interruption') {
				row = await executeInterruption(ctx, client, operation, i);
			} else if (resource === 'llm') {
				row = await executeLlm(ctx, client, operation, i);
			} else if (resource === 'memoryBackendDef') {
				row = await executeMemoryBackendDef(ctx, client, operation, i);
			} else if (resource === 'operatorTokenDef') {
				row = await executeOperatorTokenDef(ctx, client, operation, i);
			} else if (resource === 'snapshot') {
				row = await executeSnapshot(ctx, client, operation, i);
			} else if (resource === 'volume') {
				row = await executeVolume(ctx, client, operation, i);
			} else if (resource === 'path') {
				row = await executePath(ctx, client, operation, i);
			} else if (resource === 'document') {
				row = await executeDocument(ctx, client, operation, i);
			} else if (resource === 'fact') {
				row = await executeFact(ctx, client, operation, i);
			} else if (resource === 'documentSourceDef') {
				row = await executeDocumentSourceDef(ctx, client, operation, i);
			} else if (resource === 'team') {
				row = await executeTeam(ctx, client, operation, i);
			} else if (resource === 'directory') {
				row = await executeDirectory(ctx, client, operation, i);
			} else if (resource === 'erasure') {
				row = await executeErasure(ctx, client, operation, i);
			} else if (resource === 'user') {
				row = await executeUser(ctx, client, operation, i);
			} else if (resource === 'usage') {
				row = await executeUsage(ctx, client, operation, i);
			} else if (resource === 'history') {
				row = await executeHistory(ctx, client, operation, i);
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

		// RFC AT (v1.7): optional vision input read off the item's binary
		// properties and base64'd into `image` content blocks. No images
		// configured → buildSegments emits exactly what it always did.
		const images = await readImageParts(ctx, i, additionalFields.imageBinaryProperties);

		const runOpts: RunOptions = {
			agent,
			segments: buildSegments(prompt, treatPromptAsUntrusted, images),
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

		// v0.21: non-secret structured metadata delivered to the agent
		// (input.metadata for code-js; trusted prompt block for LLMs).
		const metadata = parseObjectField(additionalFields.metadata, ctx.getNode());
		if (metadata) runOpts.metadata = metadata;

		// v0.28 / v0.32: per-run sampling + compaction overrides (operator-
		// authored JSON; the adapter + substrate validate the shapes). Each
		// inherits the agent's value when absent.
		const sampling = parseObjectField(additionalFields.sampling, ctx.getNode());
		if (sampling) runOpts.sampling = sampling as RunOptions['sampling'];
		const compaction = parseObjectField(additionalFields.compaction, ctx.getNode());
		if (compaction) runOpts.compaction = compaction as RunOptions['compaction'];

		// v0.21: per-run wall-clock ceiling (precedence run > agent > global).
		if (typeof additionalFields.runTimeoutSeconds === 'number' && additionalFields.runTimeoutSeconds > 0) {
			runOpts.runTimeoutSeconds = additionalFields.runTimeoutSeconds;
		}

		// loomcycle v1.13.0 renamed the run body's `allowed_tools` to `tools`
		// (RunOptions.allowedTools → RunOptions.tools). The n8n PARAMETER keeps
		// its original name so saved workflows keep resolving — only the wire
		// field moved.
		const allowedTools = parseCsv(additionalFields.allowedTools as string);
		if (allowedTools !== undefined) runOpts.tools = allowedTools;
		const allowedHosts = parseCsv(additionalFields.allowedHosts as string);
		if (allowedHosts !== undefined) runOpts.allowedHosts = allowedHosts;
		const webSearchFilter = additionalFields.webSearchFilter;
		if (webSearchFilter === 'drop' || webSearchFilter === 'keep') {
			runOpts.webSearchFilter = webSearchFilter;
		}

		// RFC AI (v1.1.1): interactive run — park at end_turn for operator
		// steering rather than running to completion. We must NOT drain to a
		// terminal state (the stream stays open awaiting input); drain only
		// until the run parks, then return the run_id so a later Send Input
		// (or the Run Completed trigger) can drive it.
		const interactive = additionalFields.interactive === true;
		if (interactive) runOpts.interactive = true;

		const result = await drainRunStream(client.runStreaming(runOpts), {
			stopOnAwaitingInput: interactive,
		});
		return result as unknown as IDataObject;
	}

	if (operation === 'sendInput') {
		// RFC AI (v1.1.1): push an operator turn into a live interactive run
		// parked at end_turn. Returns { run_id, delivered }; delivered=false
		// means no parked run accepted it (already finished, or steering off).
		const runId = ctx.getNodeParameter('runId', i) as string;
		const text = ctx.getNodeParameter('inputText', i) as string;
		const resp = await client.sendRunInput(runId, text);
		return resp as unknown as IDataObject;
	}

	if (operation === 'getStatus') {
		const agentId = ctx.getNodeParameter('agentId', i) as string;
		const agent = await client.getAgent(agentId);
		return agent as unknown as IDataObject;
	}

	if (operation === 'cancel') {
		const agentId = ctx.getNodeParameter('agentId', i) as string;
		const reason = ctx.getNodeParameter('reason', i, '') as string;
		const result = await client.cancelAgent(agentId, reason ? { reason } : undefined);
		return result as unknown as IDataObject;
	}

	if (operation === 'cancelTurn') {
		// RFC BH (v1.22): stop the CURRENT turn of a live interactive run and
		// park it at awaiting_input — the "Esc" gesture. Distinct from Cancel,
		// which terminates the whole run: session + transcript stay intact and
		// the run is steerable again via Send Input.
		const runId = ctx.getNodeParameter('runId', i) as string;
		const reason = ctx.getNodeParameter('reason', i, '') as string;
		const resp = await client.cancelTurn(runId, reason ? { reason } : undefined);
		return resp as unknown as IDataObject;
	}

	if (operation === 'replaySession') {
		// RFC BJ P4 (v1.25): replay a session's transcript into a NEW session
		// bound to a (possibly different) agent, which then continues from the
		// same context. Returns the fresh session_id to continue with.
		const sourceSessionId = ctx.getNodeParameter('sourceSessionId', i) as string;
		const agent = ctx.getNodeParameter('agent', i) as string;
		const compress = ctx.getNodeParameter('compress', i, false) as boolean;
		const resp = await client.replaySession(sourceSessionId, {
			agent,
			...(compress ? { compress: true } : {}),
		});
		return resp as unknown as IDataObject;
	}

	if (operation === 'listRunnableAgents') {
		// RFC BY (v1.51): the agents THIS caller may run, tiered server-side by
		// access mode (bundled / tenant-shared / own). Gated on runs:read, so a
		// delegated per-user token reaches it where the operator-scoped Library
		// listing would 403.
		const resp = await client.runnableAgents();
		return resp as unknown as IDataObject;
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

	if (operation === 'compact') {
		const runId = ctx.getNodeParameter('runId', i) as string;
		const reason = ctx.getNodeParameter('reason', i, '') as string;
		const resp = await client.compactRun(runId, reason ? { reason } : undefined);
		return resp as unknown as IDataObject;
	}

	if (operation === 'getTranscript') {
		const sessionId = ctx.getNodeParameter('sessionId', i) as string;
		const resp = await client.getTranscript(sessionId);
		return resp as unknown as IDataObject;
	}

	if (operation === 'spawnBatch') {
		// Fan-out: assemble one RunOptions per row, falling each child back to
		// the credential defaults like a single Spawn does. Per-child failures
		// come back in-envelope (never thrown), so we return the raw result.
		const rows = ctx.getNodeParameter('batchSpawns', i, {}) as IDataObject;
		const spawnRows = Array.isArray(rows.spawn) ? (rows.spawn as IDataObject[]) : [];
		if (spawnRows.length === 0) {
			throw new NodeOperationError(ctx.getNode(), 'Spawn Batch requires at least one agent row.');
		}
		const credUserId = await getCredentialDefault(ctx, 'userId');
		const credUserTier = await getCredentialDefault(ctx, 'userTier');
		const spawns: RunOptions[] = spawnRows.map((row) => {
			const ro: RunOptions = {
				agent: row.agent as string,
				segments: buildSegments((row.prompt as string) ?? '', false),
			};
			const uid = (row.userId as string) || credUserId;
			const ut = (row.userTier as string) || credUserTier;
			if (uid) ro.userId = uid;
			if (ut) ro.userTier = ut;
			return ro;
		});
		const batchOpts: RunBatchOptions = { spawns };
		const timeoutMs = ctx.getNodeParameter('batchTimeoutMs', i, 0) as number;
		if (timeoutMs > 0) batchOpts.timeoutMs = timeoutMs;
		const resp = await client.spawnRunBatch(batchOpts);
		return resp as unknown as IDataObject;
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

	if (operation === 'search') {
		// RFC BV/BW (v1.47 / v1.49): off-run unified semantic search spanning
		// k/v entries AND document-chunk bodies in one ranked list. Each hit is
		// tagged `kind` — "fact" | "note" | "document" (it was "memory" |
		// "document" before v1.49.0).
		const query = ctx.getNodeParameter('query', i) as string;
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const searchOptions = ctx.getNodeParameter('searchOptions', i, {}) as IDataObject;

		const input: MemorySearchInput = { query, scope, scopeId: scopeID };
		if (typeof searchOptions.topK === 'number' && searchOptions.topK > 0) {
			input.topK = searchOptions.topK;
		}
		// Omitted `sources` spans every plane. The substrate REFUSES
		// (400 invalid_sources) when "documents" is combined with exactly one
		// of facts/notes, so validate here rather than surfacing a raw 400.
		const sources = parseCsv(searchOptions.sources) as MemorySource[] | undefined;
		if (sources !== undefined && sources.length > 0) {
			const hasDocuments = sources.includes('documents');
			const provenanceCount = ['facts', 'notes'].filter((s) =>
				sources.includes(s as MemorySource),
			).length;
			if (hasDocuments && provenanceCount === 1) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Sources cannot combine "documents" with only one of "facts"/"notes" — the namespace and the provenance split are independent dimensions. Use facts, notes, facts+notes, documents, or all three.',
					{ itemIndex: i },
				);
			}
			input.sources = sources;
		}
		const resp = await client.memorySearch(input);
		return resp as unknown as IDataObject;
	}

	if (operation === 'embedStats') {
		// Per-(provider, model, dimension) row counts for one scope — how you
		// spot a multi-embedder scope BEFORE running a reembed migration.
		const scope = ctx.getNodeParameter('scope', i) as string;
		const resp = await client.memoryEmbedStats(scope);
		return resp as unknown as IDataObject;
	}

	if (operation === 'reembed' || operation === 'backfillEmbeddings' || operation === 'purgeStaleEmbeddings') {
		// The three embedding-maintenance ops share a shape: (scope, scopeId)
		// plus a dry-run gate. `dry_run` defaults TRUE server-side and we keep
		// that default here — Purge Stale in particular DELETES embeddings, so
		// committing has to be an explicit operator act, never the fallback.
		const scope = ctx.getNodeParameter('scope', i) as string;
		const scopeID = ctx.getNodeParameter('scopeID', i) as string;
		const commit = ctx.getNodeParameter('commit', i, false) as boolean;
		const maintenanceOptions = ctx.getNodeParameter('maintenanceOptions', i, {}) as IDataObject;

		const opts: { dryRun?: boolean; limit?: number; prefix?: string } = {};
		if (commit) opts.dryRun = false;
		if (typeof maintenanceOptions.maxRows === 'number' && maintenanceOptions.maxRows > 0) {
			opts.limit = maintenanceOptions.maxRows;
		}

		if (operation === 'reembed') {
			// reembedMemory takes no prefix filter — only backfill / purge do.
			const resp = await client.reembedMemory(scope, scopeID, opts);
			return resp as unknown as IDataObject;
		}
		if (maintenanceOptions.prefix) opts.prefix = maintenanceOptions.prefix as string;
		const resp =
			operation === 'backfillEmbeddings'
				? await client.backfillEmbeddings(scope, scopeID, opts)
				: await client.purgeStaleEmbeddings(scope, scopeID, opts);
		return resp as unknown as IDataObject;
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

	if (operation === 'purgeChannel') {
		// Distinct from deleteChannel: clears buffered messages but keeps the
		// definition + cursors. Allowed on yaml channels too, so it reads the
		// loadChannels dropdown (`channel`), not the runtime-only channelName.
		const name = ctx.getNodeParameter('channel', i) as string;
		const resp = await client.purgeChannel(name);
		return resp as unknown as IDataObject;
	}

	// Await / Broadcast (v0.25) operate over a SET of channels (max 32), with a
	// shared scope + scope_id — distinct from the single-channel message ops.
	if (operation === 'await' || operation === 'broadcast') {
		const channels = parseCsv(ctx.getNodeParameter('channels', i, '') as string) ?? [];
		if (channels.length === 0) {
			throw new NodeOperationError(ctx.getNode(), 'At least one channel is required.');
		}
		const scope = ctx.getNodeParameter('scope', i, 'global') as ChannelScope;
		const userIdParam = ctx.getNodeParameter('userId', i, '') as string;
		const userId = scope === 'user' ? userIdParam || (await getCredentialDefault(ctx, 'userId')) : undefined;
		if (scope === 'user' && !userId) {
			throw new NodeOperationError(
				ctx.getNode(),
				'User ID is required when Scope = User — set per-node or as a Default User ID on the credential.',
			);
		}

		if (operation === 'await') {
			const additionalFields = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const opts: AwaitChannelsOptions = {
				channels,
				scope,
				userId,
				mode: ctx.getNodeParameter('awaitMode', i, 'any') as ChannelAwaitMode,
			};
			if (opts.mode === 'at_least') opts.n = ctx.getNodeParameter('awaitN', i, 1) as number;
			if (additionalFields.fromCursor) opts.fromCursor = additionalFields.fromCursor as string;
			if (typeof additionalFields.maxMessages === 'number') opts.maxMessages = additionalFields.maxMessages;
			if (typeof additionalFields.waitMs === 'number') opts.waitMs = additionalFields.waitMs;
			const resp = await client.awaitChannels(opts);
			return resp as unknown as IDataObject;
		}

		// broadcast
		const rawPayload = ctx.getNodeParameter('payload', i, '{}') as unknown;
		const payload = parseJsonField(rawPayload, { strict: true, node: ctx.getNode() });
		const deliverAt = ctx.getNodeParameter('deliverAt', i, '') as string;
		const opts: BroadcastChannelsOptions = { channels, scope, userId, payload };
		if (deliverAt) opts.deliverAt = deliverAt;
		const resp = await client.broadcastChannels(opts);
		return resp as unknown as IDataObject;
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

	// Fold the Provider dropdown into the overlay. Empty = leave unset
	// (provider stays whatever the Overlay JSON / loomcycle default supplies).
	// A selected provider wins over any `provider` key in the Overlay JSON so
	// the dropdown is authoritative. When code-js is selected, the inline
	// JavaScript editor folds into overlay.code_body — loomcycle ≥ v0.20
	// ingests the source over the wire (no host filesystem bind); an empty
	// body falls back to the host agent_code/<name>/index.js path.
	if (operation === 'create' || operation === 'fork') {
		const provider = ctx.getNodeParameter('agentProvider', i, '') as string;
		if (provider) {
			const overlay = (input.overlay ?? {}) as Record<string, unknown>;
			overlay.provider = provider;
			if (provider === 'code-js') {
				const code = ctx.getNodeParameter('code', i, '') as string;
				if (code) overlay.code_body = code;
			}
			input.overlay = overlay;
		}
	}

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

	// v0.20.0: create/fork auto-discover the tool set (tools/list) at
	// ingestion. `discover` defaults true server-side, so only forward it
	// when the operator opts OUT — keeps the wire payload minimal and leaves
	// pre-v0.20 behaviour byte-identical for the common (discover-on) case.
	if (operation === 'create' || operation === 'fork') {
		const discover = ctx.getNodeParameter('discover', i, true) as boolean;
		if (!discover) input.discover = false;
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

		// v0.21: static non-secret metadata, delivered to the agent on each
		// fire. Shared by Create and Fork (per-fork override is the canonical
		// use). Structured field wins over any `metadata` key in the Fork JSON.
		const metadata = parseObjectField(ctx.getNodeParameter('metadata', i, '{}'), ctx.getNode());
		if (metadata) overlay.metadata = metadata;

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

		// v0.21: static (trusted) metadata + per-delivery credentials parity
		// with ScheduleDef. Shared by Create and Fork; structured fields win
		// over the same keys in the Advanced Overlay JSON. Request-SOURCED
		// metadata (run_metadata.* payload_mapping) stays in the overlay JSON.
		const metadata = parseObjectField(ctx.getNodeParameter('metadata', i, '{}'), ctx.getNode());
		if (metadata) overlay.metadata = metadata;
		const userCredentials = collectNameValuePairs(
			ctx.getNodeParameter('userCredentials', i, {}),
			'credential',
		);
		if (Object.keys(userCredentials).length > 0) overlay.user_credentials = userCredentials;

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
 * Pluggable memory-backend admin (RFC I, v0.15). Generic op-discriminated
 * def-admin (backend body rides the overlay JSON), so it reuses
 * buildSubstrateInput like AgentDef.
 */
async function executeMemoryBackendDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.memoryBackendDef(input);
	return { result: resp } as IDataObject;
}

/**
 * OperatorTokenDef admin (RFC L, v0.17). The node only exposes get/list/retire
 * (descriptions/operatortokendef.ts) — create/rotate return the token plaintext
 * and are deliberately omitted so a live bearer never lands in n8n execution
 * data (CLAUDE.md §6). Defence-in-depth: refuse create/rotate here too, in case
 * an operation value is injected via an expression.
 */
async function executeOperatorTokenDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'create' || operation === 'rotate') {
		throw new NodeOperationError(
			ctx.getNode(),
			`Operator token ${operation} is not supported from n8n — it returns the token secret, which must not enter execution data. Mint / rotate via the loomcycle Web UI or CLI.`,
		);
	}
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.operatorTokenDef(input);
	return { result: resp } as IDataObject;
}

/**
 * Runtime snapshot lifecycle (v0.8.17+) — backup / restore the substrate from
 * n8n. Bespoke executor (not op-discriminated). exportUrl is synchronous (no
 * HTTP call) and returns a bearer-authed download URL the caller fetches with
 * the same Authorization header.
 */
async function executeSnapshot(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'create') {
		const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const opts: CreateSnapshotOptions = {};
		if (extra.label) opts.label = extra.label as string;
		if (extra.includeHistory === true) opts.includeHistory = true;
		if (extra.includeHistorySince) opts.includeHistorySince = extra.includeHistorySince as string;
		if (typeof extra.maxBytes === 'number' && extra.maxBytes > 0) opts.maxBytes = extra.maxBytes;
		const resp = await client.createSnapshot(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'list') {
		const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const opts: { limit?: number; labelContains?: string } = {};
		if (typeof extra.limit === 'number' && extra.limit > 0) opts.limit = extra.limit;
		if (extra.labelContains) opts.labelContains = extra.labelContains as string;
		const entries = await client.listSnapshots(opts);
		return { entries } as unknown as IDataObject;
	}

	if (operation === 'get') {
		const snapshotId = ctx.getNodeParameter('snapshotId', i) as string;
		const resp = await client.getSnapshot(snapshotId);
		return resp as unknown as IDataObject;
	}

	if (operation === 'delete') {
		const snapshotId = ctx.getNodeParameter('snapshotId', i) as string;
		await client.deleteSnapshot(snapshotId);
		// Adapter returns void on success; surface a consistent ok envelope.
		return { ok: true, id: snapshotId } as IDataObject;
	}

	if (operation === 'exportUrl') {
		const snapshotId = ctx.getNodeParameter('snapshotId', i) as string;
		// Synchronous + side-effect-free: just builds the bearer-authed URL.
		const url = client.exportSnapshotURL(snapshotId);
		return { id: snapshotId, url } as IDataObject;
	}

	if (operation === 'restore') {
		const restoreSource = ctx.getNodeParameter('restoreSource', i, 'byId') as string;
		const includeHistory = ctx.getNodeParameter('includeHistory', i, false) as boolean;
		const opts: { snapshotId?: string; json?: unknown; includeHistory?: boolean } = { includeHistory };
		if (restoreSource === 'inline') {
			opts.json = parseJsonField(ctx.getNodeParameter('restoreJson', i, '{}'), {
				strict: true,
				node: ctx.getNode(),
			});
		} else {
			opts.snapshotId = ctx.getNodeParameter('snapshotId', i) as string;
		}
		const resp = await client.restoreSnapshot(opts);
		return resp as unknown as IDataObject;
	}

	// Runtime maintenance, grouped here because these are the calls you make
	// AROUND a snapshot: pause so nothing is admitted mid-capture, capture,
	// deploy or restore, resume. None takes an argument.
	if (operation === 'pauseRuntime') {
		const resp = await client.pauseRuntime();
		return resp as unknown as IDataObject;
	}
	if (operation === 'resumeRuntime') {
		const resp = await client.resumeRuntime();
		return resp as unknown as IDataObject;
	}
	if (operation === 'getRuntimeState') {
		const resp = await client.getRuntimeState();
		return resp as unknown as IDataObject;
	}
	if (operation === 'resolveProbe') {
		const resp = await client.resolveProbe();
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown snapshot operation: ${operation}`);
}

/**
 * Filesystem Volume lifecycle (RFC AH, loomcycle ≥ v1.1). Volumes are FLAT
 * (no version chain), so this is plain CRUD over `client.volumeDef(...)`:
 * create (name + mode; the runtime derives the path) / get / delete (unmap,
 * keep files) / purge (unmap + remove tree). The two list views read the
 * persistent universe (`listVolumes`) and the live run-scoped ephemerals
 * (`listEphemeralVolumes`).
 */
async function executeVolume(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'list') {
		const resp = await client.listVolumes();
		return resp as unknown as IDataObject;
	}

	if (operation === 'listEphemeral') {
		const resp = await client.listEphemeralVolumes();
		return resp as unknown as IDataObject;
	}

	if (operation === 'create') {
		const name = ctx.getNodeParameter('name', i) as string;
		const mode = ctx.getNodeParameter('mode', i, 'rw') as VolumeMode;
		const resp = await client.volumeDef({ op: 'create', name, mode });
		return { result: resp } as IDataObject;
	}

	// get / delete / purge — the name comes from the loadVolumes dropdown.
	if (operation === 'get' || operation === 'delete' || operation === 'purge') {
		const name = ctx.getNodeParameter('volumeName', i) as string;
		const resp = await client.volumeDef({ op: operation, name });
		return { result: resp } as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown volume operation: ${operation}`);
}

/**
 * Path VFS ops (RFC AL, loomcycle ≥ v1.4) over `client.path(...)`. A Unix-like
 * filesystem naming Memory entries / Volume mounts / Documents. Scope
 * (agent/user/tenant) is forwarded as a routing hint; the substrate resolves
 * the authoritative tenant + subject from the bearer. The op-specific extras
 * (`to` for mv, `recursive` + `kind_filter` for ls, `recursive` for rm) ride
 * the same PathToolInput.
 */
async function executePath(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input: PathToolInput = {
		op: operation as PathToolInput['op'],
		path: ctx.getNodeParameter('path', i) as string,
		scope: ctx.getNodeParameter('scope', i, 'agent') as PathToolInput['scope'],
	};

	if (operation === 'mv') {
		input.to = ctx.getNodeParameter('to', i) as string;
	}

	if (operation === 'ls') {
		if (ctx.getNodeParameter('recursive', i, false) as boolean) input.recursive = true;
		const kindFilter = ctx.getNodeParameter('kindFilter', i, '') as string;
		if (kindFilter) input.kind_filter = kindFilter;
	}

	if (operation === 'rm') {
		if (ctx.getNodeParameter('recursive', i, false) as boolean) input.recursive = true;
	}

	const resp = await client.path(input);
	return { result: resp } as IDataObject;
}

/**
 * Chunked-graph Documents (RFC AK + BS/BO/CE). Op-discriminated passthrough to
 * `client.document(...)`, assembled per-op so an unset field never reaches the
 * wire — the substrate distinguishes "absent" from "empty" in several places
 * (tags omitted = unchanged vs `[]` = clear; revision omitted = no concurrency
 * guard), so blanket-sending every parameter would change behaviour.
 *
 * Set Asset / Get Asset carry binary rather than JSON, so they are handled
 * outside the generic assembly.
 */
async function executeDocument(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const scope = ctx.getNodeParameter('scope', i, 'user') as DocumentToolInput['scope'];
	const input: DocumentToolInput = { op: operation as DocumentToolInput['op'], scope };

	const str = (name: string): string => (ctx.getNodeParameter(name, i, '') as string).trim();
	const num = (name: string): number => ctx.getNodeParameter(name, i, 0) as number;

	// ---- Identifiers ----
	const id = str('id');
	if (id) input.id = id;
	const path = str('path');
	if (path) input.path = path;
	const documentId = str('documentId');
	if (documentId) {
		assertNotAPath(documentId, 'Document ID', ctx, i);
		input.document_id = documentId;
	}
	const parentId = str('parentId');
	if (parentId) input.parent_id = parentId;
	// after_id overrides parent_id server-side (the parent is implied by the
	// sibling), so both may be sent and the substrate resolves the precedence.
	const afterId = str('afterId');
	if (afterId) input.after_id = afterId;
	if (operation === 'move_chunk') input.new_parent_id = str('newParentId');
	if (operation === 'documents_summary') {
		const documentIds = parseCsv(ctx.getNodeParameter('documentIds', i, '') as unknown);
		if (documentIds !== undefined) input.document_ids = documentIds;
	}

	// ---- Content ----
	const title = str('title');
	if (title) input.title = title;
	const body = str('body');
	if (body) input.body = body;
	const type = str('type');
	if (type) input.type = type;
	const status = str('status');
	if (status) input.status = status;
	const fields = parseObjectField(
		ctx.getNodeParameter('fields', i, '{}') as unknown,
		ctx.getNode(),
	);
	if (fields) input.fields = fields;

	// Tags REPLACE-SET on create/update but are a delta on add/remove_tags. An
	// empty CSV is therefore omitted rather than sent as [] — sending [] on an
	// update would silently clear the chunk's tags.
	const tags = parseCsv(ctx.getNodeParameter('tags', i, '') as unknown);
	if (tags !== undefined) input.tags = tags;
	const tag = str('tag');
	if (tag) input.tag = tag;
	const tagPrefix = str('tagPrefix');
	if (tagPrefix) input.tag_prefix = tagPrefix;

	// ---- Reorder is RELATIVE (verified live): the substrate refuses an
	// absolute `position` with `direction must be "up" or "down"`. ----
	if (operation === 'reorder_chunk') {
		input.direction = ctx.getNodeParameter('reorderDirection', i, 'up') as string;
	}

	// ---- Revisions (0 means "omit", not "revision zero") ----
	if (operation === 'update_chunk' || operation === 'get_version') {
		const revision = num('revision');
		if (revision > 0) input.revision = revision;
	}
	if (operation === 'diff') {
		input.from_revision = num('fromRevision');
		input.to_revision = num('toRevision');
	}

	// ---- Edges ----
	if (operation === 'link_chunks' || operation === 'unlink_chunks') {
		input.from_id = str('fromId');
		input.to_id = str('toId');
	}
	const kind = str('kind');
	if (kind) input.kind = kind;

	// ---- Query filters ----
	const underPath = str('underPath');
	if (underPath) input.under_path = underPath;
	const sql = str('sql');
	if (sql) input.sql = sql;
	const titleContains = str('titleContains');
	if (titleContains) input.title_contains = titleContains;
	const limit = num('limit');
	if (limit > 0) input.limit = limit;

	// ---- Types ----
	if (operation === 'define_type') input.name = str('name');

	// ---- Markdown / canvas IO ----
	if (operation === 'export_md') {
		input.include_metadata = ctx.getNodeParameter('includeMetadata', i, true) as boolean;
	}
	if (operation === 'import_md') input.markdown = str('markdown');
	if (operation === 'import_canvas') {
		input.canvas = parseJsonField(ctx.getNodeParameter('canvas', i, '{}') as unknown, {
			strict: true,
			node: ctx.getNode(),
		});
	}

	// ---- Federation (RFC CE). `source` / `remote_ref` / `direction` are not on
	// the typed DocumentToolInput yet; they ride its index signature. ----
	if (operation === 'set_remote') {
		input.source = str('source');
		input.remote_ref = str('remoteRef');
	}
	if (operation === 'sync') {
		input.direction = ctx.getNodeParameter('direction', i, 'pull') as string;
	}

	// ---- Assets (RFC BO): binary in, binary out ----
	if (operation === 'set_asset') {
		const prop = str('assetBinaryProperty') || 'data';
		const meta = ctx.helpers.assertBinaryData(i, prop);
		const buf = await ctx.helpers.getBinaryDataBuffer(i, prop);
		input.data = buf.toString('base64');
		if (meta.mimeType) input.media_type = meta.mimeType;
		// Prefer an explicit filename, else carry through whatever the upstream
		// node attached to the binary — metadata only either way.
		const filename = str('assetFilename') || meta.fileName || '';
		if (filename) input.filename = filename;
	}

	const resp = await client.document(input);
	return { result: resp } as IDataObject;
}

/**
 * The RFC CC fact tier. Same wire method as {@link executeDocument} — split by
 * audience, not by transport: these ops make or check a CLAIM ABOUT A SUBJECT,
 * and a fact is distinguished from a plain chunk on the wire by carrying
 * `subject` + `type`.
 *
 * `judged_at` / `judged_by` are deliberately absent: the substrate stamps them
 * and accepts no wire field, so a caller cannot launder a machine verdict into
 * an operator one.
 */
async function executeFact(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const scope = ctx.getNodeParameter('scope', i, 'user') as DocumentToolInput['scope'];
	const input: DocumentToolInput = { op: operation as DocumentToolInput['op'], scope };

	const str = (name: string): string => (ctx.getNodeParameter(name, i, '') as string).trim();

	const subject = str('subject');
	if (subject) input.subject = subject;
	const type = str('type');
	if (type) input.type = type;
	const naturalKey = str('naturalKey');
	if (naturalKey) input.natural_key = naturalKey;

	// Supersede is a pure link between TWO existing chunks (verified live): `id`
	// is the REPLACEMENT and `supersedes_id` the retired one, and it accepts no
	// body/subject/type. Judge uses its own id field so the two cannot be
	// confused in the UI.
	if (operation === 'supersede_chunk') {
		input.id = str('id');
		input.supersedes_id = str('supersedesId');
	}
	if (operation === 'judge_fact') {
		const judgeId = str('judgeId');
		if (judgeId) input.id = judgeId;
	}

	const title = str('title');
	if (title) input.title = title;
	const body = str('body');
	if (body) input.body = body;
	const sourceQuote = str('sourceQuote');
	if (sourceQuote) input.source_quote = sourceQuote;
	const documentId = str('documentId');
	if (documentId) {
		assertNotAPath(documentId, 'Document ID', ctx, i);
		input.document_id = documentId;
	}
	const query = str('query');
	if (query) input.query = query;

	if (operation === 'judge_fact') {
		input.verdict = ctx.getNodeParameter('verdict', i, 'supported') as DocumentToolInput['verdict'];
		// The substrate requires a reason, so a verdict always carries its
		// justification. Fail here rather than surfacing an opaque 4xx.
		const reason = str('reason');
		if (!reason) {
			throw new NodeOperationError(
				ctx.getNode(),
				'Reason is required for Judge Fact — the substrate refuses a verdict without one.',
				{ itemIndex: i },
			);
		}
		input.reason = reason;
	}

	if (operation === 'remember') input.text = str('text');

	if (operation === 'list_facts' || operation === 'graph_recall') {
		if (ctx.getNodeParameter('includeRefuted', i, false) as boolean) input.include_refuted = true;
	}

	// ---- Bi-temporal write fields. The substrate takes unix NANOSECONDS; the
	// node exposes n8n dateTime pickers and converts, because hand-authoring
	// nanos in a workflow expression is a needless footgun. ----
	if (operation === 'upsert_chunk' || operation === 'remember') {
		const factOptions = ctx.getNodeParameter('factOptions', i, {}) as IDataObject;
		if (factOptions.class) input.class = factOptions.class as string;
		// 0 is "omit", not "zero confidence" — the substrate treats an absent
		// confidence differently from an asserted 0.
		if (typeof factOptions.confidence === 'number' && factOptions.confidence > 0) {
			input.confidence = factOptions.confidence;
		}
		const validAt = toUnixNanos(factOptions.validAt, 'Valid At', ctx, i);
		if (validAt !== undefined) input.valid_at = validAt;
		const invalidAt = toUnixNanos(factOptions.invalidAt, 'Invalid At', ctx, i);
		if (invalidAt !== undefined) input.invalid_at = invalidAt;
	}

	// ---- Bi-temporal reads: answer as of a past instant, and optionally
	// include facts since superseded. ----
	if (operation === 'list_facts') {
		// Verified live: List Facts filters on TYPE (with subtype expansion) and
		// CLASS. `subject` is accepted but silently ignored, so the node does not
		// offer it here — an ignored filter reads as a broken one.
		const classFilter = str('classFilter');
		if (classFilter) input.class = classFilter;
	}

	if (operation === 'list_facts' || operation === 'graph_recall') {
		const recallOptions = ctx.getNodeParameter('recallOptions', i, {}) as IDataObject;
		const asOf = toUnixNanos(recallOptions.asOf, 'As Of', ctx, i);
		if (asOf !== undefined) input.as_of = asOf;
		if (recallOptions.includeRetired === true) input.include_retired = true;
	}

	if (operation === 'graph_recall') {
		const graphOptions = ctx.getNodeParameter('graphOptions', i, {}) as IDataObject;
		// hops 0 is meaningful (starting chunks only), so it is sent whenever the
		// operator set it at all — unlike confidence, where 0 means "unset".
		if (typeof graphOptions.hops === 'number') input.hops = graphOptions.hops;
		const seedIds = parseCsv(graphOptions.seedIds);
		if (seedIds !== undefined) input.seed_ids = seedIds;
	}

	if (operation === 'verbatim_answer') {
		const minScore = ctx.getNodeParameter('minScore', i, 0) as number;
		if (minScore > 0) input.min_score = minScore;
	}

	const limit = ctx.getNodeParameter('limit', i, 0) as number;
	if (limit > 0) input.limit = limit;

	const resp = await client.document(input);
	return { result: resp } as IDataObject;
}

/**
 * DocumentSourceDef admin (RFC CE) — a faithful mirror of MemoryBackendDef, so
 * it reuses the shared op-discriminated substrate-input builder verbatim.
 */
async function executeDocumentSourceDef(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input = buildSubstrateInput(ctx, operation, i);
	const resp = await client.documentSourceDef(input);
	return { result: resp } as IDataObject;
}

/**
 * Agent Teams (RFC AP). Unlike the other Def families the adapter exposes SEVEN
 * TYPED methods here rather than one op-discriminated call, so this does not go
 * through `buildSubstrateInput`.
 *
 * The substrate's `promote` / `retire` / `verify` ops have no adapter wrapper, so
 * they are deliberately absent rather than hand-rolled (CLAUDE.md: the adapter is
 * the only wire-egress point). The practical consequence — verified live — is
 * that a fork lands unpromoted and stays unreachable by name; Run by def_id is
 * the way to reach it from here.
 */
async function executeTeam(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'list') {
		const resp = await client.listTeams();
		// `names` is a Go nil-slice on the wire: null, not [], when empty.
		// Normalising here spares every downstream expression a null check.
		return { names: resp.names ?? [] } as unknown as IDataObject;
	}

	if (operation === 'get') {
		const defId = ctx.getNodeParameter('defId', i) as string;
		const resp = await client.getTeamDef(defId);
		return resp as unknown as IDataObject;
	}

	if (operation === 'create' || operation === 'fork') {
		const name = ctx.getNodeParameter('teamName', i) as string;
		// Strict: an invalid graph is refused server-side anyway, but a JSON typo
		// should name itself here rather than arriving as a validation error about
		// a graph the operator never meant to send.
		const overlay = parseJsonField(ctx.getNodeParameter('overlay', i, '{}') as unknown, {
			strict: true,
			node: ctx.getNode(),
		}) as Record<string, unknown>;
		const description = (ctx.getNodeParameter('defDescription', i, '') as string).trim();
		if (description) overlay.description = description;

		const resp =
			operation === 'create'
				? await client.createTeam(name, overlay)
				: await client.forkTeam(name, overlay);
		return resp as unknown as IDataObject;
	}

	if (operation === 'delete') {
		const name = ctx.getNodeParameter('teamName', i) as string;
		const resp = await client.deleteTeam(name);
		return resp as unknown as IDataObject;
	}

	if (operation === 'renderDiagram') {
		const name = ctx.getNodeParameter('teamName', i) as string;
		const highlightState = (ctx.getNodeParameter('highlightState', i, '') as string).trim();
		const resp = await client.renderTeamDiagram(
			name,
			highlightState ? { highlightState } : undefined,
		);
		return resp as unknown as IDataObject;
	}

	if (operation === 'run') {
		const targetBy = ctx.getNodeParameter('runTargetBy', i, 'name') as string;
		const input = (ctx.getNodeParameter('input', i, '') as string).trim();
		const boardOptions = ctx.getNodeParameter('boardOptions', i, {}) as IDataObject;

		const target: {
			name?: string;
			defId?: string;
			input?: string;
			boardChunkId?: string;
			boardScope?: 'agent' | 'user';
		} = {};
		if (targetBy === 'defId') {
			target.defId = ctx.getNodeParameter('runDefId', i) as string;
		} else {
			target.name = ctx.getNodeParameter('runTeamName', i) as string;
		}
		if (input) target.input = input;
		if (boardOptions.boardChunkId) {
			target.boardChunkId = boardOptions.boardChunkId as string;
			// Only meaningful alongside a board chunk, so it is not sent alone.
			if (boardOptions.boardScope) {
				target.boardScope = boardOptions.boardScope as 'agent' | 'user';
			}
		}

		const resp = await client.runTeam(target);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown team operation: ${operation}`);
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
 * Human-in-the-loop over Interruption.ask (v0.8.16). List pending asks by
 * user or run, and Resolve one with a human's answer so the parked agent
 * unblocks. Requires loomcycle's consumer-MCP interruption backend to accept
 * an external resolver.
 */
async function executeInterruption(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'listForUser') {
		const userIdParam = ctx.getNodeParameter('userId', i, '') as string;
		const userId = userIdParam || (await getCredentialDefault(ctx, 'userId'));
		if (!userId) {
			throw new NodeOperationError(
				ctx.getNode(),
				'User ID is required for List for User — set per-node or as a Default User ID on the credential.',
			);
		}
		const status = ctx.getNodeParameter('status', i, 'pending') as InterruptStatus;
		const resp = await client.listUserInterrupts(userId, { status });
		return resp as unknown as IDataObject;
	}

	if (operation === 'listForRun') {
		const runId = ctx.getNodeParameter('runId', i) as string;
		const status = ctx.getNodeParameter('status', i, 'pending') as InterruptStatus;
		const resp = await client.listRunInterrupts(runId, { status });
		return resp as unknown as IDataObject;
	}

	if (operation === 'resolve') {
		const runId = ctx.getNodeParameter('runId', i) as string;
		const interruptId = ctx.getNodeParameter('interruptId', i) as string;
		const answer = ctx.getNodeParameter('answer', i) as string;
		const resolvedBy = ctx.getNodeParameter('resolvedBy', i, '') as string;
		const resp = await client.resolveInterrupt(runId, interruptId, {
			answer,
			...(resolvedBy ? { resolvedBy } : {}),
		});
		return { result: resp ?? { ok: true } } as IDataObject;
	}

	if (operation === 'decline') {
		// RFC BH P2 (v1.22): decline a pending ask WITHOUT answering it. The
		// agent's waiting Question tool returns a non-error "declined" result
		// and the run continues — unlike Resolve, which supplies an answer, and
		// unlike Cancel, which kills the run.
		const runId = ctx.getNodeParameter('runId', i) as string;
		const interruptId = ctx.getNodeParameter('interruptId', i) as string;
		const resolvedBy = ctx.getNodeParameter('resolvedBy', i, '') as string;
		const resp = await client.cancelInterrupt(runId, interruptId, {
			...(resolvedBy ? { resolvedBy } : {}),
		});
		return { result: resp ?? { ok: true } } as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown interruption operation: ${operation}`);
}

/**
 * Direct LLM-gateway calls (v0.11.0) as a workflow step — chat completion +
 * embeddings — without the agent loop. Distinct from the Chat Model cluster
 * sub-node (which feeds an AI Agent); this is for RAG / embedding pipelines.
 */
async function executeLlm(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'chat') {
		const rows = ctx.getNodeParameter('messages', i, {}) as IDataObject;
		const messageRows = Array.isArray(rows.message) ? (rows.message as IDataObject[]) : [];
		if (messageRows.length === 0) {
			throw new NodeOperationError(ctx.getNode(), 'Chat requires at least one message.');
		}
		const messages: LLMChatMessage[] = messageRows.map((row) => ({
			role: (row.role as LLMChatMessage['role']) ?? 'user',
			content: (row.content as string) ?? '',
		}));

		const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const opts: LLMChatOptions = { messages };
		if (typeof extra.maxTokens === 'number') opts.max_tokens = extra.maxTokens;
		if (typeof extra.temperature === 'number') opts.temperature = extra.temperature;
		if (extra.provider) opts.provider = extra.provider as string;
		if (extra.model) opts.model = extra.model as string;
		if (extra.tier) opts.tier = extra.tier as string;
		const userId = (extra.userId as string) || (await getCredentialDefault(ctx, 'userId'));
		if (userId) opts.user_id = userId;
		if (extra.userTier) opts.user_tier = extra.userTier as string;

		const resp = await client.llmChat(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'embeddings') {
		const model = ctx.getNodeParameter('model', i) as string;
		const rawInput = ctx.getNodeParameter('input', i) as string;
		const splitLines = ctx.getNodeParameter('splitLines', i, false) as boolean;
		// One vector for the whole field by default; with splitLines, each
		// non-empty line is a separate input (string[]).
		const input: string | string[] = splitLines
			? rawInput.split('\n').map((l) => l.trim()).filter((l) => l !== '')
			: rawInput;

		const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const opts: LLMEmbeddingsOptions = { model, input };
		if (extra.encodingFormat === 'base64') opts.encoding_format = 'base64';
		if (typeof extra.dimensions === 'number' && extra.dimensions > 0) opts.dimensions = extra.dimensions;
		if (extra.user) opts.user = extra.user as string;

		const resp = await client.embeddings(opts);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown llm operation: ${operation}`);
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

/**
 * Convert an n8n `dateTime` parameter to the unix NANOSECONDS the bi-temporal
 * fact tier expects (RFC CC). Returns undefined for an empty value so the field
 * is omitted rather than sent as 0 — the substrate reads an absent `valid_at` as
 * "now" and an absent `invalid_at` as "still true", both of which differ sharply
 * from the epoch.
 *
 * Milliseconds → nanoseconds is exact (×1e6), so no precision is invented; the
 * node simply cannot express sub-millisecond instants, which no n8n picker
 * produces anyway.
 */
function toUnixNanos(
	raw: unknown,
	label: string,
	ctx: IExecuteFunctions,
	itemIndex: number,
): number | undefined {
	if (raw === undefined || raw === null || raw === '') return undefined;
	const ms = Date.parse(String(raw));
	if (Number.isNaN(ms)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} is not a valid date/time: "${String(raw)}". Use the date picker or an ISO-8601 string.`,
			{ itemIndex },
		);
	}
	return ms * 1_000_000;
}

/**
 * Reject a Path where a document ID is expected.
 *
 * The substrate accepts `document_id` VERBATIM and does not check that the
 * document exists, so passing a Path-tree path (`/documents/news/tech-news`)
 * silently creates an ORPHAN chunk: it is stored, `get_chunk` retrieves it, and
 * the write reports success — but no document owns it, so nothing in the UI or
 * in `query_chunks` can ever render it. Confirmed against a live v1.55.
 *
 * A leading slash is the reliable tell: document IDs are hex, paths start with
 * `/`. Failing here converts a silent data-orphaning bug into a message that
 * names the fix.
 */
function assertNotAPath(
	value: string,
	fieldLabel: string,
	ctx: IExecuteFunctions,
	itemIndex: number,
): void {
	if (!value.startsWith('/')) return;
	throw new NodeOperationError(
		ctx.getNode(),
		`${fieldLabel} looks like a Path ("${value}"), but this field needs a document ID. A path is not accepted here and the substrate would store the chunk against a document that does not exist, leaving it invisible. Resolve the path first: run Get Document with Path "${value}" and use the document_id it returns.`,
		{ itemIndex },
	);
}

function parseCsv(raw: unknown): string[] | undefined {
	if (typeof raw !== 'string' || raw.trim() === '') return undefined;
	const items = raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return items.length > 0 ? items : undefined;
}

/**
 * Parse a JSON-object field (metadata blocks) into a plain object, or
 * `undefined` when it's empty / absent. Strict-parses so malformed JSON
 * surfaces as a clear node error rather than a silent string. Arrays and
 * scalars are rejected (metadata is always a `{key: value}` map).
 */
function parseObjectField(
	raw: unknown,
	node: import('n8n-workflow').INode,
): Record<string, unknown> | undefined {
	if (raw === undefined || raw === null || raw === '') return undefined;
	const parsed = parseJsonField(raw, { strict: true, node });
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		const obj = parsed as Record<string, unknown>;
		return Object.keys(obj).length > 0 ? obj : undefined;
	}
	return undefined;
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


/**
 * Directory (loomcycle ≥ v1.46) — read-only "who is in this deployment".
 *
 * A "user" here is DERIVED from run activity rather than stored, which is why
 * there is nothing to create or update; removing a footprint is the Erasure
 * resource. `tenant` is threaded as an EXPLICIT EMPTY STRING when the operator
 * typed one, because for an admin token `""` selects the default tenant while
 * omitting the field entirely makes the server refuse rather than guess.
 */
async function executeDirectory(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'tenants') {
		// Admin-only: a tenant-scoped token is refused outright rather than given
		// a filtered list, and the substrate's message says so — so it passes
		// through wrapLoomcycleError unaltered.
		const resp = await client.directoryTenants();
		return resp as unknown as IDataObject;
	}

	const tenantRaw = ctx.getNodeParameter('tenant', i, undefined) as string | undefined;
	const opts = tenantRaw === undefined ? undefined : { tenant: tenantRaw };

	if (operation === 'users') {
		const resp = await client.directoryUsers(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'inspect') {
		const subject = ctx.getNodeParameter('subject', i) as string;
		const resp = await client.directoryInspect(subject, opts);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown directory operation: ${operation}`);
}

/**
 * Subject erasure (RFC BL P5, loomcycle ≥ v1.45).
 *
 * Two safety properties are deliberate here. `dryRun` is sent EXPLICITLY rather
 * than relying on the server default, so a reader of this code can see which
 * mode the request is in. And the confirm string is checked LOCALLY first: the
 * substrate requires `confirm === subject`, and failing here means a typo cannot
 * reach a destructive endpoint at all.
 *
 * The response — dry run or not — is returned verbatim because it is the only
 * durable record of tier-3 residue.
 */
async function executeErasure(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const subject = ctx.getNodeParameter('subject', i) as string;
	const tenantRaw = ctx.getNodeParameter('tenant', i, undefined) as string | undefined;

	if (operation === 'report') {
		const resp = await client.erasureReport(
			subject,
			tenantRaw === undefined ? undefined : { tenant: tenantRaw },
		);
		return resp as unknown as IDataObject;
	}

	if (operation === 'execute') {
		const commit = ctx.getNodeParameter('commit', i, false) as boolean;
		const opts: { dryRun: boolean; confirm?: string; tenant?: string } = { dryRun: !commit };
		if (tenantRaw !== undefined) opts.tenant = tenantRaw;

		if (commit) {
			const confirmSubject = (ctx.getNodeParameter('confirmSubject', i, '') as string).trim();
			if (confirmSubject !== subject) {
				throw new NodeOperationError(
					ctx.getNode(),
					`Confirm Subject must exactly match Subject to run a live erasure. Got "${confirmSubject}" for subject "${subject}". Nothing was sent.`,
					{ itemIndex: i },
				);
			}
			opts.confirm = confirmSubject;
		}

		const resp = await client.erasureExecute(subject, opts);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown erasure operation: ${operation}`);
}

/**
 * Tenant-owned users + delegated tokens (RFC BX P2, loomcycle ≥ v1.50).
 *
 * The tenant is always server-derived, so no call here takes one.
 *
 * Scoped to reads plus one revocation. `mintUserToken` is unreachable because the
 * substrate returns the bearer plaintext exactly once and it would land in n8n
 * execution data (CLAUDE.md §security.6); identity CRUD is unreachable because
 * provisioning users is operator work, not a workflow side effect. Both are
 * absent from the op list AND refused here — the same defence-in-depth the
 * Operator Token node uses.
 */
async function executeUser(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	// Refused defensively, not merely omitted from the op list. Minting returns
	// the bearer plaintext once, so it must never be reachable; identity CRUD is
	// operator work that belongs in the CLI / Web UI rather than in a workflow.
	if (operation === 'mint' || operation === 'mintToken' || operation === 'rotate') {
		throw new NodeOperationError(
			ctx.getNode(),
			'Minting a delegated token is not available from n8n: the substrate returns the bearer plaintext once, and it would be persisted into execution data. Mint it via the loomcycle CLI or Web UI.',
			{ itemIndex: i },
		);
	}
	if (operation === 'create' || operation === 'update' || operation === 'delete') {
		throw new NodeOperationError(
			ctx.getNode(),
			`User ${operation} is not available from n8n — provisioning and removing users is operator work. Do it via the loomcycle CLI or Web UI. (To remove a subject's DATA rather than its identity row, use the LoomCycle Erasure node.)`,
			{ itemIndex: i },
		);
	}

	if (operation === 'list') {
		const resp = await client.listUsers();
		return resp as unknown as IDataObject;
	}

	const subject = ctx.getNodeParameter('subject', i) as string;

	if (operation === 'listTokens') {
		const resp = await client.listUserTokens(subject);
		return resp as unknown as IDataObject;
	}

	if (operation === 'revokeToken') {
		const defId = ctx.getNodeParameter('tokenDefId', i) as string;
		const resp = await client.revokeUserToken(subject, defId);
		return resp as unknown as IDataObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown user operation: ${operation}`);
}

/**
 * Usage attribution (RFC AV) + token budgets (RFC AW) + the instance capability
 * report. The FinOps surface, READ-ONLY: budget writes are operator work.
 */
async function executeUsage(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'getConfig') {
		const resp = await client.getConfig();
		return resp as unknown as IDataObject;
	}

	const tenant = (ctx.getNodeParameter('tenant', i, '') as string).trim();

	if (operation === 'usageReport') {
		const opts: { groupBy?: UsageDimension[]; from?: string; to?: string; tenant?: string } = {};
		const groupBy = ctx.getNodeParameter('groupBy', i, []) as string[];
		if (groupBy.length > 0) opts.groupBy = groupBy as UsageDimension[];
		// The wire wants RFC3339; n8n's dateTime already emits it.
		const from = (ctx.getNodeParameter('from', i, '') as string).trim();
		if (from) opts.from = from;
		const to = (ctx.getNodeParameter('to', i, '') as string).trim();
		if (to) opts.to = to;
		if (tenant) opts.tenant = tenant;
		const resp = await client.usageReport(opts);
		return resp as unknown as IDataObject;
	}

	if (operation === 'listLimits') {
		const resp = await client.listLimits(tenant ? { tenant } : undefined);
		return resp as unknown as IDataObject;
	}

	// Budget WRITES are deliberately unreachable: they stay operator-only even for
	// a tenant member (RFC CB), and setLimit is a full-row upsert whose omitted
	// tier CLEARS that ceiling — too easy to do damage with from a half-filled
	// form. Refused rather than merely omitted from the op list.
	if (operation === 'setLimit' || operation === 'deleteLimit') {
		throw new NodeOperationError(
			ctx.getNode(),
			`Usage ${operation} is not available from n8n — setting token budgets is an operator act, and setLimit is a full-row upsert that would clear any tier left blank. Manage budgets via the loomcycle CLI or Web UI.`,
			{ itemIndex: i },
		);
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown usage operation: ${operation}`);
}

/**
 * Past chats as first-class objects (RFC BE, loomcycle ≥ v1.20). Op-discriminated
 * passthrough to `client.history(...)`.
 *
 * The owner is resolved server-side from the authenticated principal, so a caller
 * picks a SCOPE selector and never an owner id.
 *
 * `related` is the only op with two mutually exclusive inputs: the substrate
 * accepts `query` OR `session_id`, never both, so the node makes that a radio
 * choice rather than two fields an operator could fill in together.
 */
async function executeHistory(
	ctx: IExecuteFunctions,
	client: LoomClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const input: HistoryToolInput = {
		op: operation as HistoryToolInput['op'],
		scope: ctx.getNodeParameter('scope', i, 'self') as HistoryToolInput['scope'],
	};

	const str = (name: string): string => (ctx.getNodeParameter(name, i, '') as string).trim();

	if (['get', 'rename', 'annotate', 'pin', 'archive', 'recap', 'resume'].includes(operation)) {
		input.session_id = ctx.getNodeParameter('sessionId', i) as string;
	}

	if (operation === 'get') {
		// '' means the default structured event array, so it is omitted rather
		// than sent as an empty format.
		const format = str('format');
		if (format) input.format = format;
	}

	if (operation === 'list' || operation === 'search') {
		const filters = ctx.getNodeParameter('filters', i, {}) as IDataObject;
		if (filters.status) input.status = filters.status as string;
		if (filters.from) input.from = filters.from as string;
		if (filters.to) input.to = filters.to as string;
		if (filters.tag) input.tag = filters.tag as string;
		if (filters.titleContains) input.title_contains = filters.titleContains as string;
		if (filters.pinnedOnly === true) input.pinned_only = true;
		if (filters.includeArchived === true) input.include_archived = true;
		if (filters.includeInternal === true) input.include_internal = true;
		if (typeof filters.offset === 'number' && filters.offset > 0) input.offset = filters.offset;
	}

	if (operation === 'search') {
		// Title-only substring match — see the field description. Named `query`
		// on the wire despite not being a content search.
		input.query = ctx.getNodeParameter('query', i) as string;
	}

	if (operation === 'related') {
		const by = ctx.getNodeParameter('relatedBy', i, 'query') as string;
		if (by === 'session') {
			input.session_id = ctx.getNodeParameter('relatedSessionId', i) as string;
		} else {
			input.query = ctx.getNodeParameter('relatedQuery', i) as string;
		}
	}

	if (operation === 'rename') input.title = ctx.getNodeParameter('title', i) as string;

	if (operation === 'annotate') {
		const description = str('chatDescription');
		if (description) input.description = description;
		// Tags REPLACE the existing set, so an empty CSV is omitted rather than
		// sent as [] — that would clear them.
		const tags = parseCsv(ctx.getNodeParameter('tags', i, '') as unknown);
		if (tags !== undefined) input.tags = tags;
	}

	// Booleans are sent explicitly: `false` is the meaningful unpin / unarchive
	// instruction, not an absent value.
	if (operation === 'pin') input.pinned = ctx.getNodeParameter('pinned', i, true) as boolean;
	if (operation === 'archive') input.archived = ctx.getNodeParameter('archived', i, true) as boolean;

	if (['list', 'search', 'related'].includes(operation)) {
		const limit = ctx.getNodeParameter('limit', i, 0) as number;
		if (limit > 0) input.limit = limit;
	}

	const resp = await client.history(input);
	return resp as unknown as IDataObject;
}
