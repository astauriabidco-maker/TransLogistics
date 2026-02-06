/**
 * Message Sender
 * 
 * Handles sending messages via WhatsApp Cloud API.
 * Supports text, interactive buttons, and lists.
 */

import { getWhatsAppConfig } from './config';
import type {
    OutgoingMessage,
    OutgoingTextMessage,
    OutgoingInteractiveMessage,
    InteractiveButton,
    ListSection,
} from './types';

// ==================================================
// MESSAGE SENDER
// ==================================================

export class MessageSender {
    private readonly config = getWhatsAppConfig();

    /**
     * Send a message to a WhatsApp user.
     */
    async send(message: OutgoingMessage): Promise<SendResult> {
        const url = `${this.config.apiBaseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            if (!response.ok) {
                const error = await response.json();
                return {
                    success: false,
                    error: error.error?.message ?? 'Unknown error',
                    statusCode: response.status,
                };
            }

            const result = await response.json();
            return {
                success: true,
                messageId: result.messages?.[0]?.id,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Network error',
            };
        }
    }

    /**
     * Send a text message.
     */
    async sendText(to: string, body: string): Promise<SendResult> {
        const message: OutgoingTextMessage = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body },
        };
        return this.send(message);
    }

    /**
     * Send interactive buttons (max 3 buttons).
     */
    async sendButtons(
        to: string,
        body: string,
        buttons: Array<{ id: string; title: string }>,
        header?: string,
        footer?: string
    ): Promise<SendResult> {
        const interactiveButtons: InteractiveButton[] = buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
        }));

        const message: OutgoingInteractiveMessage = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                ...(header && { header: { type: 'text', text: header } }),
                body: { text: body },
                ...(footer && { footer: { text: footer } }),
                action: { buttons: interactiveButtons },
            },
        };
        return this.send(message);
    }

    /**
     * Send an interactive list (for more than 3 options).
     */
    async sendList(
        to: string,
        body: string,
        buttonText: string,
        sections: ListSection[],
        header?: string,
        footer?: string
    ): Promise<SendResult> {
        const message: OutgoingInteractiveMessage = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'list',
                ...(header && { header: { type: 'text', text: header } }),
                body: { text: body },
                ...(footer && { footer: { text: footer } }),
                action: {
                    button: buttonText,
                    sections,
                },
            },
        };
        return this.send(message);
    }

    /**
     * Download media from WhatsApp (for photo uploads).
     */
    async downloadMedia(mediaId: string): Promise<MediaDownloadResult> {
        // First, get the media URL
        const metaUrl = `${this.config.mediaBaseUrl}/${this.config.apiVersion}/${mediaId}`;

        try {
            const metaResponse = await fetch(metaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                },
            });

            if (!metaResponse.ok) {
                return { success: false, error: 'Failed to get media URL' };
            }

            const meta = await metaResponse.json();
            const mediaUrl = meta.url;

            // Then download the actual media
            const mediaResponse = await fetch(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                },
            });

            if (!mediaResponse.ok) {
                return { success: false, error: 'Failed to download media' };
            }

            const buffer = await mediaResponse.arrayBuffer();
            return {
                success: true,
                data: Buffer.from(buffer),
                mimeType: meta.mime_type,
                sha256: meta.sha256,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Network error',
            };
        }
    }

    /**
     * Mark message as read.
     */
    async markAsRead(messageId: string): Promise<void> {
        const url = `${this.config.apiBaseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId,
            }),
        });
    }
}

// ==================================================
// RESULT TYPES
// ==================================================

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
}

export interface MediaDownloadResult {
    success: boolean;
    data?: Buffer;
    mimeType?: string;
    sha256?: string;
    error?: string;
}

// ==================================================
// SINGLETON
// ==================================================

let senderInstance: MessageSender | null = null;

export function getMessageSender(): MessageSender {
    if (!senderInstance) {
        senderInstance = new MessageSender();
    }
    return senderInstance;
}
