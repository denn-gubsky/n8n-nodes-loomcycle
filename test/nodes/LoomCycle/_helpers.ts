import type { IExecuteFunctions, ILoadOptionsFunctions, INode } from 'n8n-workflow';
import { vi } from 'vitest';
import type { AgentEvent } from '@loomcycle/client';

/**
 * Shared fixtures for LoomCycle node tests.
 *
 * The umbrella `@loomcycle/client` module is mocked at test-module load
 * time via vi.mock(...) in each test file (the call must live there
 * because vi.mock is hoisted per-file). The MOCK_CLIENT instance
 * exported below is the shared backing object the mock returns; tests
 * configure its method-level vi.fn() mocks before invoking execute().
 */

export type MockClient = {
	runStreaming: ReturnType<typeof vi.fn>;
	continueSession: ReturnType<typeof vi.fn>;
	getAgent: ReturnType<typeof vi.fn>;
	cancelAgent: ReturnType<typeof vi.fn>;
	listUserAgents: ReturnType<typeof vi.fn>;
	listMemoryScopes: ReturnType<typeof vi.fn>;
	listMemoryScopeIDs: ReturnType<typeof vi.fn>;
	listMemoryEntries: ReturnType<typeof vi.fn>;
	getMemoryEntry: ReturnType<typeof vi.fn>;
	listChannels: ReturnType<typeof vi.fn>;
	publishChannel: ReturnType<typeof vi.fn>;
	subscribeChannel: ReturnType<typeof vi.fn>;
	peekChannel: ReturnType<typeof vi.fn>;
	ackChannel: ReturnType<typeof vi.fn>;
	health: ReturnType<typeof vi.fn>;
};

export function createMockClient(): MockClient {
	return {
		runStreaming: vi.fn(),
		continueSession: vi.fn(),
		getAgent: vi.fn(),
		cancelAgent: vi.fn(),
		listUserAgents: vi.fn(),
		listMemoryScopes: vi.fn(),
		listMemoryScopeIDs: vi.fn(),
		listMemoryEntries: vi.fn(),
		getMemoryEntry: vi.fn(),
		listChannels: vi.fn(),
		publishChannel: vi.fn(),
		subscribeChannel: vi.fn(),
		peekChannel: vi.fn(),
		ackChannel: vi.fn(),
		health: vi.fn(),
	};
}

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
