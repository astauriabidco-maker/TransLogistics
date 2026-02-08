/**
 * CALCUL_PRIX State Handler
 * 
 * Waits for scan result and displays quote.
 * Calls QuoteService to create/retrieve quote.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates, format } from '../templates';
import { logger } from '../../lib/logger';

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

        // Create real quote from scan
        try {
            const scan = await ctx.services.scan.getScanById(scanResultId);
            const quote = await ctx.services.quote.createQuoteFromScan({
                shipmentId: session.stateData.shipmentId!,
                scanResultId,
                weightKg: Number(scan.validatedDimensions?.weightKg || scan.detectedDimensions?.weightKg || 1),
                validityMinutes: 24 * 60,
            }, {
                requestId: `wa-quote-${scanResultId}`,
                timestamp: new Date()
            });

            // Format price message
            const priceText = format(templates.priceResult, {
                length: Math.round(Number(quote.dimensions.lengthCm)),
                width: Math.round(Number(quote.dimensions.widthCm)),
                height: Math.round(Number(quote.dimensions.heightCm)),
                weight: Number(quote.weightKg),
                origin: 'Abidjan',
                destination: 'Bouaké',
                price: Math.round(Number(quote.breakdown.total.amount)).toLocaleString('fr-FR'),
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
                    quoteId: quote.id,
                    quotePriceXof: Math.round(Number(quote.breakdown.total.amount)),
                },
                responses,
            };
        } catch (error) {
            logger.error({ error, scanResultId }, 'Failed to create quote');
            const responses: OutgoingMessage[] = [
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: phoneNumber,
                    type: 'text',
                    text: { body: templates.errorGeneric },
                },
            ];
            return {
                nextState: 'CHOIX_SERVICE',
                stateData: {},
                responses,
            };
        }
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
