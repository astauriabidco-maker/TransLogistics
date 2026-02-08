/**
 * Prisma Client Mock
 * 
 * Creates a deep mock of PrismaClient for unit testing.
 * Each test should call resetPrismaMock() in beforeEach.
 */
import { vi } from 'vitest';

// Build a recursive proxy that returns vi.fn() for any method call
function createDeepMock(): Record<string, unknown> {
    const cache = new Map<string, unknown>();

    return new Proxy({} as Record<string, unknown>, {
        get(target, prop: string) {
            if (prop === 'then') return undefined; // Prevent Promise confusion
            if (prop === '$transaction') {
                return vi.fn().mockImplementation(
                    async (fn: (tx: unknown) => Promise<unknown>) => fn(createDeepMock())
                );
            }
            if (prop === '$connect' || prop === '$disconnect') {
                return vi.fn().mockResolvedValue(undefined);
            }

            if (!cache.has(prop)) {
                const modelMock = {
                    findUnique: vi.fn(),
                    findUniqueOrThrow: vi.fn(),
                    findFirst: vi.fn(),
                    findFirstOrThrow: vi.fn(),
                    findMany: vi.fn().mockResolvedValue([]),
                    create: vi.fn(),
                    createMany: vi.fn(),
                    update: vi.fn(),
                    updateMany: vi.fn(),
                    upsert: vi.fn(),
                    delete: vi.fn(),
                    deleteMany: vi.fn(),
                    count: vi.fn().mockResolvedValue(0),
                    aggregate: vi.fn(),
                    groupBy: vi.fn(),
                };
                cache.set(prop, modelMock);
            }

            return cache.get(prop);
        },
    });
}

/**
 * Mock PrismaClient instance.
 * Use this in your tests in place of the real Prisma client.
 */
export const prismaMock = createDeepMock();

/**
 * Reset all mock implementations and call counts.
 * Call this in beforeEach() for clean test isolation.
 */
export function resetPrismaMock(): void {
    // Re-create the proxy to reset all mocks
    Object.keys(prismaMock).forEach(key => {
        delete (prismaMock as Record<string, unknown>)[key];
    });
}

/**
 * Type helper — use this to type the mock for model-specific methods.
 * 
 * Example:
 *   const mockCreate = prismaMock.quote.create as MockedFunction<...>;
 */
export type MockPrismaClient = typeof prismaMock;
