import type { AgentEvent, ErrorInfo, LimitInfo, Usage } from '@loomcycle/client';

/**
 * Result of draining a runStreaming() iterable into a single n8n output.
 *
 * Action nodes block their execute() until the run completes — long runs
 * are better expressed via the LoomCycleRunCompleted trigger (Sub-phase
 * 2.3). This shape is what the action node returns to downstream nodes.
 *
 * **No `events` array.** Long agent runs can emit thousands of frames;
 * bundling them all into the result inflates n8n's execution-record
 * storage and risks running the worker out of memory under bulk input.
 * Downstream nodes that need event-level visibility should consume the
 * SSE stream directly via the LoomCycleRunCompleted trigger.
 */
export interface RunDrainResult {
	finalText: string;
	usage?: Usage;
	stopReason?: string;
	sessionId?: string;
	agentId?: string;
	runId?: string;
	/**
	 * True when the run parked at `end_turn` awaiting operator input (RFC AI
	 * interactive runs). Set only when {@link drainRunStream} was asked to
	 * stop on the `awaiting_input` frame — see `stopOnAwaitingInput`.
	 */
	awaitingInput?: boolean;
	/**
	 * Token-budget crossings the substrate reported during this run (RFC AW,
	 * loomcycle ≥ v1.11). A `severity: "soft"` entry is a warning and the run
	 * continues; `"hard"` means the NEXT run is refused at admission. Collected
	 * as an array because more than one can fire — a soft warning at run start
	 * and a further crossing mid-run are separate frames.
	 *
	 * Present only when at least one `limit` frame arrived, so a workflow can
	 * branch on its existence rather than comparing counts.
	 */
	limits?: LimitInfo[];
	/**
	 * Set when the run finished an answer and is HELD for an operator's verdict
	 * (`review: true`, or an agent_stop hook that answered "hold"; loomcycle ≥
	 * v1.93). The run detaches and waits; approve or reject it with Run → Review
	 * before `expiresAt`, after which it ends `rejected`.
	 */
	awaitingReview?: { expiresAt?: string; round?: number; heldBy?: string };
	/**
	 * True when the spawn's idempotency key was already held: nothing new
	 * started, and this result is the existing run's (loomcycle ≥ v1.106).
	 */
	deduplicated?: boolean;
}

/**
 * A run that ended in an `error` frame. Carries the substrate's classification
 * (`error_info`, RFC DA) so the error shown in n8n says whether retrying can
 * help, and continue-on-fail output can branch on it. `errorInfo` is absent for
 * a failure the runtime did not classify — never read that as "not retryable
 * for a known reason".
 */
export class RunFailedError extends Error {
	readonly errorInfo?: ErrorInfo;
	constructor(message: string, errorInfo?: ErrorInfo) {
		super(message);
		this.name = 'RunFailedError';
		this.errorInfo = errorInfo;
	}
}

/**
 * Drain an async-iterable of AgentEvents into a structured summary.
 *
 * `event: error` frames (or any frame with `is_error: true`) cause the
 * function to throw a {@link RunFailedError} — the action node's
 * `wrapLoomcycleError` catches and surfaces it. Other event types fold into the
 * compact summary returned.
 *
 * An `awaiting_review` frame always ends the drain: the run is held for a
 * verdict nobody inside this execution can give, and the substrate detaches a
 * held run from its stream, so waiting on would block the node until the hold
 * expires.
 *
 * `stopOnAwaitingInput` (RFC AI): an interactive run parks at `end_turn` and
 * its stream stays open indefinitely awaiting the next operator turn — a plain
 * drain would block forever. With this flag set, the loop breaks on the first
 * `awaiting_input` frame and returns what it has so far (run_id / agent_id /
 * session_id are emitted earlier in the stream), with `awaitingInput: true`.
 * Breaking the `for await` closes the underlying SSE iterator; the run keeps
 * running on the substrate, to be steered later via `sendRunInput`.
 */
export async function drainRunStream(
	stream: AsyncIterable<AgentEvent>,
	opts: { stopOnAwaitingInput?: boolean } = {},
): Promise<RunDrainResult> {
	let finalText = '';
	let usage: Usage | undefined;
	let stopReason: string | undefined;
	let sessionId: string | undefined;
	let agentId: string | undefined;
	let runId: string | undefined;
	let awaitingInput: boolean | undefined;
	let errorMessage: string | undefined;
	let errorInfo: ErrorInfo | undefined;
	let awaitingReview: RunDrainResult['awaitingReview'];
	let deduplicated: boolean | undefined;
	const limits: LimitInfo[] = [];

	for await (const ev of stream) {
		if (ev.type === 'text' && typeof ev.text === 'string') {
			finalText += ev.text;
		}
		if (ev.type === 'usage' && ev.usage) {
			usage = ev.usage;
		}
		if (ev.type === 'done' && ev.stop_reason) {
			stopReason = ev.stop_reason;
		}
		if (ev.type === 'session' && ev.session_id) {
			sessionId = ev.session_id;
		}
		if (ev.type === 'agent') {
			if (ev.agent_id) agentId = ev.agent_id;
			if (ev.run_id) runId = ev.run_id;
			if (ev.deduplicated === true) deduplicated = true;
		}
		if (ev.type === 'error' || ev.is_error === true) {
			errorMessage = ev.error ?? 'unknown error from loomcycle';
			if (ev.error_info) errorInfo = ev.error_info;
		}
		if (ev.type === 'limit' && ev.limit) {
			limits.push(ev.limit);
		}
		if (ev.type === 'awaiting_input') {
			awaitingInput = true;
			if (opts.stopOnAwaitingInput) break;
		}
		if (ev.type === 'awaiting_review') {
			const hold = ev.awaiting_review ?? {};
			awaitingReview = {
				...(hold.expires_at ? { expiresAt: hold.expires_at } : {}),
				...(typeof hold.round === 'number' ? { round: hold.round } : {}),
				...(hold.held_by ? { heldBy: hold.held_by } : {}),
			};
			break;
		}
	}

	if (errorMessage) {
		throw new RunFailedError(errorMessage, errorInfo);
	}

	return {
		finalText,
		usage,
		stopReason,
		sessionId,
		agentId,
		runId,
		awaitingInput,
		...(limits.length > 0 ? { limits } : {}),
		...(awaitingReview ? { awaitingReview } : {}),
		...(deduplicated ? { deduplicated } : {}),
	};
}
