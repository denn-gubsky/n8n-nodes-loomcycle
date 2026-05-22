/**
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
	root: true,
	env: {
		node: true,
		es2020: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: ['./tsconfig.json'],
		sourceType: 'module',
		extraFileExtensions: ['.json'],
	},
	ignorePatterns: [
		'.eslintrc.js',
		'.eslintrc.prepublish.js',
		'**/*.js',
		'**/node_modules/**',
		'**/dist/**',
		'vitest.config.ts',
		'gulpfile.js',
	],
	overrides: [
		{
			files: ['credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
		},
		{
			files: ['nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
			rules: {
				// Both rules below have destructive autofixes:
				// - `display-name-miscased` autofix breaks acronyms (turns "IDs" into "I Ds")
				// - `description-wrong-for-dynamic-options` autofix APPENDS the canonical
				//   text rather than replacing the existing description, producing
				//   duplicated suffixes. We hand-author the canonical string instead.
				'n8n-nodes-base/node-param-display-name-miscased': 'off',
				'n8n-nodes-base/node-param-description-wrong-for-dynamic-options': 'off',
			},
		},
		{
			files: ['package.json'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/community'],
		},
	],
};
