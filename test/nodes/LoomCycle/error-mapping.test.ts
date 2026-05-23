import { describe, it, expect } from 'vitest';
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
	SessionBusyError,
	SessionNotFoundError,
	SnapshotNotFoundError,
	SnapshotTooLargeError,
	SnapshotVersionError,
	SubstrateToolRefusedError,
	UnavailableError,
} from '@loomcycle/client';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

import { redactBearerFragments, wrapLoomcycleError } from '../../../nodes/LoomCycle/helpers/errors';

const NODE: INode = {
	id: 'n',
	name: 'LoomCycle Test',
	type: 'n8n-nodes-loomcycle.loomCycle',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function makeLoomcycleError<T extends LoomcycleError>(
	Ctor: new (msg: string, opts?: { status?: number; bodyText?: string }) => T,
	msg: string,
	status?: number,
	body?: string,
): T {
	return new Ctor(msg, { status, bodyText: body });
}

describe('redactBearerFragments', () => {
	it('redacts Authorization: Bearer <token> headers', () => {
		const input = 'Server log: Authorization: Bearer sk-abcdefghijk-12345';
		expect(redactBearerFragments(input)).toBe('Server log: Authorization: Bearer [REDACTED]');
	});

	it('redacts bare Bearer <token> substrings (8+ char tokens only)', () => {
		const input = 'Refused Bearer abc-123-very-long-token-here';
		expect(redactBearerFragments(input)).toBe('Refused Bearer [REDACTED]');
	});

	it('does not redact the literal word "Bearer" without a token', () => {
		const input = 'See Bearer for details';
		expect(redactBearerFragments(input)).toBe('See Bearer for details');
	});

	it('redacts sk- / ant- / lck- style API-key fragments', () => {
		expect(redactBearerFragments('key=sk-abcdefghijkl1234')).toBe('key=[REDACTED]');
		expect(redactBearerFragments('key=ant-1234567890abcd')).toBe('key=[REDACTED]');
		expect(redactBearerFragments('key=lck-1234567890abcd')).toBe('key=[REDACTED]');
	});

	it('returns empty/short input unchanged', () => {
		expect(redactBearerFragments('')).toBe('');
		expect(redactBearerFragments('no secrets here')).toBe('no secrets here');
	});
});

describe('wrapLoomcycleError', () => {
	it('maps AuthError → NodeApiError with httpCode 401', () => {
		const err = makeLoomcycleError(AuthError, 'unauthorized', 401, 'bad token');
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('401');
		expect((wrapped as NodeApiError).message).toContain('Authentication failed');
	});

	it('maps AgentNotFoundError → NodeApiError 404', () => {
		const err = makeLoomcycleError(AgentNotFoundError, 'not found', 404, 'agent_id=foo not found');
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('404');
	});

	it('maps SessionNotFoundError → NodeApiError 404', () => {
		const err = makeLoomcycleError(SessionNotFoundError, 'not found', 404, 'session not found');
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('404');
	});

	it('maps SnapshotNotFoundError + HookNotFoundError + generic NotFoundError → 404', () => {
		expect(
			(wrapLoomcycleError(makeLoomcycleError(SnapshotNotFoundError, 'x', 404), NODE) as NodeApiError).httpCode,
		).toBe('404');
		expect(
			(wrapLoomcycleError(makeLoomcycleError(HookNotFoundError, 'x', 404), NODE) as NodeApiError).httpCode,
		).toBe('404');
		expect((wrapLoomcycleError(makeLoomcycleError(NotFoundError, 'x', 404), NODE) as NodeApiError).httpCode).toBe(
			'404',
		);
	});

	it('maps InvalidArgumentError → NodeApiError 400', () => {
		const err = makeLoomcycleError(InvalidArgumentError, 'bad input', 400);
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('400');
	});

	it('maps SubstrateToolRefusedError → NodeApiError 422 with tool name in description', () => {
		const err = new SubstrateToolRefusedError('refused', { status: 422, bodyText: 'scope deny', tool: 'AgentDef' });
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).message).toContain('AgentDef');
	});

	it('maps BackpressureError → 429', () => {
		const wrapped = wrapLoomcycleError(makeLoomcycleError(BackpressureError, 'busy', 429), NODE);
		expect((wrapped as NodeApiError).httpCode).toBe('429');
	});

	it('maps ChannelCursorRegressionError → NodeApiError 409 with re-fetch hint', () => {
		const err = makeLoomcycleError(ChannelCursorRegressionError, 'cursor regression', 409);
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('409');
		expect((wrapped as NodeApiError).message).toContain('cursor regression');
	});

	it('maps AlreadyPausingError + NotPausedError + SessionBusyError + AgentIDInUseError → 409', () => {
		const cases = [
			makeLoomcycleError(AlreadyPausingError, 'x'),
			makeLoomcycleError(NotPausedError, 'x'),
			makeLoomcycleError(SessionBusyError, 'x'),
			makeLoomcycleError(AgentIDInUseError, 'x'),
		];
		for (const err of cases) {
			expect((wrapLoomcycleError(err, NODE) as NodeApiError).httpCode).toBe('409');
		}
	});

	it('maps PauseNotConfiguredError → 503', () => {
		const wrapped = wrapLoomcycleError(
			makeLoomcycleError(PauseNotConfiguredError, 'pause manager not configured', 503),
			NODE,
		);
		expect((wrapped as NodeApiError).httpCode).toBe('503');
	});

	it('maps SnapshotTooLargeError → 413, SnapshotVersionError → 422', () => {
		expect(
			(wrapLoomcycleError(makeLoomcycleError(SnapshotTooLargeError, 'too big', 413), NODE) as NodeApiError)
				.httpCode,
		).toBe('413');
		expect(
			(wrapLoomcycleError(makeLoomcycleError(SnapshotVersionError, 'version', 422), NODE) as NodeApiError).httpCode,
		).toBe('422');
	});

	it('maps UnavailableError → 503', () => {
		const wrapped = wrapLoomcycleError(makeLoomcycleError(UnavailableError, 'down', 503), NODE);
		expect((wrapped as NodeApiError).httpCode).toBe('503');
	});

	it('maps generic LoomcycleError → NodeApiError preserving status code', () => {
		const err = makeLoomcycleError(LoomcycleError, 'something broke', 502, '');
		const wrapped = wrapLoomcycleError(err, NODE);
		expect(wrapped).toBeInstanceOf(NodeApiError);
		expect((wrapped as NodeApiError).httpCode).toBe('502');
	});

	it('maps native Error → NodeOperationError', () => {
		const wrapped = wrapLoomcycleError(new Error('whoops'), NODE);
		expect(wrapped).toBeInstanceOf(NodeOperationError);
	});

	it('maps non-Error value → NodeOperationError with generic message', () => {
		const wrapped = wrapLoomcycleError('string-thrown', NODE);
		expect(wrapped).toBeInstanceOf(NodeOperationError);
	});

	it('SECURITY — redacts Authorization: Bearer leak from bodyText into description', () => {
		const err = makeLoomcycleError(
			LoomcycleError,
			'wire error',
			500,
			'echoed back: Authorization: Bearer sk-supersecret-token-12345',
		);
		const wrapped = wrapLoomcycleError(err, NODE) as NodeApiError & { description?: string };
		// NodeApiError exposes `description` as a public-readable field.
		expect(wrapped.description ?? '').not.toContain('sk-supersecret-token-12345');
		expect(wrapped.description ?? '').toContain('[REDACTED]');
	});

	it('SECURITY — bearer fragments are scrubbed before reaching the wrapped error', () => {
		// Defence-in-depth: even when bodyText is the raw header form,
		// the wrap function never lets the raw token survive in any
		// surface that the description-rendering UI reads.
		const err = makeLoomcycleError(
			AuthError,
			'unauthorized',
			401,
			'Authorization: Bearer leaked-token-abcdefghij-9999',
		);
		const wrapped = wrapLoomcycleError(err, NODE) as NodeApiError & { description?: string };
		expect(wrapped.description ?? '').not.toContain('leaked-token-abcdefghij-9999');
	});
});
