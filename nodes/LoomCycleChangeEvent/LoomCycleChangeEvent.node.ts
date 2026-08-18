import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { readCursor, writeCursor } from '../LoomCycle/helpers/staticData';

/**
 * `LoomCycle: Change Event` — the one genuinely event-driven trigger in this
 * package (RFC CD Part C, loomcycle ≥ v1.54).
 *
 * Every other trigger here polls, because n8n Cloud's community-node scanner
 * bans timer primitives. This one does not need them: loomcycle PUSHES to us.
 * With `LOOMCYCLE_MEMORY_CHANGES_ENABLED=1` and a `change_subscriptions:` entry
 * in operator yaml, the runtime POSTs HMAC-signed batches to this node's webhook
 * URL on every memory / document write.
 *
 * Events are **value-free** by design: each carries the COORDINATE of what
 * changed (`{seq, type, tenant, scope, scope_id, key|chunk_id, at}`), not the
 * value. Read the value afterwards with the Memory or Document node — that
 * separation is what keeps the feed cheap and avoids duplicating the store.
 *
 * Two properties this node must get right:
 *
 *  - **Signature verification fails CLOSED.** An unsigned, wrongly-signed or
 *    unverifiable request is rejected; there is no "accept if we cannot check"
 *    path, because the endpoint URL is the only other thing protecting it.
 *  - **Delivery is at-least-once**, with loomcycle resuming from a persisted
 *    cursor across restarts. So a batch can legitimately repeat, and the node
 *    dedupes on the monotonic `seq` rather than trusting arrival order.
 */
