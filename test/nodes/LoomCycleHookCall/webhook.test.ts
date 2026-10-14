import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { IDataObject, IWebhookFunctions } from 'n8n-workflow';

import { LoomCycleHookCall } from '../../../nodes/LoomCycleHookCall/LoomCycleHookCall.node';

const SECRET = 'probe-signing-value-0123456789';

// Shaped like a real v1.113 delivery captured from a local loomcycle.
const BODY = {
	phase: 'agent_start',
	owner: 'run',
	hook_name: 'n8n-signed-start',
	delivery_id: 'c7645f59-6e77-4cee-8607-4e69298c480f',
	agent: 'echo',
	user_id: 'u5',
	run_id: 'r_ffd1b31520b38b89',
	iteration: 0,
};

function sign(raw: string, t: number, secret = SECRET): string {
	return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}

interface CallOptions {
	body?: IDataObject;
	raw?: string;
	signature?: string;
	params?: Record<string, unknown>;
	secret?: string;
	staticData?: Record<string, unknown>;
}

function call(opts: CallOptions = {}) {
	const body = opts.body ?? BODY;
	const raw = opts.raw ?? JSON.stringify(body);
	const now = Math.floor(Date.now() / 1000);
	const signature = opts.signature ?? sign(raw, now);
	const params: Record<string, unknown> = { verifySignature: true, replayWindowSeconds: 300, respond: 'lastNode', ...opts.params };
	const staticData = opts.staticData ?? {};
	const ctx = {
		getNode: () => ({ id: 'h', name: 'Hook Call', type: 't', typeVersion: 1, position: [0, 0], parameters: {} }),
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ value: opts.secret ?? SECRET }),
		getHeaderData: () => ({ 'x-loomcycle-signature': signature }),
		getBodyData: () => body,
		getRequestObject: () => ({ rawBody: Buffer.from(raw, 'utf8') }),
		getWorkflowStaticData: () => staticData,
	} as unknown as IWebhookFunctions;
	return new LoomCycleHookCall().webhook.call(ctx);
}

describe('LoomCycle: Hook Call — webhook()', () => {
	it('accepts a correctly signed call and emits its body', async () => {
		const res = await call();
		expect(res.workflowData?.[0][0].json).toEqual(BODY);
		expect(res.webhookResponse).toBeUndefined();
	});

	it('refuses a tampered body, a wrong secret, and a missing or malformed signature', async () => {
		const now = Math.floor(Date.now() / 1000);
		await expect(call({ raw: JSON.stringify({ ...BODY, agent: 'evil' }), signature: sign(JSON.stringify(BODY), now) })).rejects.toThrow(/did not match/);
		await expect(call({ secret: 'not-the-secret' })).rejects.toThrow(/did not match/);
		await expect(call({ signature: '' })).rejects.toThrow(/no valid X-Loomcycle-Signature/);
		await expect(call({ signature: 'sha256=deadbeef' })).rejects.toThrow(/no valid X-Loomcycle-Signature/);
	});

	it('refuses a signed call outside the replay window', async () => {
		const raw = JSON.stringify(BODY);
		const stale = Math.floor(Date.now() / 1000) - 600;
		await expect(call({ raw, signature: sign(raw, stale) })).rejects.toThrow(/outside the 300 s replay window/);
	});

	it('refuses the same signed request twice, but accepts a retry re-signed with a fresh t', async () => {
		const staticData = {};
		const raw = JSON.stringify(BODY);
		const now = Math.floor(Date.now() / 1000);
		const first = sign(raw, now - 5);
		await call({ raw, signature: first, staticData });
		await expect(call({ raw, signature: first, staticData })).rejects.toThrow(/Refusing a replay/);
		const retry = await call({ raw, signature: sign(raw, now), staticData });
		expect(retry.workflowData?.[0][0].json).toEqual(BODY);
	});

	// Security review: a count-capped seen set let a busy hook evict a pair that
	// was still inside the window, making it replayable. Pruning is by age only.
	it('still refuses a replay after more than 1 000 newer deliveries inside the window', async () => {
		const staticData: Record<string, unknown> = {};
		const raw = JSON.stringify(BODY);
		const now = Math.floor(Date.now() / 1000);
		const captured = sign(raw, now - 10);
		await call({ raw, signature: captured, staticData });
		for (let n = 0; n < 1100; n++) {
			const body = { ...BODY, delivery_id: `flood-${n}` };
			const r = JSON.stringify(body);
			await call({ body, raw: r, signature: sign(r, now), staticData });
		}
		await expect(call({ raw, signature: captured, staticData })).rejects.toThrow(/Refusing a replay/);
	});

	it('forgets pairs older than the window, which the timestamp check already refuses', async () => {
		const staticData: Record<string, unknown> = { hookCallSeen: { 'old@1': 1, 'kept@9999999999': 9999999999 } };
		await call({ staticData });
		const seen = staticData.hookCallSeen as Record<string, number>;
		expect(seen).not.toHaveProperty('old@1');
		expect(seen).toHaveProperty('kept@9999999999');
	});

	// Security review: the signature covers the body, not the endpoint, so a
	// call captured for one hook could be replayed to another trigger sharing
	// the secret. The signed hook_name binds it.
	it('refuses a signed call for a hook this trigger does not serve', async () => {
		await expect(call({ params: { expectedHooks: 'n8n-web-gate, other' } })).rejects.toThrow(/serves n8n-web-gate, other/);
		const res = await call({ params: { expectedHooks: 'n8n-signed-start' } });
		expect(res.workflowData?.[0][0].json).toEqual(BODY);
	});

	it('emits the signed bytes, not a body n8n parsed differently', async () => {
		const raw = JSON.stringify(BODY);
		const now = Math.floor(Date.now() / 1000);
		const res = await call({ raw, body: { ...BODY, agent: 'injected' }, signature: sign(raw, now) });
		expect((res.workflowData?.[0][0].json as IDataObject).agent).toBe('echo');
	});

	it('refuses a signed call with no delivery_id, which cannot be checked for replay', async () => {
		const body = { ...BODY } as IDataObject;
		delete body.delivery_id;
		await expect(call({ body })).rejects.toThrow(/without a delivery_id/);
	});

	it('fails closed on an empty secret', async () => {
		await expect(call({ secret: '' })).rejects.toThrow(/no value/);
	});

	it('with verification off, passes an unsigned call through', async () => {
		const res = await call({ signature: '', params: { verifySignature: false } });
		expect(res.workflowData?.[0][0].json).toEqual(BODY);
	});

	it('an immediate answer is an empty object loomcycle reads as allow, not n8n\'s default message', async () => {
		const res = await call({ params: { respond: 'onReceived' } });
		expect(res.webhookResponse).toEqual({});
	});

	it('answers through the workflow by default (last node), with the response mode taken from the parameter', () => {
		const webhook = new LoomCycleHookCall().description.webhooks?.[0];
		expect(webhook?.responseMode).toBe('={{$parameter["respond"]}}');
		expect(webhook?.responseData).toBe('firstEntryJson');
	});
});
