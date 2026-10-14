import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SEEN_KEY = 'hookCallSeen';

/**
 * `LoomCycle: Hook Call` — n8n as the policy behind a loomcycle hook.
 *
 * A HookDef with an http body (Hook node → Create) whose URL is this node's
 * webhook URL makes loomcycle POST every matching call here — a tool call
 * (`pre` / `post` / `post_failure`), a run starting or finishing (`agent_start`
 * / `agent_stop`, `subagent_*`), compaction, the run's end, or a channel
 * message (`channel_publish`). The workflow decides, and its answer goes back
 * as the hook's response: deny, rewrite, add context, hold for review, release.
 *
 * Signature verification fails CLOSED (loomcycle ≥ v1.113 signs deliveries of
 * a HookDef that names a signing credential). The scheme, confirmed against a
 * live v1.113 delivery: header `X-Loomcycle-Signature: t=<unix>,v1=<hex>` with
 * v1 = HMAC-SHA256(secret, t + "." + raw body). It is checked here with
 * `node:crypto` rather than the adapter's `verifyLoomcycleDelivery`, whose Web
 * Crypto lookup goes through `globalThis` — a global the n8n Cloud scanner
 * bans, so bundling it would fail verification.
 *
 * Replay protection: a delivery is accepted only inside the timestamp window,
 * and each (body delivery_id, t) pair once. loomcycle re-signs a legitimate
 * retry with a fresh t, so a retry still gets through while a captured request
 * replayed verbatim does not. The X-Loomcycle-Delivery / -Hook headers are not
 * signed and are never trusted.
 *
 * The seen pairs are pruned by AGE, not count: a pair older than the window can
 * no longer pass the timestamp check, so dropping it is safe, while a count cap
 * would let a busy hook evict a still-replayable pair. The record lives in the
 * workflow's static data, so it is exact within one n8n process; across
 * concurrent executions or queue-mode workers it is best-effort, and the
 * timestamp window is the hard bound — keep it short.
 *
 * Any refusal throws, so n8n answers with an error status and the hook's own
 * fail_mode decides what loomcycle does with the call.
 */
