/**
 * Prisma Client Singleton
 * 
 * Single instance of Prisma Client for the entire application.
 * Uses @prisma/adapter-pg for Prisma 7 client engine.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from '../config/env';

// Global singleton to prevent multiple instances in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        adapter,
        log: process.env['NODE_ENV'] === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
    globalForPrisma.prisma = prisma;
}
