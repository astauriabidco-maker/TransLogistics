/**
 * Scan Status API
 * 
 * GET /api/scan/[id]/status
 * 
 * Get the current status of a scan request.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id } = await params;

        // Get scan from store
        const scanStore = (globalThis as any).__scanStore || {};
        const scan = scanStore[id];

        if (!scan) {
            return NextResponse.json(
                { error: 'Scan request not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: scan.id,
            shipmentId: scan.shipmentId,
            status: scan.status,
            createdAt: scan.createdAt,
        });

    } catch (error) {
        console.error('[Scan] Status error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
