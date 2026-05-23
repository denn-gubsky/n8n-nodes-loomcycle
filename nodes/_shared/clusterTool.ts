import { DynamicStructuredTool } from '@langchain/core/tools';
import type { z } from 'zod';
import { redactBearerFragments } from '../LoomCycle/helpers/errors';

/**
 * Build a LangChain `DynamicStructuredTool` with our standard error
 * envelope. Every cluster sub-node uses this helper so the wire surface
 * to the parent AI Agent is uniform.
 *
 * The returned tool's `func` always resolves to a string (LangChain
 * contract). We JSON-stringify structured results; thrown wire errors
 * are caught + redacted + returned as a `{"error": "..."}` string so
 * the agent can read the failure mode without us leaking bearer
 * fragments into the model's context (CLAUDE.md §security.6).
 */
export function buildTool<S extends z.ZodTypeAny>(opts: {
	name: string;
	description: string;
	schema: S;
	fn: (args: z.infer<S>) => Promise<unknown>;
}): DynamicStructuredTool {
	return new DynamicStructuredTool({
		name: opts.name,
		description: opts.description,
		schema: opts.schema,
		func: async (args: z.infer<S>): Promise<string> => {
			try {
				const result = await opts.fn(args);
				if (typeof result === 'string') return result;
				return JSON.stringify(result);
			} catch (err) {
				const message = redactBearerFragments((err as Error).message ?? 'unknown loomcycle error');
				return JSON.stringify({ error: message });
			}
		},
	});
}
