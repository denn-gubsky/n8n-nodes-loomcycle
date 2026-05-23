/**
 * Helpers for the MCPServerDef Register UI's "Required env vars on
 * loomcycle" hint. Loomcycle's wire path substitutes `${LOOMCYCLE_FOO}`
 * tokens in header values at request time using its own env (operator-
 * managed); the n8n node never transmits a plaintext credential, only
 * the template string. This module extracts the token names from a
 * header collection so the node UI can render a "set these on the
 * loomcycle deployment" reminder.
 *
 * See doc-internal/mcp-server-def-cross-repo.md §"The env-var-mirror UX
 * gap" for the full rationale.
 */

const ENV_TOKEN_RE = /\$\{(LOOMCYCLE_[A-Z0-9_]+)(?::-[^}]*)?\}/g;

/**
 * Extract unique `${LOOMCYCLE_*}` env-var names referenced from a string.
 * Supports the default-fallback form `${LOOMCYCLE_FOO:-default}` per the
 * loomcycle v0.8.14 substitution grammar; the default value itself is
 * ignored (loomcycle uses it; the operator still has to set the env to
 * override).
 */
export function extractEnvVarNames(text: string): string[] {
	if (!text) return [];
	const seen = new Set<string>();
	for (const match of text.matchAll(ENV_TOKEN_RE)) {
		seen.add(match[1]);
	}
	return Array.from(seen).sort();
}

/**
 * Extract env-var names from the typical "headers" n8n fixedCollection
 * shape (`{ header: [{ name, value }, ...] }`).
 */
export function extractEnvVarsFromHeaders(headers: unknown): string[] {
	if (!headers || typeof headers !== 'object') return [];
	const headerCollection = (headers as { header?: unknown }).header;
	if (!Array.isArray(headerCollection)) return [];
	const seen = new Set<string>();
	for (const entry of headerCollection) {
		if (!entry || typeof entry !== 'object') continue;
		const value = (entry as { value?: unknown }).value;
		if (typeof value !== 'string') continue;
		for (const name of extractEnvVarNames(value)) {
			seen.add(name);
		}
	}
	return Array.from(seen).sort();
}

/**
 * Compose the human-readable hint string the node UI surfaces under
 * the Headers field. Empty when no env-var tokens are referenced.
 */
export function formatEnvVarHint(names: string[]): string {
	if (names.length === 0) return '';
	return `Required env vars on the loomcycle deployment: ${names.join(', ')}. Set these in loomcycle's environment before registering; they substitute into the header values at request time.`;
}
