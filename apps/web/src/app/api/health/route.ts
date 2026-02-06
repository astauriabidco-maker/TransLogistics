import { NextResponse } from 'next/server';

/**
 * Health Check API Route
 * 
 * GET /api/health
 * 
 * Returns the health status of the web application.
 * Used by container orchestration for health checks.
 */
export async function GET() {
    const healthStatus = {
        status: 'ok',
        service: 'translogistics-web',
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? 'development',
    };

    return NextResponse.json(healthStatus, { status: 200 });
}
