/**
 * Strict ruleset gated to `prepublishOnly`. Layered on top of .eslintrc.js;
 * adds the rules that n8n's community-node validator surfaces as blockers
 * (display-name conventions, dynamic-option mismatches, etc.).
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
	extends: './.eslintrc.js',
	overrides: [
		{
			files: ['package.json'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			rules: {
				'n8n-nodes-base/community-package-json-name-still-default': 'error',
			},
		},
		{
			files: ['credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			rules: {
				'n8n-nodes-base/cred-class-field-documentation-url-missing': 'error',
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'error',
			},
		},
		{
			files: ['nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			rules: {
				'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'error',
				'n8n-nodes-base/node-resource-description-filename-against-convention': 'error',
				'n8n-nodes-base/node-param-fixed-collection-type-unsorted-items': 'error',
			},
		},
	],
};
