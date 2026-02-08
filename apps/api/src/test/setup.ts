/**
 * Test Setup
 * 
 * Global setup for all Vitest tests.
 * Runs before each test file.
 */

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/translogistics_test';
process.env['REDIS_URL'] = 'redis://localhost:6379/1';
process.env['AI_ENGINE_URL'] = 'http://localhost:8000';
process.env['AI_ENGINE_INTERNAL_KEY'] = 'test-internal-key';
process.env['LOG_LEVEL'] = 'silent';

// Suppress console output in tests
// Uncomment to silence logs during test runs:
// import { vi } from 'vitest';
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'error').mockImplementation(() => {});
