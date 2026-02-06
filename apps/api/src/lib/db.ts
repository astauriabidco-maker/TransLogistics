import { Pool, PoolConfig } from 'pg';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * PostgreSQL Connection Placeholder
 * 
 * This module provides database connection management.
 * Actual queries and Prisma integration will be added in feature phase.
 */

let pool: Pool | null = null;

const poolConfig: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_SIZE,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

export async function connectDatabase(): Promise<void> {
    try {
        pool = new Pool(poolConfig);

        // Test connection
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        logger.info('Database connection established');
    } catch (error) {
        logger.error({ error }, 'Failed to connect to database');
        throw error;
    }
}

export async function disconnectDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('Database connection closed');
    }
}

export function getPool(): Pool {
    if (!pool) {
        throw new Error('Database pool not initialized. Call connectDatabase() first.');
    }
    return pool;
}

export async function checkDatabaseHealth(): Promise<boolean> {
    try {
        const client = await getPool().connect();
        await client.query('SELECT 1');
        client.release();
        return true;
    } catch {
        return false;
    }
}
