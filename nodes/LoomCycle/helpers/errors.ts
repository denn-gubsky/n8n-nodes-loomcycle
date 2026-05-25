import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import {
	AgentIDInUseError,
	AgentNotFoundError,
	AlreadyPausingError,
	AuthError,
	BackpressureError,
	ChannelCursorRegressionError,
	HookNotFoundError,
	InvalidArgumentError,
	LoomcycleError,
	NotFoundError,
	NotPausedError,
	PauseNotConfiguredError,
	PerUserQuotaExhaustedError,
	SessionBusyError,
	SessionNotFoundError,
	SnapshotNotFoundError,
	SnapshotTooLargeError,
	SnapshotVersionError,
	SubstrateToolRefusedError,
	UnavailableError,
} from '@loomcycle/client';

/**
 * Redact anything that LOOKS like a bearer token from a body string before
 * surfacing it in NodeApiError.description (which renders in the n8n
 * execution-log UI). CLAUDE.md §security.6: the bearer never leaks.
 *
 * Patterns covered:
 *  - `Authorization: Bearer <token>` (case-insensitive)
 *  - bare `Bearer <token>` substrings
 *  - sk-* / lck-* / ant- style API-key-like tokens (best-effort defence in
 *    depth; loomcycle bearers don't match these but operators may set
 *    bearer values that do)
 */
export function redactBearerFragments(body: string): string {
	if (!body) return body;
	return body
		.replace(/Authorization\s*:\s*Bearer\s+[\w.~+/=-]+/gi, 'Authorization: Bearer [REDACTED]')
		.replace(/Bearer\s+[\w.~+/=-]{8,}/gi, 'Bearer [REDACTED]')
		.replace(/\b(?:sk|lck|ant|sk-ant|sk-proj)-[\w-]{12,}/gi, '[REDACTED]');
}

/**
 * Map a `@loomcycle/client` typed error onto an n8n-flavoured error that
 * renders well in the editor UI. The mapping is intentionally broad — every
 * downstream wire call funnels through this single function so the
 * credential-boundary-redaction rule lives in one place.
 *
 * Non-loomcycle errors pass through unchanged.
 */
export function wrapLoomcycleError(err: unknown, node: INode): Error {
	if (err instanceof AuthError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Authentication failed',
			description: 'The bearer token in the LoomCycle API credential was rejected. Check Settings → Credentials.',
			httpCode: '401',
		});
	}

	if (err instanceof AgentNotFoundError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Agent not found',
			description: redactBearerFragments(err.bodyText ?? 'The agent_id was not found on this loomcycle deployment.'),
			httpCode: '404',
		});
	}

	if (err instanceof SessionNotFoundError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Session not found',
			description: redactBearerFragments(err.bodyText ?? 'The session_id was not found.'),
			httpCode: '404',
		});
	}

	if (err instanceof SnapshotNotFoundError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Snapshot not found',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '404',
		});
	}

	if (err instanceof HookNotFoundError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Hook not found',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '404',
		});
	}

	if (err instanceof NotFoundError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Resource not found',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '404',
		});
	}

	if (err instanceof InvalidArgumentError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Invalid argument',
			description: redactBearerFragments(err.bodyText ?? err.message),
			httpCode: '400',
		});
	}

	if (err instanceof SubstrateToolRefusedError) {
		const tool = err.tool ? `${err.tool} ` : '';
		return new NodeApiError(node, jsonifyError(err), {
			message: `Substrate ${tool}refused the operation`,
			description: redactBearerFragments(err.bodyText ?? err.message),
			httpCode: '422',
		});
	}

	if (err instanceof BackpressureError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Backpressure — too many in-flight requests',
			description: redactBearerFragments(err.bodyText ?? 'Retry with backoff.'),
			httpCode: '429',
		});
	}

	if (err instanceof PerUserQuotaExhaustedError) {
		// Sibling-of-BackpressureError 429; distinct semantic (per-user
		// cap, not global queue saturation). Surface the user_id + cap
		// in the description so operators can see WHICH user hit the
		// limit without having to dig through the raw response body.
		const userId = err.userId ?? 'unknown';
		const cap = err.cap ?? 'unknown';
		const retryHint = err.retryAfterMs != null
			? ` Server suggests retrying after ~${Math.round(err.retryAfterMs / 1000)}s.`
			: '';
		return new NodeApiError(node, jsonifyError(err), {
			message: `Per-user quota exhausted for user ${userId} (cap=${cap})`,
			description: redactBearerFragments(err.bodyText ?? `The per-user run cap has been hit.${retryHint}`),
			httpCode: '429',
		});
	}

	if (err instanceof AlreadyPausingError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Runtime is already pausing or paused',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '409',
		});
	}

	if (err instanceof ChannelCursorRegressionError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Channel cursor regression — supplied cursor is older than the committed cursor',
			description: redactBearerFragments(
				err.bodyText ?? 'Re-fetch the channel\'s current committed cursor via subscribeChannel and retry the Ack.',
			),
			httpCode: '409',
		});
	}

	if (err instanceof NotPausedError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Runtime is not paused',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '409',
		});
	}

	if (err instanceof PauseNotConfiguredError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Pause subsystem is not configured on this loomcycle deployment',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '503',
		});
	}

	if (err instanceof SnapshotTooLargeError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Snapshot too large for this operation',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '413',
		});
	}

	if (err instanceof SnapshotVersionError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Snapshot envelope version mismatch',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '422',
		});
	}

	if (err instanceof SessionBusyError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Session is busy',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '409',
		});
	}

	if (err instanceof AgentIDInUseError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'agent_id is already in use',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '409',
		});
	}

	if (err instanceof UnavailableError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Loomcycle backend unavailable',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '503',
		});
	}

	if (err instanceof LoomcycleError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: err.message || 'Loomcycle wire error',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: err.status !== undefined ? String(err.status) : '500',
		});
	}

	if (err instanceof Error) {
		return new NodeOperationError(node, err.message);
	}

	return new NodeOperationError(node, 'Unknown error from loomcycle');
}

/**
 * Coerce a LoomcycleError-shaped object into the JsonObject that
 * NodeApiError expects in its second positional argument. The wire
 * adapter's typed errors are real Error subclasses; n8n wants a plain
 * object. Manual shape — we don't pass the original error instance
 * because NodeApiError may serialise it and leak fields.
 */
function jsonifyError(err: LoomcycleError): JsonObject {
	return {
		name: err.constructor.name,
		message: err.message,
		status: err.status ?? null,
	};
}