export class LoomCycleHookCall implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LoomCycle: Hook Call',
		name: 'loomCycleHookCall',
		icon: 'file:LoomCycleHookCall.svg',
		group: ['trigger'],
		version: 1,
		description: 'Answers a loomcycle hook: decide on tool calls, runs and channel messages in a workflow',
		defaults: { name: 'LoomCycle: Hook Call' },
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'loomCycleSecretApi',
				required: true,
				displayOptions: { show: { verifySignature: [true] } },
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: '={{$parameter["respond"]}}',
				responseData: 'firstEntryJson',
				path: 'hook',
			},
		],
		properties: [
			{
				displayName:
					'Point a hook at this node: in the LoomCycle Hook node, Create a hook with Body "Webhook", URL = this node\'s Production URL, and Signing Credential = $cred:&lt;name&gt; of a credential you stored with the LoomCycle Credential node from the SAME LoomCycle Secret API credential selected here. Then name the hook in an agent definition, a team state or a run. Give each trigger its own secret, or list its hooks under Only These Hooks.',
				name: 'hookCallSetupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description:
					'Whether to accept only calls signed by loomcycle with the selected LoomCycle Secret API value. Turn off only on a network where nothing else can reach this URL — an unsigned hook URL lets anyone allow or deny agent actions.',
			},
			{
				displayName: 'Only These Hooks (Comma-Separated)',
				name: 'expectedHooks',
				type: 'string',
				default: '',
				placeholder: 'n8n-web-gate',
				displayOptions: { show: { verifySignature: [true] } },
				description:
					'Refuse a signed call unless its hook_name (part of what loomcycle signs) is one of these. Set it whenever this secret signs more than one hook: otherwise a call captured for one hook could be replayed to this trigger.',
			},
			{
				displayName: 'Replay Window (Seconds)',
				name: 'replayWindowSeconds',
				type: 'number',
				default: 300,
				typeOptions: { minValue: 30, maxValue: 3600 },
				displayOptions: { show: { verifySignature: [true] } },
				description: 'How old a signed call may be. Clocks on both hosts must agree to within this.',
			},
			{
				displayName: 'Respond',
				name: 'respond',
				type: 'options',
				default: 'lastNode',
				options: [
					{
						name: "With the Last Node's Output",
						value: 'lastNode',
						description: 'The first item of the last node that runs is the answer, e.g. {"decision":"deny","reason":"…"}',
					},
					{
						name: 'Using a Respond to Webhook Node',
						value: 'responseNode',
						description: 'Answer from a Respond to Webhook node anywhere in the workflow',
					},
					{
						name: 'Immediately, Allowing the Call',
						value: 'onReceived',
						description: 'Answer "allow" at once and run the workflow afterwards — for observe-only events like run_end, or for auditing',
					},
				],
				description: 'How the workflow\'s decision gets back to loomcycle',
			},
			{
				displayName:
					'Answer within the hook\'s timeout (5 s by default, at most 60 s), or the call fails and the hook\'s Fail Mode decides. Answers loomcycle understands: {} allows; pre: {"input":{…}} rewrites, {"deny":{"text":"…"}} blocks; post: {"result":{"text":"…"}} replaces, {"additional_context":"…"} adds; agent_start / subagent_*: {"decision":"deny","reason":"…"} or {"additional_context":"…"}; agent_stop: {"decision":"block","reason":"…"} keeps it working, {"decision":"hold","reason":"…"} holds it for review; channel_publish: {"decision":"release"|"drop"|"hold"}.',
				name: 'hookCallAnswerNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const node = this.getNode();
		const verify = this.getNodeParameter('verifySignature', true) as boolean;
		const respond = this.getNodeParameter('respond', 'lastNode') as string;
		const headers = this.getHeaderData() as Record<string, string | string[] | undefined>;

		let signedAt: string | undefined;
		let signedBody: IDataObject | undefined;
		if (verify) {
			const credentials = await this.getCredentials('loomCycleSecretApi');
			const secret = typeof credentials.value === 'string' ? credentials.value : '';
			if (!secret) {
				throw new NodeOperationError(node, 'The LoomCycle Secret API credential has no value, so the call cannot be authenticated. Refusing it.');
			}

			// Verify over the EXACT bytes loomcycle signed; re-serialising the
			// parsed body would change key order and whitespace.
			const req = this.getRequestObject();
			if (typeof req.readRawBody === 'function') await req.readRawBody();
			const raw = req.rawBody;
			if (!raw || raw.length === 0) {
				throw new NodeOperationError(node, 'Could not read the raw request body, so the signature cannot be checked. Refusing the call.');
			}

			const header = firstHeader(headers['x-loomcycle-signature']);
			const parsed = parseSignatureHeader(header);
			if (!parsed) {
				throw new NodeOperationError(
					node,
					'The call carried no valid X-Loomcycle-Signature. Give the HookDef a Signing Credential, or turn off Verify Signature on a closed network.',
				);
			}

			const windowSeconds = this.getNodeParameter('replayWindowSeconds', 300) as number;
			const age = Math.abs(Date.now() / 1000 - Number(parsed.t));
			if (!Number.isFinite(age) || age > windowSeconds) {
				throw new NodeOperationError(node, `The signed call is ${Math.round(age)} s old, outside the ${windowSeconds} s replay window. Check both hosts' clocks.`);
			}

			const expected = createHmac('sha256', secret).update(parsed.t + '.').update(raw).digest('hex');
			if (!parsed.v1.some((candidate) => hexEqual(candidate, expected))) {
				throw new NodeOperationError(
					node,
					'X-Loomcycle-Signature did not match. The LoomCycle Secret API value here must be the value stored in loomcycle under the HookDef\'s signing credential.',
				);
			}
			signedAt = parsed.t;
			// What the workflow sees must be exactly what loomcycle signed, so it
			// is parsed from those bytes, not from n8n's separately parsed body.
			signedBody = parseSignedBody(raw);
			if (!signedBody) {
				throw new NodeOperationError(node, 'The signed body is not a JSON object. Refusing the call.');
			}
			// The signature does not name the endpoint, only the body: bind this
			// trigger to the hooks it serves via the signed hook_name.
			const servedHooks = parseList(this.getNodeParameter('expectedHooks', '') as string);
			const hookName = typeof signedBody.hook_name === 'string' ? signedBody.hook_name : '';
			if (servedHooks.length > 0 && !servedHooks.includes(hookName)) {
				throw new NodeOperationError(
					node,
					`This trigger serves ${servedHooks.join(', ')}, but the signed call is for hook "${hookName}". Refusing it.`,
				);
			}
		}

		const body = signedBody ?? (this.getBodyData() as IDataObject);
		const deliveryId = typeof body.delivery_id === 'string' ? body.delivery_id : '';
		if (signedAt !== undefined) {
			if (!deliveryId) {
				throw new NodeOperationError(node, 'A signed call without a delivery_id cannot be checked for replay. Refusing it.');
			}
			// Each (delivery_id, t) once. A retry is re-signed with a new t and
			// passes; the same captured request replayed does not. The check and
			// the write run with no await between them, so two requests in one
			// process cannot both pass.
			const windowSeconds = this.getNodeParameter('replayWindowSeconds', 300) as number;
			const staticData = this.getWorkflowStaticData('node') as IDataObject;
			const seen = pruneSeen(staticData[SEEN_KEY], Date.now() / 1000 - windowSeconds);
			const key = `${deliveryId}@${signedAt}`;
			if (key in seen) {
				throw new NodeOperationError(node, `Delivery ${deliveryId} was already received with this signature. Refusing a replay.`);
			}
			seen[key] = Number(signedAt);
			staticData[SEEN_KEY] = seen;
		}

		const response: IWebhookResponseData = { workflowData: [[{ json: body }]] };
		// An immediate answer must be a body loomcycle reads as "allow", not
		// n8n's default "Workflow was started" message.
		if (respond === 'onReceived') response.webhookResponse = {};
		return response;
	}
}

