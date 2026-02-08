import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        root: './src',
        include: ['**/*.test.ts', '**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'lcov'],
            include: ['**/*.ts'],
            exclude: [
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/index.ts',
                '**/types.ts',
                '**/__tests__/**',
            ],
            thresholds: {
                // Start with achievable targets, increase over time
                lines: 50,
                functions: 50,
                branches: 40,
                statements: 50,
            },
        },
        setupFiles: ['./test/setup.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
