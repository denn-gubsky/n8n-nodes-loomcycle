import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: false,
		environment: 'node',
		include: ['test/**/*.test.ts'],
		setupFiles: ['test/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 75,
				statements: 80,
			},
			include: ['credentials/**/*.ts', 'nodes/**/*.ts'],
			exclude: ['**/*.test.ts', 'test/**'],
		},
	},
});