export class LoomCycleChangeEvent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Change Event',
		name: 'loomCycleChangeEvent',
		icon: 'file:LoomCycleChangeEvent.svg',
		group: ['trigger'],
		version: 1,
		description: 'Fires when loomcycle memory or documents change (HMAC-signed push)',
		defaults: { name: 'LoomCycle: Change Event' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		outputs: ['main'],
		credentials: [],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Signing Secret',
				name: 'signingSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description:
					'The HMAC-SHA256 secret loomcycle signs batches with — the VALUE of the env var named by `secret_env` in your `change_subscriptions:` entry. Requests whose signature does not match are rejected.',
			},
			{
				displayName: 'Emit',
				name: 'emitMode',
				type: 'options',
				default: 'perEvent',
				options: [
					{
						name: 'One Item per Event',
						value: 'perEvent',
						description: 'Emit each change event as its own n8n item — usually what you want for row-per-change processing',
					},
					{
						name: 'One Item per Batch',
						value: 'perBatch',
						description: 'Emit the whole delivered batch as a single item, preserving its grouping',
					},
				],
				description: 'How to shape the delivered batch into n8n items',
			},
			{
				displayName: 'Deduplicate by Seq',
				name: 'dedupe',
				type: 'boolean',
				default: true,
				description:
					'Whether to drop events whose `seq` is at or below the highest already seen. Delivery is at-least-once and loomcycle resumes from a persisted cursor after a restart, so repeats are expected rather than exceptional. Turn this off only if you want every delivery attempt recorded.',
			},
			{
				displayName: 'This trigger receives a PUSH — it cannot be configured from n8n. Add a `change_subscriptions:` entry to loomcycle\'s operator yaml pointing `callback_url` at this node\'s Production webhook URL, set `secret_env` to the env var holding the secret above, and run loomcycle with LOOMCYCLE_MEMORY_CHANGES_ENABLED=1. There is deliberately no runtime authoring API for subscriptions.',
				name: 'changeSubscriptionSetupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events are VALUE-FREE: each carries the coordinate of what changed (seq, type, tenant, scope, scope_id, key or chunk_id, at), never the value itself. Follow this trigger with a LoomCycle Memory → Get Entry or LoomCycle Document → Get Chunk to read the current value.',
				name: 'changeEventShapeNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const secret = (this.getNodeParameter('signingSecret', '') as string).trim();
		const emitMode = this.getNodeParameter('emitMode', 'perEvent') as string;
		const dedupe = this.getNodeParameter('dedupe', true) as boolean;

		if (!secret) {
			throw new NodeOperationError(
				this.getNode(),
				'No Signing Secret is configured, so the request cannot be authenticated. Set it to the value of the env var named by `secret_env` in your change_subscriptions entry.',
			);
		}

		// Verify over the EXACT bytes loomcycle signed. Re-serialising the parsed
		// body would change key order and whitespace, so the HMAC would never
		// match — `rawBody` is the only correct input here.
		const req = this.getRequestObject();
		if (typeof req.readRawBody === 'function') {
			await req.readRawBody();
		}
		const raw = req.rawBody;
		if (!raw || raw.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Could not read the raw request body, so the HMAC signature cannot be verified. Refusing the request rather than accepting it unverified.',
			);
		}

		const headers = this.getHeaderData() as Record<string, string | string[] | undefined>;
		const headerValue = headers['x-loomcycle-signature'];
		const provided = (Array.isArray(headerValue) ? headerValue[0] : headerValue ?? '').trim();
		if (!provided) {
			throw new NodeOperationError(
				this.getNode(),
				'Request carried no X-Loomcycle-Signature header. Only loomcycle should be posting here; refusing.',
			);
		}

		const expected = createHmac('sha256', secret).update(raw).digest('hex');
		if (!signaturesMatch(provided, expected)) {
			throw new NodeOperationError(
				this.getNode(),
				'X-Loomcycle-Signature did not match. Check that the Signing Secret here is the same value as the env var named by `secret_env` on the loomcycle side.',
			);
		}

		const body = this.getBodyData();
		const events = extractEvents(body);

		let emitted = events;
		if (dedupe) {
			// The cursor is the highest seq already emitted. Persisted in workflow
			// static data so it survives across deliveries, matching how loomcycle
			// itself resumes from a persisted cursor.
			const key = 'changeEvent:seq';
			const lastSeen = Number(readCursor(this, key) || '0');
			let highest = lastSeen;
			emitted = events.filter((ev) => {
				const seq = Number((ev as IDataObject).seq ?? NaN);
				// An event with no usable seq cannot be deduped, so it passes
				// through — dropping it would lose data to protect against a
				// duplicate that may not exist.
				if (!Number.isFinite(seq)) return true;
				if (seq > highest) highest = seq;
				return seq > lastSeen;
			});
			if (highest > lastSeen) writeCursor(this, key, String(highest));
		}

		if (emitted.length === 0) {
			// Nothing new: acknowledge the delivery so loomcycle advances its own
			// cursor, but start no execution.
			return { noWebhookResponse: false, workflowData: [] };
		}

		const items: INodeExecutionData[] =
			emitMode === 'perBatch'
				? [{ json: body }]
				: emitted.map((ev) => ({ json: ev as IDataObject }));

		return { workflowData: [items] };
	}
}

/**
 * Constant-time comparison of two hex digests. Length is compared first because
 * `timingSafeEqual` throws on a length mismatch, and an attacker learns nothing
 * from the length of a hex digest they already know the format of.
 */
function signaturesMatch(provided: string, expected: string): boolean {
	const a = Buffer.from(provided, 'utf8');
	const b = Buffer.from(expected, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Pull the event array out of a delivered batch.
 *
 * The wire shape is a batch, but the exact envelope key is not something to
 * hard-code a single guess at: accept the common wrappers, and fall back to
 * treating the whole body as one event so a shape change degrades to
 * pass-through rather than to silently emitting nothing.
 */
function extractEvents(body: IDataObject): unknown[] {
	for (const key of ['events', 'changes', 'items']) {
		const value = body[key];
		if (Array.isArray(value)) return value;
	}
	if (Array.isArray(body)) return body as unknown[];
	return [body];
}
