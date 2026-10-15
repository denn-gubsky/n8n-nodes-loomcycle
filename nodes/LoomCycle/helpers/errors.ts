import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import {
	AgentIDInUseError,
	AgentNotFoundError,
	AlreadyPausingError,
	AuthError,
	BackpressureError,
	ChannelCursorRegressionError,
	InsufficientScopeError,
	InvalidArgumentError,
	LoomcycleError,
	NotFoundError,
	NotPausedError,
	PauseNotConfiguredError,
	PerUserQuotaExhaustedError,
	PromptTooLargeError,
	RateLimitedError,
	RequestTooLargeError,
	SessionBusyError,
	SessionNotFoundError,
	SnapshotNotFoundError,
	SnapshotTooLargeError,
	SnapshotVersionError,
	SubstrateToolRefusedError,
	TokenLimitExceededError,
	UnavailableError,
} from '@loomcycle/client';

import { RunFailedError } from './streaming';

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

	if (err instanceof InsufficientScopeError) {
		// The token is valid but was minted without a grant this call needs
		// (loomcycle ≥ v1.113 names it in the body). Naming the scope turns a
		// bare 403 into a one-line fix for whoever mints tokens.
		const scope = err.requiredScope;
		return new NodeApiError(node, jsonifyError(err), {
			message: scope ? `The credential's token is missing the "${scope}" scope` : 'The credential\'s token is missing a required scope',
			description: scope
				? `The token is valid but was minted without "${scope}". Ask a loomcycle operator for a token that carries it, then update the LoomCycle API credential.`
				: redactBearerFragments(err.bodyText ?? 'Ask a loomcycle operator for a token with the scope this operation needs.'),
			httpCode: '403',
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

	if (err instanceof TokenLimitExceededError) {
		// A hard token budget. Not backpressure: retrying cannot succeed until
		// the budget window rolls over or an operator raises the limit.
		const who = [err.scope, err.scopeId].filter((v) => v).join(' ');
		const usage = err.used != null && err.limit != null ? ` (${err.used} of ${err.limit} tokens` + (err.window ? ` this ${err.window})` : ')') : '';
		return new NodeApiError(node, jsonifyError(err), {
			message: `Token budget exhausted${who ? ` for ${who}` : ''}${usage}`,
			description: 'Retrying will not help. Wait for the budget window to roll over, or ask a loomcycle operator to raise the limit.',
			httpCode: '429',
		});
	}

	if (err instanceof RateLimitedError) {
		// The token's run-start rate (RFC EF). Checked before its parent class
		// so the server's Retry-After reaches the operator.
		const retryHint = err.retryAfterMs != null
			? ` Try again in about ${Math.max(1, Math.round(err.retryAfterMs / 1000))}s.`
			: ' Try again shortly.';
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Run-start rate limit reached for this token',
			description: `Too many runs were started in a short time.${retryHint}`,
			httpCode: '429',
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

	// PromptTooLargeError ⊂ RequestTooLargeError ⊂ SnapshotTooLargeError, so the
	// narrower classes are tested first; otherwise every 413 reads as a snapshot.
	if (err instanceof PromptTooLargeError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Prompt too large for the model',
			description: redactBearerFragments(err.bodyText ?? 'Shorten the input; loomcycle never truncates it to fit.'),
			httpCode: '413',
		});
	}

	if (err instanceof RequestTooLargeError) {
		return new NodeApiError(node, jsonifyError(err), {
			message: 'Request too large',
			description: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '413',
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
		// One status covers a runtime that is briefly unavailable and a feature
		// this deployment does not have at all; the body's code tells them apart.
		const missing = err.code ? UNCONFIGURED_FEATURES[err.code] : undefined;
		return new NodeApiError(node, jsonifyError(err), {
			message: missing ? `This loomcycle deployment has no ${missing}` : 'Loomcycle backend unavailable',
			description: missing
				? 'Retrying will not help. Ask a loomcycle operator to configure it.'
				: redactBearerFragments(err.bodyText ?? ''),
			httpCode: '503',
		});
	}

	if (err instanceof LoomcycleError) {
		const hint = err.code ? CODE_HINTS[err.code] : undefined;
		const body = redactBearerFragments(err.bodyText ?? '');
		return new NodeApiError(node, jsonifyError(err), {
			message: err.message || 'Loomcycle wire error',
			description: hint ? (body ? `${hint} ${body}` : hint) : body,
			httpCode: err.status !== undefined ? String(err.status) : '500',
		});
	}

	if (err instanceof RunFailedError) {
		// The run itself failed (an `error` frame). Say whether retrying can
		// help: that is the one thing an operator needs to decide next.
		const info = err.errorInfo;
		const parts: string[] = [];
		if (info?.category) parts.push(`Category: ${info.category}.`);
		if (info) parts.push(info.is_retryable ? 'Retrying may succeed.' : 'Retrying the same run will not help.');
		if (info?.description) parts.push(info.description);
		return new NodeOperationError(node, `Run failed: ${redactBearerFragments(err.message)}`, {
			...(parts.length > 0 ? { description: redactBearerFragments(parts.join(' ')) } : {}),
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
		code: err.code ?? null,
		retryable: err.retryable,
	};
}

/** 503 codes that mean "this deployment lacks the feature", by what it lacks. */
const UNCONFIGURED_FEATURES: Record<string, string> = {
	decision_not_configured: 'decision models (a decision: block in its configuration)',
	vector_unsupported: 'vector search support',
	store_unavailable: 'persistent store for this operation',
};

/**
 * Remedies for refusals that arrive as a plain LoomcycleError: each is keyed by
 * the body's machine-readable `code`, which is stable where the message is not.
 * These are the 403s a token's restrictions produce (RFC EF, loomcycle ≥ v1.112).
 */
const CODE_HINTS: Record<string, string> = {
	restricted_token:
		'This token is limited to certain agents, which also confines it to the run endpoints. Use an unrestricted token for this node.',
	agent_not_allowed: "This token may not start this agent. Pick one of the agents the token was minted for.",
	override_not_allowed:
		'The agent definition or the token forbids per-run overrides. Remove the model, tier, effort and other override fields from this run.',
};

/**
 * The fields of a wire error a workflow can branch on when the node is set to
 * continue on fail: the stable `code` and whether the same call can succeed
 * later (`retryable`), or for a failed run its `errorCategory`. Empty for errors
 * that did not come from loomcycle.
 */
export function loomcycleErrorFields(err: unknown): { code?: string; retryable?: boolean; errorCategory?: string } {
	if (err instanceof RunFailedError) {
		const info = err.errorInfo;
		if (!info) return {};
		return { retryable: info.is_retryable, ...(info.category ? { errorCategory: info.category } : {}) };
	}
	if (!(err instanceof LoomcycleError)) return {};
	return { ...(err.code ? { code: err.code } : {}), retryable: err.retryable };
}
