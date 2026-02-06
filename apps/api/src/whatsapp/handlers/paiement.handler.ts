/**
 * PAIEMENT State Handler
 * 
 * Handles payment method selection and initiation.
 * Calls PaymentService to start payment flow.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates, format } from '../templates';

export class PaiementHandler {
    readonly state = 'PAIEMENT' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber, session } = ctx;

        const selectedId = this.getSelectedButtonId(message);

        if (selectedId === 'PAY_MOBILE') {
            return this.handleMobileMoney(phoneNumber, session.stateData, templates);
        }

        if (selectedId === 'PAY_CASH') {
            return this.handleCash(phoneNumber, session.stateData, templates);
        }

        // Invalid input - resend payment options
        return this.resendPaymentOptions(phoneNumber, templates);
    }

    private getSelectedButtonId(message: typeof ctx.message): string | null {
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
        stateData: Record<string, unknown>,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        // TODO: Call PaymentService.initiatePayment({
        //   shipmentId: stateData.shipmentId,
        //   method: 'MOBILE_MONEY',
        // });

        const mockPaymentId = `pay_${Date.now()}`;
        const mockReference = `TL${Date.now().toString().slice(-8)}`;
        const amount = stateData.quotePriceXof ?? 5500;

        const instructionsText = format(templates.paymentInstructions, {
            reference: mockReference,
            amount: Number(amount).toLocaleString('fr-FR'),
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
                text: { body: instructionsText },
            },
        ];

        // In real flow, payment confirmation would come via webhook
        // For now, simulate immediate confirmation

        const mockTrackingCode = `TL-${Date.now().toString(36).toUpperCase()}`;

        const confirmText = format(templates.paymentConfirmed, {
            trackingCode: mockTrackingCode,
        });

        responses.push({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
            type: 'text',
            text: { body: confirmText },
        });

        return {
            nextState: 'SUIVI',
            stateData: {
                paymentMethod: 'MOBILE_MONEY',
                paymentId: mockPaymentId,
                trackingCode: mockTrackingCode,
            },
            responses,
        };
    }

    private async handleCash(
        phoneNumber: string,
        stateData: Record<string, unknown>,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        // TODO: Call PaymentService.initiatePayment({
        //   shipmentId: stateData.shipmentId,
        //   method: 'CASH',
        // });

        const mockPaymentId = `pay_${Date.now()}`;
        const mockTrackingCode = `TL-${Date.now().toString(36).toUpperCase()}`;

        const confirmText = format(templates.paymentConfirmed, {
            trackingCode: mockTrackingCode,
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: `💵 Paiement en espèces sélectionné.\n\nVous paierez *${Number(stateData.quotePriceXof ?? 5500).toLocaleString('fr-FR')} FCFA* lors de la collecte.` },
            },
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: confirmText },
            },
        ];

        return {
            nextState: 'SUIVI',
            stateData: {
                paymentMethod: 'CASH',
                paymentId: mockPaymentId,
                trackingCode: mockTrackingCode,
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
