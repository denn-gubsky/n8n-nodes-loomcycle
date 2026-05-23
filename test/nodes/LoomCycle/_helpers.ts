import type { IExecuteFunctions, ILoadOptionsFunctions, INode } from 'n8n-workflow';
import type { AgentEvent } from '@loomcycle/client';

/**
 * Shared fixtures for LoomCycle node tests.
 *
 * NOTE: The mock LoomcycleClient shape is duplicated inline in each test
 * file (inside a `vi.hoisted()` block) because `vi.mock(...)` calls are
 * auto-hoisted ABOVE imports — so the mock has to be created at hoist
 * time, before any cross-file factory could run. A shared
 * `createMockClient()` here would only be reachable AFTER imports, which
 * is too late. Each test file owns its own `mockClient` literal.
 *
 * This file exports the cross-test fixtures that DON'T depend on
 * hoisting: makeExecuteContext, makeLoadOptionsContext, asAsyncIterable,
 * fakeSuccessfulRunEvents.
 */

interface ExecuteContextOptions {
	params: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	continueOnFail?: boolean;
	inputData?: Array<{ json: Record<string, unknown> }>;
}

export function makeExecuteContext(opts: ExecuteContextOptions): IExecuteFunctions {
	const credentials: Record<string, unknown> = {
		baseUrl: 'http://127.0.0.1:8787',
		bearerToken: 'test-token',
		userId: '',
		userTier: '',
		mcpUrl: '',
		...(opts.credentials ?? {}),
	};
	const inputData = opts.inputData ?? [{ json: {} }];
	const node: INode = {
		id: 'test-node',
		name: 'LoomCycle Test',
		type: 'n8n-nodes-loomcycle.loomCycle',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	return {
		getInputData: () => inputData,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getCredentials: async () => credentials,
		getNode: () => node,
		continueOnFail: () => opts.continueOnFail ?? false,
		helpers: {
			returnJsonArray: (items: unknown[]) => items,
		},
	} as unknown as IExecuteFunctions;
}

export function makeLoadOptionsContext(opts: {
	credentials?: Record<string, unknown>;
}): ILoadOptionsFunctions {
	const credentials: Record<string, unknown> = {
		baseUrl: 'http://127.0.0.1:8787',
		bearerToken: 'test-token',
		userId: '',
		userTier: '',
		mcpUrl: '',
		...(opts.credentials ?? {}),
	};
	return {
		getCredentials: async () => credentials,
		getCurrentNodeParameter: () => undefined,
		getNodeParameter: () => undefined,
	} as unknown as ILoadOptionsFunctions;
}

/**
 * Make an async-iterable from a static array of events — used to fake
 * the runStreaming() return value.
 */
export function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) {
				yield item;
			}
		},
	};
}

/**
 * Convenience: build a list of AgentEvents that mimics a successful
 * run from session → agent → text → done.
 */
export function fakeSuccessfulRunEvents(opts: {
	sessionId?: string;
	agentId?: string;
	runId?: string;
	text?: string;
	stopReason?: string;
}): AgentEvent[] {
	const events: AgentEvent[] = [];
	if (opts.sessionId) events.push({ type: 'session', session_id: opts.sessionId } as AgentEvent);
	if (opts.agentId || opts.runId) {
		events.push({
			type: 'agent',
			agent_id: opts.agentId,
			run_id: opts.runId,
		} as AgentEvent);
	}
	events.push({ type: 'started' } as AgentEvent);
	if (opts.text) {
		events.push({ type: 'text', text: opts.text } as AgentEvent);
	}
	events.push({ type: 'done', stop_reason: opts.stopReason ?? 'end_turn' } as AgentEvent);
	return events;
}
