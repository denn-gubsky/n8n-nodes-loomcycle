import type { AgentEvent, Usage } from '@loomcycle/client';

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
}

/**
 * Drain an async-iterable of AgentEvents into a structured summary.
 *
 * `event: error` frames (or any frame with `is_error: true`) cause the
 * function to throw — the action node's `wrapLoomcycleError` catches and
 * surfaces them as NodeApiError. Other event types fold into the compact
 * summary returned.
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
		}
		if (ev.type === 'error' || ev.is_error === true) {
			errorMessage = ev.error ?? 'unknown error from loomcycle';
		}
		if (ev.type === 'awaiting_input') {
			awaitingInput = true;
			if (opts.stopOnAwaitingInput) break;
		}
	}

	if (errorMessage) {
		throw new Error(errorMessage);
	}

	return { finalText, usage, stopReason, sessionId, agentId, runId, awaitingInput };
}
