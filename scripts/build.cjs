// Bundle build for the n8n node package.
//
// Why a bundler instead of plain `tsc`: n8n's *verified* community-node
// guidelines forbid run-time dependencies. We deliberately route every wire
// call through `@loomcycle/client` (CLAUDE.md: sole wire-egress point), so we
// inline that package into each compiled node here rather than resolving it at
// install time. `@loomcycle/client` has zero dependencies of its own, so the
// inlined output is self-contained.
//
// The n8n-provided peers (`n8n-workflow`, `@langchain/*`, `zod`) stay EXTERNAL
// — n8n supplies them at runtime; bundling them would duplicate/clash with the
// host copies. Type-checking is handled separately by `tsc --noEmit`
// (`npm run typecheck`); esbuild only emits the runtime JS.

const esbuild = require('esbuild');
const { rmSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

function walk(dir, pred, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walk(p, pred, out);
		else if (pred(p)) out.push(p);
	}
	return out;
}

// One entry per node + credential — n8n's manifest loads each compiled file
// directly, so each must be a self-contained CJS module exporting its class.
const entryPoints = [
	...walk('nodes', (p) => p.endsWith('.node.ts')),
	...walk('credentials', (p) => p.endsWith('.credentials.ts')),
];

rmSync('dist', { recursive: true, force: true });

esbuild
	.build({
		entryPoints,
		outdir: 'dist',
		outbase: '.', // preserve nodes/<Name>/ + credentials/ layout under dist/
		bundle: true,
		platform: 'node',
		target: 'node20',
		format: 'cjs',
		// n8n-host-provided peers — never bundle these.
		external: ['n8n-workflow', 'zod', '@langchain/*'],
		// @loomcycle/client is intentionally NOT external → inlined.
		sourcemap: false,
		logLevel: 'info',
	})
	.then(() => console.log(`esbuild: bundled ${entryPoints.length} entries → dist/ (@loomcycle/client inlined)`))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
