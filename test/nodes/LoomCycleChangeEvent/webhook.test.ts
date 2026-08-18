import { describe, it, expect, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import type { IDataObject, INode, IWebhookFunctions } from 'n8n-workflow';
import { createHmac } from 'node:crypto';

import { LoomCycleChangeEvent } from '../../../nodes/LoomCycleChangeEvent/LoomCycleChangeEvent.node';

const SECRET = 'test-signing-secret';

function sign(raw: string, secret = SECRET): string {
	return createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');
}

/**
 * Minimal IWebhookFunctions fixture. `rawBody` is what the HMAC is computed
 * over, so the fixture supplies the exact bytes rather than re-serialising the
 * parsed body — mirroring how the node reads it.
 */
function makeWebhookContext(opts: {
	rawBody: string;
	signature?: string;
	params?: Record<string, unknown>;
	staticData?: IDataObject;
	omitRawBody?: boolean;
}): IWebhookFunctions {
	const params: Record<string, unknown> = {
		signingSecret: SECRET,
		emitMode: 'perEvent',
		dedupe: true,
		...(opts.params ?? {}),
	};
	const node: INode = {
		id: 'test-change-event',
		name: 'Change Event',
		type: 'n8n-nodes-loomcycle.loomCycleChangeEvent',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const headers: Record<string, string> = {};
	if (opts.signature !== undefined) headers['x-loomcycle-signature'] = opts.signature;
	const staticData = opts.staticData ?? {};

	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getHeaderData: () => headers,
		getBodyData: () => JSON.parse(opts.rawBody) as IDataObject,
		getRequestObject: () =>
			({
				rawBody: opts.omitRawBody ? Buffer.alloc(0) : Buffer.from(opts.rawBody, 'utf8'),
				readRawBody: async () => {},
			}) as unknown as ReturnType<IWebhookFunctions['getRequestObject']>,
		getNode: () => node,
		getWorkflowStaticData: () => staticData,
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		helpers: {},
	} as unknown as IWebhookFunctions;
}

function invoke(node: LoomCycleChangeEvent, ctx: IWebhookFunctions) {
	return (node.webhook as unknown as (this: IWebhookFunctions) => Promise<{
		workflowData?: Array<Array<{ json: IDataObject }>>;
	}>).call(ctx);
}

const BATCH = JSON.stringify({
	events: [
		{ seq: 11, type: 'memory.set', tenant: 't1', scope: 'user', scope_id: 'u1', key: 'tone', at: 'now' },
		{ seq: 12, type: 'document.chunk.updated', tenant: 't1', scope: 'user', chunk_id: 'c1', at: 'now' },
	],
});

describe('LoomCycleChangeEvent webhook', () => {
	it('accepts a correctly signed batch and emits one item per event', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH) });
		const out = await invoke(node, ctx);
		expect(out.workflowData?.[0]).toHaveLength(2);
		expect(out.workflowData?.[0][0].json).toMatchObject({ seq: 11, type: 'memory.set' });
	});

	it('emits the whole batch as one item in per-batch mode', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({
			rawBody: BATCH,
			signature: sign(BATCH),
			params: { emitMode: 'perBatch' },
		});
		const out = await invoke(node, ctx);
		expect(out.workflowData?.[0]).toHaveLength(1);
		expect((out.workflowData?.[0][0].json as IDataObject).events).toHaveLength(2);
	});

	// SECURITY: the endpoint URL is the only other thing protecting this, so a
	// request that cannot be authenticated must be refused, never accepted.
	it('rejects a wrong signature', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH, 'wrong-secret') });
		await expect(invoke(node, ctx)).rejects.toBeInstanceOf(NodeOperationError);
	});

	it('rejects a missing signature header', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({ rawBody: BATCH });
		await expect(invoke(node, ctx)).rejects.toThrow(/no X-Loomcycle-Signature/);
	});

	it('rejects a signature of the right shape but the wrong length', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH).slice(0, 40) });
		await expect(invoke(node, ctx)).rejects.toThrow(/did not match/);
	});

	// Fails CLOSED: without the raw bytes the HMAC cannot be computed at all, so
	// the node refuses rather than falling back to re-serialising the parsed body
	// (whose key order and whitespace would not match what loomcycle signed).
	it('refuses when the raw body is unavailable rather than accepting unverified', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), omitRawBody: true });
		await expect(invoke(node, ctx)).rejects.toThrow(/cannot be verified/);
	});

	it('refuses when no signing secret is configured', async () => {
		const node = new LoomCycleChangeEvent();
		const ctx = makeWebhookContext({
			rawBody: BATCH,
			signature: sign(BATCH),
			params: { signingSecret: '' },
		});
		await expect(invoke(node, ctx)).rejects.toThrow(/No Signing Secret/);
	});

	// Delivery is at-least-once and loomcycle resumes from its own persisted
	// cursor, so a repeated batch is expected rather than exceptional.
	it('dedupes a replayed batch on seq across deliveries', async () => {
		const node = new LoomCycleChangeEvent();
		const staticData: IDataObject = {};

		const first = await invoke(
			node,
			makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), staticData }),
		);
		expect(first.workflowData?.[0]).toHaveLength(2);

		const replay = await invoke(
			node,
			makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), staticData }),
		);
		// Acknowledged, but starts no execution.
		expect(replay.workflowData).toEqual([]);
	});

	it('emits only the events past the cursor on a partially overlapping batch', async () => {
		const node = new LoomCycleChangeEvent();
		const staticData: IDataObject = {};
		await invoke(node, makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), staticData }));

		const overlapping = JSON.stringify({
			events: [
				{ seq: 12, type: 'document.chunk.updated' },
				{ seq: 13, type: 'memory.set' },
			],
		});
		const out = await invoke(
			node,
			makeWebhookContext({ rawBody: overlapping, signature: sign(overlapping), staticData }),
		);
		expect(out.workflowData?.[0]).toHaveLength(1);
		expect(out.workflowData?.[0][0].json).toMatchObject({ seq: 13 });
	});

	it('passes every event through when dedupe is disabled', async () => {
		const node = new LoomCycleChangeEvent();
		const staticData: IDataObject = {};
		const params = { dedupe: false };
		await invoke(node, makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), staticData, params }));
		const replay = await invoke(
			node,
			makeWebhookContext({ rawBody: BATCH, signature: sign(BATCH), staticData, params }),
		);
		expect(replay.workflowData?.[0]).toHaveLength(2);
	});

	// An event with no usable seq cannot be deduped; dropping it would lose data
	// to guard against a duplicate that may not exist.
	it('passes through an event with no usable seq', async () => {
		const node = new LoomCycleChangeEvent();
		const body = JSON.stringify({ events: [{ type: 'memory.set', key: 'k' }] });
		const out = await invoke(
			node,
			makeWebhookContext({ rawBody: body, signature: sign(body) }),
		);
		expect(out.workflowData?.[0]).toHaveLength(1);
	});

	// A changed envelope should degrade to pass-through, not to silently emitting
	// nothing.
	it('treats an unrecognised envelope as a single event', async () => {
		const node = new LoomCycleChangeEvent();
		const body = JSON.stringify({ seq: 1, type: 'memory.set', key: 'k' });
		const out = await invoke(
			node,
			makeWebhookContext({ rawBody: body, signature: sign(body) }),
		);
		expect(out.workflowData?.[0]).toHaveLength(1);
		expect(out.workflowData?.[0][0].json).toMatchObject({ type: 'memory.set' });
	});
});
