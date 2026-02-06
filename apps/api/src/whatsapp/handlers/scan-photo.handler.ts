/**
 * SCAN_PHOTO State Handler
 * 
 * Handles photo upload for VolumeScan.
 * Forwards image to AI Engine via ScanService.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates } from '../templates';
import { getMessageSender } from '../message.sender';

export class ScanPhotoHandler {
    readonly state = 'SCAN_PHOTO' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber, session } = ctx;

        // Check if message is an image
        if (message.type !== 'image') {
            return this.requestPhoto(phoneNumber, templates);
        }

        const mediaId = message.image?.id;
        if (!mediaId) {
            return this.requestPhoto(phoneNumber, templates);
        }

        // Download the image
        const sender = getMessageSender();
        const downloadResult = await sender.downloadMedia(mediaId);

        if (!downloadResult.success) {
            return this.handlePhotoError(phoneNumber, templates);
        }

        // Send "processing" feedback
        const processingResponses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.photoReceived },
            },
        ];

        // TODO: Call ScanService.requestScan({
        //   shipmentId: session.stateData.shipmentId,
        //   imageBase64: downloadResult.data.toString('base64'),
        //   referenceObject: 'A4',
        // });
        // For now, simulate scan result

        const mockScanResultId = `scan_${Date.now()}`;
        const imageHash = downloadResult.sha256 ?? 'unknown';

        return {
            nextState: 'CALCUL_PRIX',
            stateData: {
                scanResultId: mockScanResultId,
                photoReceived: true,
            },
            responses: processingResponses,
        };
    }

    private requestPhoto(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.requestPhoto },
            },
        ];

        return {
            nextState: 'SCAN_PHOTO', // Stay in same state
            stateData: {},
            responses,
        };
    }

    private handlePhotoError(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.photoError },
            },
        ];

        return {
            nextState: 'SCAN_PHOTO', // Stay in same state for retry
            stateData: {
                retryCount: 1,
            },
            responses,
        };
    }

    canHandle(ctx: HandlerContext): boolean {
        return true; // Can receive any message type
    }
}
