/**
 * Scan Upload API
 * 
 * POST /api/scan/upload
 * 
 * Upload an image for VolumeScan AI processing.
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock scan request ID generator
function generateScanRequestId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const image = formData.get('image') as File | null;
        const shipmentId = formData.get('shipmentId') as string | null;

        // Validation
        if (!image) {
            return NextResponse.json(
                { error: 'Image is required' },
                { status: 400 }
            );
        }

        if (!shipmentId) {
            return NextResponse.json(
                { error: 'Shipment ID is required' },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(image.type)) {
            return NextResponse.json(
                { error: 'Invalid image type. Allowed: JPEG, PNG, WebP' },
                { status: 400 }
            );
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (image.size > maxSize) {
            return NextResponse.json(
                { error: 'Image too large. Max 10MB' },
                { status: 400 }
            );
        }

        // Generate scan request ID
        const scanRequestId = generateScanRequestId();

        // TODO: In production:
        // 1. Save image to storage (S3, etc.)
        // 2. Create ScanRequest in database
        // 3. Enqueue job to BullMQ

        // For now, we simulate by storing in memory (demo only)
        // In production, this would be stored in Redis/DB
        const scanStore = (globalThis as any).__scanStore || {};
        scanStore[scanRequestId] = {
            id: scanRequestId,
            shipmentId,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            filename: image.name,
            fileSize: image.size,
        };
        (globalThis as any).__scanStore = scanStore;

        // Simulate async processing (status will change after 3s)
        setTimeout(() => {
            const store = (globalThis as any).__scanStore;
            if (store && store[scanRequestId]) {
                store[scanRequestId].status = 'PROCESSING';
            }
        }, 1000);

        // Simulate completion after 5s
        setTimeout(() => {
            const store = (globalThis as any).__scanStore;
            if (store && store[scanRequestId]) {
                // Simulate AI result
                store[scanRequestId].status = 'COMPLETED';
                store[scanRequestId].result = {
                    dimensions: {
                        lengthCm: 50 + Math.random() * 10,
                        widthCm: 40 + Math.random() * 10,
                        heightCm: 30 + Math.random() * 10,
                    },
                    volumeCm3: 60000 + Math.random() * 10000,
                    payableWeightKg: 12 + Math.random() * 3,
                    weightSource: 'AI_SCAN',
                    confidenceScore: 0.75 + Math.random() * 0.2,
                };
            }
        }, 5000);

        console.log(`[Scan] Created scan request ${scanRequestId} for shipment ${shipmentId}`);

        return NextResponse.json({
            success: true,
            scanRequestId,
            message: 'Image uploaded successfully. Scan processing started.',
        });

    } catch (error) {
        console.error('[Scan] Upload error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
