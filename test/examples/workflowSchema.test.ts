import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import packageJson from '../../package.json';

/**
 * Smoke-validate every example workflow JSON in `examples/`.
 *
 * These tests catch the drift cases:
 *   - a JSON file ships malformed (missing nodes/connections, wrong shape)
 *   - a workflow references a `n8n-nodes-loomcycle.*` type that isn't
 *     declared in package.json `n8n.nodes[]` (renamed, deleted)
 *   - a node's `connections` map references a node name that doesn't
 *     exist in the workflow (typo, orphan)
 *
 * The tests do NOT execute the workflows — that requires a running
 * loomcycle + n8n, which lives in `test/integration/` (skipped without
 * `LOOMCYCLE_BASE_URL` set).
 */

interface WorkflowNode {
	id?: string;
	name: string;
	type: string;
	typeVersion?: number;
	position?: [number, number];
	parameters?: Record<string, unknown>;
}

interface Workflow {
	name?: string;
	nodes: WorkflowNode[];
	connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
	active?: boolean;
	settings?: Record<string, unknown>;
}

const EXAMPLES_DIR = resolve(__dirname, '../../examples');

function listExampleFiles(): string[] {
	return readdirSync(EXAMPLES_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort();
}

function loadWorkflow(filename: string): Workflow {
	const raw = readFileSync(resolve(EXAMPLES_DIR, filename), 'utf8');
	return JSON.parse(raw) as Workflow;
}

/**
 * Set of `n8n-nodes-loomcycle.*` types this package declares in
 * package.json `n8n.nodes[]`. Examples must only reference these
 * (plus core / langchain / n8n-base types).
 */
/**
 * Returns `<package-name>` from package.json. Used as the prefix on every
 * declared node type. Reads at test time so the rename from
 * `n8n-nodes-loomcycle` → `@loomcycle/n8n-nodes-loomcycle` (or any future
 * rename) doesn't require touching this test.
 */
function packageNamePrefix(): string {
	return (packageJson as unknown as { name: string }).name;
}

function declaredLoomcycleNodeTypes(): Set<string> {
	const nodes = (packageJson as unknown as { n8n: { nodes: string[] } }).n8n.nodes;
	const prefix = packageNamePrefix();
	const out = new Set<string>();
	for (const distPath of nodes) {
		// dist/nodes/<Name>/<Name>.node.js → '<package>.<nodeId>'
		const match = distPath.match(/dist\/nodes\/([^/]+)\//);
		if (!match) continue;
		// Conform to n8n convention: first letter lowercased
		const className = match[1];
		const nodeId = className.charAt(0).toLowerCase() + className.slice(1);
		out.add(`${prefix}.${nodeId}`);
	}
	return out;
}

describe('examples/ — every workflow JSON', () => {
	const files = listExampleFiles();

	it('produces exactly 6 example workflows', () => {
		expect(files).toHaveLength(6);
	});

	for (const file of files) {
		describe(file, () => {
			let wf: Workflow;
			beforeAll(() => {
				wf = loadWorkflow(file);
			});

			it('has a name', () => {
				expect(wf.name).toBeTruthy();
			});

			it('has at least one node', () => {
				expect(Array.isArray(wf.nodes)).toBe(true);
				expect(wf.nodes.length).toBeGreaterThan(0);
			});

			it('every node has the required fields (name, type, position)', () => {
				for (const node of wf.nodes) {
					expect(node.name).toBeTruthy();
					expect(node.type).toBeTruthy();
					expect(Array.isArray(node.position)).toBe(true);
				}
			});

			it('every connection-source name references a real node', () => {
				const nodeNames = new Set(wf.nodes.map((n) => n.name));
				for (const sourceName of Object.keys(wf.connections ?? {})) {
					expect(nodeNames.has(sourceName)).toBe(true);
				}
			});

			it('every connection-target name references a real node', () => {
				const nodeNames = new Set(wf.nodes.map((n) => n.name));
				for (const sourceEntries of Object.values(wf.connections ?? {})) {
					for (const connectionType of Object.values(sourceEntries)) {
						for (const branch of connectionType) {
							for (const target of branch) {
								expect(nodeNames.has(target.node)).toBe(true);
							}
						}
					}
				}
			});

			it('every loomcycle node type is declared in package.json n8n.nodes[]', () => {
				const declared = declaredLoomcycleNodeTypes();
				const prefix = `${packageNamePrefix()}.`;
				for (const node of wf.nodes) {
					if (!node.type.startsWith(prefix)) continue;
					expect(declared.has(node.type)).toBe(true);
				}
			});
		});
	}
});

