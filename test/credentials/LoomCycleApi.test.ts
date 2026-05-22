import { describe, it, expect } from 'vitest';
import { LoomCycleApi } from '../../credentials/LoomCycleApi.credentials';

describe('LoomCycleApi credential', () => {
	const cred = new LoomCycleApi();

	describe('shape', () => {
		it('uses the n8n-canonical camelCase name', () => {
			expect(cred.name).toBe('loomCycleApi');
		});

		it('has a human display name', () => {
			expect(cred.displayName).toBe('LoomCycle API');
		});

		it('publishes a documentation URL', () => {
			expect(cred.documentationUrl).toBeTruthy();
			expect(cred.documentationUrl).toMatch(/^https?:\/\//);
		});

		it('declares 5 properties (baseUrl, bearerToken, userId, userTier, mcpUrl)', () => {
			const names = cred.properties.map((p) => p.name);
			expect(names).toEqual(['baseUrl', 'bearerToken', 'userId', 'userTier', 'mcpUrl']);
		});
	});

	describe('baseUrl property', () => {
		const prop = () => cred.properties.find((p) => p.name === 'baseUrl')!;

		it('is required', () => {
			expect(prop().required).toBe(true);
		});

		it('defaults to the loomcycle dev address', () => {
			expect(prop().default).toBe('http://127.0.0.1:8787');
		});

		it('is a string type', () => {
			expect(prop().type).toBe('string');
		});
	});

	describe('bearerToken property', () => {
		const prop = () => cred.properties.find((p) => p.name === 'bearerToken')!;

		it('is required', () => {
			expect(prop().required).toBe(true);
		});

		it('is masked as a password input', () => {
			expect(prop().typeOptions?.password).toBe(true);
		});

		it('starts empty', () => {
			expect(prop().default).toBe('');
		});
	});

	describe('optional default fields', () => {
		it('userId is optional and empty by default', () => {
			const userId = cred.properties.find((p) => p.name === 'userId')!;
			expect(userId.required).toBeFalsy();
			expect(userId.default).toBe('');
		});

		it('userTier is optional and empty by default', () => {
			const userTier = cred.properties.find((p) => p.name === 'userTier')!;
			expect(userTier.required).toBeFalsy();
			expect(userTier.default).toBe('');
		});

		it('mcpUrl is optional and empty by default', () => {
			const mcpUrl = cred.properties.find((p) => p.name === 'mcpUrl')!;
			expect(mcpUrl.required).toBeFalsy();
			expect(mcpUrl.default).toBe('');
		});
	});

	describe('authenticate (generic header injection)', () => {
		it('uses the n8n generic auth scheme', () => {
			expect(cred.authenticate.type).toBe('generic');
		});

		it('injects Authorization: Bearer <token> via expression', () => {
			const headers = (cred.authenticate.properties as { headers?: Record<string, string> }).headers ?? {};
			expect(headers.Authorization).toBe('=Bearer {{$credentials.bearerToken}}');
		});
	});

	describe('credential test', () => {
		it('hits /healthz on the configured baseUrl', () => {
			const req = cred.test.request;
			expect(req.url).toBe('/healthz');
			expect(req.method).toBe('GET');
			expect(req.baseURL).toBe('={{$credentials.baseUrl}}');
		});
	});

	describe('security boundary regression', () => {
		it('does not echo the bearer token in any description / placeholder field', () => {
			for (const prop of cred.properties) {
				const surface = JSON.stringify({
					description: prop.description,
					placeholder: prop.placeholder,
					default: prop.default,
				});
				expect(surface.toLowerCase()).not.toMatch(/sk-[a-z0-9-]/);
			}
		});
	});
});