/**
 * The seen (delivery_id@t → t) record, minus every pair signed before `cutoff`:
 * such a pair already fails the timestamp window, so it cannot be replayed.
 * Bounded by the delivery rate times the window, never by evicting live pairs.
 */
function pruneSeen(raw: unknown, cutoff: number): Record<string, number> {
	const out: Record<string, number> = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [key, t] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof t === 'number' && t >= cutoff) out[key] = t;
	}
	return out;
}

function parseSignedBody(raw: Buffer): IDataObject | undefined {
	try {
		const parsed: unknown = JSON.parse(raw.toString('utf8'));
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as IDataObject) : undefined;
	} catch {
		return undefined;
	}
}

function parseList(raw: string): string[] {
	return (raw ?? '')
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

function firstHeader(value: string | string[] | undefined): string {
	return (Array.isArray(value) ? value[0] : value ?? '').trim();
}

/** `t=<unix>,v1=<hex>[,v1=<hex>…]` → its parts, or undefined when malformed. */
function parseSignatureHeader(header: string): { t: string; v1: string[] } | undefined {
	if (!header) return undefined;
	let t = '';
	const v1: string[] = [];
	for (const part of header.split(',')) {
		const at = part.indexOf('=');
		if (at < 0) continue;
		const key = part.slice(0, at).trim();
		const value = part.slice(at + 1).trim();
		if (key === 't') t = value;
		else if (key === 'v1' && value) v1.push(value);
	}
	if (!/^\d+$/.test(t) || v1.length === 0) return undefined;
	return { t, v1 };
}

/** Constant-time comparison of two hex digests (length first: timingSafeEqual throws on a mismatch). */
function hexEqual(provided: string, expected: string): boolean {
	const a = Buffer.from(provided.toLowerCase(), 'utf8');
	const b = Buffer.from(expected, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
