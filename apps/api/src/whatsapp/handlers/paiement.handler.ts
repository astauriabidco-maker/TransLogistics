/**
 * PAIEMENT State Handler
 * 
 * Handles payment method selection and initiation.
 * Calls PaymentService to start payment flow.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage, IncomingMessage } from '../types';
import { getTemplates, format } from '../templates';

export class PaiementHandler {
    readonly state = 'PAIEMENT' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber, session } = ctx;

        const selectedId = this.getSelectedButtonId(message);

        if (selectedId === 'PAY_MOBILE') {
            return this.handleMobileMoney(phoneNumber, session.stateData, templates, ctx);
        }

        if (selectedId === 'PAY_CASH') {
            return this.handleCash(phoneNumber, session.stateData, templates, ctx);
        }

        // Invalid input - resend payment options
        return this.resendPaymentOptions(phoneNumber, templates);
    }

    private getSelectedButtonId(message: IncomingMessage): string | null {
        if (message.type === 'interactive') {
            return message.interactive?.button_reply?.id ?? null;
        }
        if (message.type === 'text') {
            const text = message.text?.body?.toLowerCase() ?? '';
            if (text.includes('mobile') || text.includes('momo') || text === '1') {
                return 'PAY_MOBILE';
            }
            if (text.includes('cash') || text.includes('espèces') || text === '2') {
                return 'PAY_CASH';
            }
        }
        return null;
    }

    private async handleMobileMoney(
        phoneNumber: string,
        stateData: Record<string, any>,
        templates: ReturnType<typeof getTemplates>,
        ctx: HandlerContext
    ): Promise<HandlerResult> {
        // Call real PaymentService
        const result = await ctx.services.payment.initiatePayment({
            shipmentId: stateData['shipmentId']!,
            quoteId: stateData['quoteId']!,
            amountXof: Number(stateData['quotePriceXof']),
            method: 'MOBILE_MONEY',
            provider: 'CINETPAY',
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.paymentInitiated },
            },
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: `🔗 Lien de paiement sécurisé : ${result.paymentUrl}\n\nUne fois le paiement effectué, votre colis sera prêt pour la collecte.` },
            },
        ];

        return {
            nextState: 'SUIVI',
            stateData: {
                paymentMethod: 'MOBILE_MONEY',
                paymentId: result.payment.id,
            },
            responses,
        };
    }

    private async handleCash(
        phoneNumber: string,
        stateData: Record<string, any>,
        templates: ReturnType<typeof getTemplates>,
        ctx: HandlerContext
    ): Promise<HandlerResult> {
        // Call real PaymentService
        const result = await ctx.services.payment.initiatePayment({
            shipmentId: stateData['shipmentId']!,
            quoteId: stateData['quoteId']!,
            amountXof: Number(stateData['quotePriceXof']),
            method: 'CASH',
            provider: 'CINETPAY', // Base provider info
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: `💵 Paiement en espèces sélectionné.\n\nVous paierez *${Number(stateData['quotePriceXof']).toLocaleString('fr-FR')} FCFA* lors de la collecte.` },
            },
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.paymentConfirmed.replace('{{trackingCode}}', 'Votre code de suivi habituel') },
            },
        ];

        return {
            nextState: 'SUIVI',
            stateData: {
                paymentMethod: 'CASH',
                paymentId: result.payment.id,
            },
            responses,
        };
    }

    private resendPaymentOptions(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: templates.paymentMethodPrompt },
                    action: {
                        buttons: [
                            { type: 'reply', reply: { id: 'PAY_MOBILE', title: templates.paymentMobileMoney } },
                            { type: 'reply', reply: { id: 'PAY_CASH', title: templates.paymentCash } },
                        ],
                    },
                },
            },
        ];

        return {
            nextState: 'PAIEMENT', // Stay in same state
            stateData: {},
            responses,
        };
    }

    canHandle(): boolean {
        return true;
    }
}
