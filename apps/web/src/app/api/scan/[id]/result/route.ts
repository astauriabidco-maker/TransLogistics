/**
 * Scan Result API
 * 
 * GET /api/scan/[id]/result
 * 
 * Get the result of a completed scan.
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

        if (scan.status !== 'COMPLETED' && scan.status !== 'MANUAL_REVIEW_REQUIRED') {
            return NextResponse.json(
                { error: 'Scan not yet completed', status: scan.status },
                { status: 400 }
            );
        }

        if (!scan.result) {
            return NextResponse.json(
                { error: 'No result available' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: scan.id,
            shipmentId: scan.shipmentId,
            status: scan.status,
            ...scan.result,
        });

    } catch (error) {
        console.error('[Scan] Result error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
