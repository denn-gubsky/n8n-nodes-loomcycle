import type { IExecuteFunctions, ILoadOptionsFunctions, ITriggerFunctions, ISupplyDataFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getClient } from './client';

/**
 * Loomcycle-version gating for ops that depend on a substrate-side
 * feature shipped in a specific version.
 *
 * In 2.2 + 2.4 this is exercised by MCPServerDef (substrate landed in
 * loomcycle v0.9.2 PR #177). The gate code path remains for
 * forward-compat against future-feature additions and for the rare case
 * of an operator running pre-v0.9.2 loomcycle. Surface a clean
 * NodeOperationError("Requires loomcycle vX.Y") so the operator UI
 * shows the right next-step.
 *
 * The gate calls health() (unauthenticated, cheap) and parses the
 * returned `version` field. n8n re-enters the node's execute per item;
 * the per-execution caller is expected to cache the result.
 */

export interface ParsedSemver {
	major: number;
	minor: number;
	patch: number;
	raw: string;
}

/**
 * Parse a `v<major>.<minor>.<patch>` string, returning {0,0,0,raw}
 * when parsing fails (so comparisons against a real minimum reject).
 */
export function parseSemver(input: string | undefined): ParsedSemver {
	const raw = (input ?? '').trim();
	const match = raw.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!match) return { major: 0, minor: 0, patch: 0, raw };
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		raw,
	};
}

/**
 * Return true when `actual` is `>= minimum`. Component-wise comparison;
 * all three fields must be parsed cleanly to count.
 */
export function semverGte(actual: ParsedSemver, minimum: ParsedSemver): boolean {
	if (actual.major !== minimum.major) return actual.major > minimum.major;
	if (actual.minor !== minimum.minor) return actual.minor > minimum.minor;
	return actual.patch >= minimum.patch;
}

/**
 * Throw NodeOperationError when the connected loomcycle is older than
 * `minVersion` (e.g. "0.9.2"). Use sparingly — every call is a wire
 * round-trip; cache the result across an execution.
 *
 * Empty / unparseable version strings are treated as "too old" so the
 * gate fails closed. Operators running a build without `version`
 * embedded should upgrade.
 */
export async function requireLoomcycleVersion(
	ctx: IExecuteFunctions | ILoadOptionsFunctions | ITriggerFunctions | ISupplyDataFunctions,
	minVersion: string,
	featureLabel: string,
): Promise<void> {
	const client = await getClient(ctx);
	const health = await client.health();
	const actual = parseSemver(health.version);
	const minimum = parseSemver(minVersion);
	if (!semverGte(actual, minimum)) {
		const got = actual.raw || '(empty)';
		throw new NodeOperationError(
			(ctx as IExecuteFunctions).getNode(),
			`${featureLabel} requires loomcycle ≥ v${minVersion}. The connected loomcycle reports version ${got}.`,
		);
	}
}
