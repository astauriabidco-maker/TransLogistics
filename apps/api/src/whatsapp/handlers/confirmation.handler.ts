/**
 * CONFIRMATION State Handler
 * 
 * Handles quote acceptance or rejection.
 * Calls QuoteService to accept/reject.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates } from '../templates';

export class ConfirmationHandler {
    readonly state = 'CONFIRMATION' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber, session } = ctx;

        const selectedId = this.getSelectedButtonId(message);

        if (selectedId === 'CONFIRM_YES') {
            return this.handleAccept(phoneNumber, session.stateData.quoteId, templates);
        }

        if (selectedId === 'CONFIRM_NO') {
            return this.handleReject(phoneNumber, templates);
        }

        // Invalid input - resend confirmation buttons
        return this.resendConfirmation(phoneNumber, templates);
    }

    private getSelectedButtonId(message: typeof ctx.message): string | null {
        if (message.type === 'interactive') {
            return message.interactive?.button_reply?.id ?? null;
        }
        if (message.type === 'text') {
            const text = message.text?.body?.toLowerCase() ?? '';
            if (text.includes('oui') || text.includes('yes') || text === '1') {
                return 'CONFIRM_YES';
            }
            if (text.includes('non') || text.includes('no') || text === '2') {
                return 'CONFIRM_NO';
            }
        }
        return null;
    }

    private async handleAccept(
        phoneNumber: string,
        quoteId: string | undefined,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        // TODO: Call QuoteService.acceptQuote(quoteId)
        // TODO: Call ShipmentService.confirmShipment(shipmentId)

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.quoteAccepted },
            },
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
            nextState: 'PAIEMENT',
            stateData: {
                quoteAccepted: true,
            },
            responses,
        };
    }

    private async handleReject(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        // TODO: Call QuoteService.rejectQuote(quoteId)
        // TODO: Call ShipmentService.cancelShipment(shipmentId)

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.quoteRejected },
            },
        ];

        return {
            nextState: 'INIT',
            stateData: {
                quoteAccepted: false,
            },
            responses,
        };
    }

    private resendConfirmation(
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
            nextState: 'CONFIRMATION', // Stay in same state
            stateData: {},
            responses,
        };
    }

    canHandle(): boolean {
        return true;
    }
}
