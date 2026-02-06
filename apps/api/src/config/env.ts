import { config } from 'dotenv';
import path from 'path';

// Load .env from monorepo root (../../.env from apps/api)
config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });


interface EnvConfig {
    // Application
    NODE_ENV: 'development' | 'staging' | 'production';
    PORT: number;
    SERVICE_NAME: string;

    // Database (placeholder)
    DATABASE_URL: string;
    DATABASE_POOL_SIZE: number;

    // Redis (placeholder)
    REDIS_URL: string;

    // AI Engine
    AI_ENGINE_URL: string;
    AI_ENGINE_TIMEOUT_MS: number;
    AI_ENGINE_INTERNAL_KEY: string;

    // Logging
    LOG_LEVEL: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
    const value = process.env[key] ?? defaultValue;
    if (value === undefined) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function getEnvVarAsInt(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) {
        return defaultValue;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be a valid integer`);
    }
    return parsed;
}

export const env: EnvConfig = {
    // Application
    NODE_ENV: (process.env['NODE_ENV'] as EnvConfig['NODE_ENV']) || 'development',
    PORT: getEnvVarAsInt('PORT', 3001),
    SERVICE_NAME: getEnvVar('SERVICE_NAME', 'translogistics-api'),

    // Database
    DATABASE_URL: getEnvVar('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/translogistics'),
    DATABASE_POOL_SIZE: getEnvVarAsInt('DATABASE_POOL_SIZE', 10),

    // Redis
    REDIS_URL: getEnvVar('REDIS_URL', 'redis://localhost:6379'),

    // AI Engine
    AI_ENGINE_URL: getEnvVar('AI_ENGINE_URL', 'http://localhost:8000'),
    AI_ENGINE_TIMEOUT_MS: getEnvVarAsInt('AI_ENGINE_TIMEOUT_MS', 30000),
    AI_ENGINE_INTERNAL_KEY: getEnvVar('AI_ENGINE_INTERNAL_KEY', 'dev-internal-key'),

    // Logging
    LOG_LEVEL: getEnvVar('LOG_LEVEL', 'debug'),
};
