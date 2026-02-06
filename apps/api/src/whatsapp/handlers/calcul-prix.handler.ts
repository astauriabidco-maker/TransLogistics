/**
 * CALCUL_PRIX State Handler
 * 
 * Waits for scan result and displays quote.
 * Calls QuoteService to create/retrieve quote.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates, format } from '../templates';

export class CalculPrixHandler {
    readonly state = 'CALCUL_PRIX' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { phoneNumber, session } = ctx;

        // Check if we have scan result
        const scanResultId = session.stateData.scanResultId;
        if (!scanResultId) {
            // Still waiting for scan - this shouldn't happen normally
            return this.sendWaiting(phoneNumber, templates);
        }

        // TODO: Call ScanService.getScanById(scanResultId) to get dimensions
        // TODO: Call QuoteService.createQuoteFromScan({
        //   shipmentId: session.stateData.shipmentId,
        //   scanResultId,
        //   weightKg: estimatedWeight,
        // });

        // Mock quote data for now
        const mockQuote = {
            id: `quote_${Date.now()}`,
            dimensions: { length: 30, width: 20, height: 15 },
            weight: 2.5,
            origin: 'Abidjan',
            destination: 'Bouaké',
            price: 5500,
            validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        // Format price message
        const priceText = format(templates.priceResult, {
            length: mockQuote.dimensions.length,
            width: mockQuote.dimensions.width,
            height: mockQuote.dimensions.height,
            weight: mockQuote.weight,
            origin: mockQuote.origin,
            destination: mockQuote.destination,
            price: mockQuote.price.toLocaleString('fr-FR'),
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: priceText },
            },
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: templates.confirmPrompt },
                    action: {
                        buttons: [
                            { type: 'reply', reply: { id: 'CONFIRM_YES', title: templates.confirmYes } },
                            { type: 'reply', reply: { id: 'CONFIRM_NO', title: templates.confirmNo } },
                        ],
                    },
                },
            },
        ];

        return {
            nextState: 'CONFIRMATION',
            stateData: {
                quoteId: mockQuote.id,
                quotePriceXof: mockQuote.price,
            },
            responses,
        };
    }

    private sendWaiting(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.calculatingPrice },
            },
        ];

        return {
            nextState: 'CALCUL_PRIX', // Stay in same state
            stateData: {},
            responses,
        };
    }

    canHandle(): boolean {
        return true;
    }
}
