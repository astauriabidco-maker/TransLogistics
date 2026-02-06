/**
 * CHOIX_SERVICE State Handler
 * 
 * Handles service selection (send or track).
 * Creates draft shipment for ENVOI flow.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates } from '../templates';

export class ChoixServiceHandler {
    readonly state = 'CHOIX_SERVICE' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber } = ctx;

        // Get selected service from button reply
        const selectedId = this.getSelectedButtonId(message);

        if (selectedId === 'SERVICE_ENVOI') {
            return this.handleEnvoi(phoneNumber, templates);
        }

        if (selectedId === 'SERVICE_SUIVI') {
            return this.handleSuivi(phoneNumber, templates);
        }

        // Invalid input - resend menu
        return this.resendMenu(phoneNumber, templates);
    }

    private getSelectedButtonId(message: typeof ctx.message): string | null {
        if (message.type === 'interactive') {
            return message.interactive?.button_reply?.id ?? null;
        }
        if (message.type === 'button') {
            return message.button?.payload ?? null;
        }
        // Allow text fallback
        if (message.type === 'text') {
            const text = message.text?.body?.toLowerCase() ?? '';
            if (text.includes('envoi') || text.includes('send') || text === '1') {
                return 'SERVICE_ENVOI';
            }
            if (text.includes('suivi') || text.includes('track') || text === '2') {
                return 'SERVICE_SUIVI';
            }
        }
        return null;
    }

    private async handleEnvoi(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        // TODO: Call ShipmentService.createShipment() to get shipmentId
        // For now, we just transition to SCAN_PHOTO

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
            nextState: 'SCAN_PHOTO',
            stateData: {
                selectedService: 'ENVOI',
                // shipmentId will be set when shipment is created
            },
            responses,
        };
    }

    private async handleSuivi(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.requestTrackingCode },
            },
        ];

        return {
            nextState: 'SUIVI',
            stateData: {
                selectedService: 'SUIVI',
            },
            responses,
        };
    }

    private resendMenu(
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
                    body: { text: templates.serviceMenu },
                    action: {
                        buttons: [
                            { type: 'reply', reply: { id: 'SERVICE_ENVOI', title: templates.serviceEnvoi } },
                            { type: 'reply', reply: { id: 'SERVICE_SUIVI', title: templates.serviceSuivi } },
                        ],
                    },
                },
            },
        ];

        return {
            nextState: 'CHOIX_SERVICE', // Stay in same state
            stateData: {},
            responses,
        };
    }

    canHandle(ctx: HandlerContext): boolean {
        const { message } = ctx;
        return (
            message.type === 'interactive' ||
            message.type === 'button' ||
            message.type === 'text'
        );
    }
}
