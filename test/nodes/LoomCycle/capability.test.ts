import { describe, it, expect } from 'vitest';
import { parseSemver, semverGte } from '../../../nodes/LoomCycle/helpers/capability';
import { extractEnvVarNames, extractEnvVarsFromHeaders, formatEnvVarHint } from '../../../nodes/LoomCycle/helpers/envVarHints';

describe('parseSemver', () => {
	it('parses canonical v-prefixed semver', () => {
		expect(parseSemver('v0.9.2')).toMatchObject({ major: 0, minor: 9, patch: 2 });
	});

	it('parses unprefixed semver', () => {
		expect(parseSemver('1.0.5')).toMatchObject({ major: 1, minor: 0, patch: 5 });
	});

	it('returns zeros for empty / undefined input (fails closed)', () => {
		expect(parseSemver('')).toMatchObject({ major: 0, minor: 0, patch: 0 });
		expect(parseSemver(undefined)).toMatchObject({ major: 0, minor: 0, patch: 0 });
	});

	it('returns zeros for garbage input', () => {
		expect(parseSemver('abc')).toMatchObject({ major: 0, minor: 0, patch: 0 });
	});

	it('strips pre-release / build suffix when parsing the numeric prefix', () => {
		expect(parseSemver('1.2.3-rc1')).toMatchObject({ major: 1, minor: 2, patch: 3 });
	});
});

describe('semverGte', () => {
	it('returns true when actual exceeds minimum at major', () => {
		expect(semverGte(parseSemver('1.0.0'), parseSemver('0.9.2'))).toBe(true);
	});

	it('returns true when actual equals minimum exactly', () => {
		expect(semverGte(parseSemver('0.9.2'), parseSemver('0.9.2'))).toBe(true);
	});

	it('returns false when actual minor is lower', () => {
		expect(semverGte(parseSemver('0.8.5'), parseSemver('0.9.2'))).toBe(false);
	});

	it('returns false when actual patch is lower', () => {
		expect(semverGte(parseSemver('0.9.1'), parseSemver('0.9.2'))).toBe(false);
	});

	it('returns false when actual is empty (fails closed)', () => {
		expect(semverGte(parseSemver(''), parseSemver('0.9.2'))).toBe(false);
	});
});

describe('extractEnvVarNames', () => {
	it('extracts a single ${LOOMCYCLE_*} token', () => {
		expect(extractEnvVarNames('Bearer ${LOOMCYCLE_SLACK_TOKEN}')).toEqual(['LOOMCYCLE_SLACK_TOKEN']);
	});

	it('extracts multiple tokens deduplicated and sorted', () => {
		expect(extractEnvVarNames('${LOOMCYCLE_B} ${LOOMCYCLE_A} ${LOOMCYCLE_B}')).toEqual([
			'LOOMCYCLE_A',
			'LOOMCYCLE_B',
		]);
	});

	it('extracts tokens with default-fallback form', () => {
		expect(extractEnvVarNames('${LOOMCYCLE_FOO:-default-value}')).toEqual(['LOOMCYCLE_FOO']);
	});

	it('ignores non-LOOMCYCLE_ tokens', () => {
		expect(extractEnvVarNames('${run.user_bearer} ${PATH}')).toEqual([]);
	});

	it('returns empty array for empty input', () => {
		expect(extractEnvVarNames('')).toEqual([]);
	});
});

describe('extractEnvVarsFromHeaders', () => {
	it('extracts tokens from the n8n fixedCollection header shape', () => {
		const headers = {
			header: [
				{ name: 'Authorization', value: 'Bearer ${LOOMCYCLE_TOKEN_A}' },
				{ name: 'X-Other', value: 'static' },
				{ name: 'X-Tenant', value: '${LOOMCYCLE_TENANT}-prod' },
			],
		};
		expect(extractEnvVarsFromHeaders(headers)).toEqual(['LOOMCYCLE_TENANT', 'LOOMCYCLE_TOKEN_A']);
	});

	it('returns empty for malformed input', () => {
		expect(extractEnvVarsFromHeaders(null)).toEqual([]);
		expect(extractEnvVarsFromHeaders({})).toEqual([]);
		expect(extractEnvVarsFromHeaders({ header: 'not-an-array' })).toEqual([]);
	});
});

describe('formatEnvVarHint', () => {
	it('returns empty when no names provided', () => {
		expect(formatEnvVarHint([])).toBe('');
	});

	it('includes every name in the rendered hint', () => {
		const hint = formatEnvVarHint(['LOOMCYCLE_A', 'LOOMCYCLE_B']);
		expect(hint).toContain('LOOMCYCLE_A');
		expect(hint).toContain('LOOMCYCLE_B');
	});
});
