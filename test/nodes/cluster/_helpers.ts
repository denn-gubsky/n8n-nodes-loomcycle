import type {
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	INodeType,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { vi } from 'vitest';

/**
 * Wrap the awkward typed `node.supplyData!.call(ctx, 0)` invocation —
 * TypeScript's optional-method narrowing on INodeType strips the
 * itemIndex parameter when accessed via `node.supplyData!`. The cast
 * is contained to this one helper.
 */
export function invokeSupplyData(node: INodeType, ctx: ISupplyDataFunctions, itemIndex = 0): Promise<SupplyData> {
	// The cast is required: TypeScript narrows `node.supplyData!` to a
	// 0-arity callable here despite the interface signature taking
	// itemIndex. Contained to this one helper so test sites stay clean.
	return (node.supplyData as unknown as (this: ISupplyDataFunctions, i: number) => Promise<SupplyData>).call(
		ctx,
		itemIndex,
	);
}

/**
 * Build a minimal `ISupplyDataFunctions` fixture for cluster-sub-node
 * tests. Captures the parameters + credentials map; surfaces them
 * through the methods the sub-node touches (`getNodeParameter`,
 * `getCredentials`, `getNode`, `logger`).
 */
export function makeSupplyDataContext(opts: {
	params: Record<string, unknown>;
	credentials?: Record<string, unknown>;
}): ISupplyDataFunctions {
	const credentials: Record<string, unknown> = {
		baseUrl: 'http://127.0.0.1:8787',
		bearerToken: 'test-token',
		userId: '',
		userTier: '',
		mcpUrl: '',
		...(opts.credentials ?? {}),
	};
	const node: INode = {
		id: 'test-cluster-node',
		name: 'Cluster Test',
		type: 'n8n-nodes-loomcycle.loomCycleClusterTool',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	return {
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getCredentials: async () => credentials,
		getNode: () => node,
		continueOnFail: () => false,
		logger,
		helpers: {},
	} as unknown as ISupplyDataFunctions;
}

/**
 * Build a minimal `IExecuteFunctions` fixture for cluster-sub-node
 * execute() tests (n8n Tools Agent invocation path, v1.82+).
 *
 * `inputJson` becomes the single input item — emulates the AI Agent
 * passing the LLM's tool-call args into the node's getInputData().
 */
export function makeExecuteContext(opts: {
	params: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	inputJson: Record<string, unknown>;
}): IExecuteFunctions {
	const credentials: Record<string, unknown> = {
		baseUrl: 'http://127.0.0.1:8787',
		bearerToken: 'test-token',
		userId: '',
		userTier: '',
		mcpUrl: '',
		...(opts.credentials ?? {}),
	};
	const node: INode = {
		id: 'test-cluster-node',
		name: 'Cluster Test',
		type: 'n8n-nodes-loomcycle.loomCycleClusterTool',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	const inputs: INodeExecutionData[] = [{ json: opts.inputJson }];
	return {
		getInputData: () => inputs,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getCredentials: async () => credentials,
		getNode: () => node,
		continueOnFail: () => false,
		logger,
		helpers: {},
	} as unknown as IExecuteFunctions;
}

export function invokeExecute(node: INodeType, ctx: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	return (node.execute as unknown as (this: IExecuteFunctions) => Promise<INodeExecutionData[][]>).call(ctx);
}
