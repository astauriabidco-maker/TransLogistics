/**
 * WhatsApp Audit Logger
 * 
 * Logs all WhatsApp messages for traceability.
 * Required for debugging and compliance.
 */

import type { PrismaClient } from '@prisma/client';
import type { IncomingMessage, WhatsAppState } from './types';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface AuditLogEntry {
    phoneNumber: string;
    direction: 'INBOUND' | 'OUTBOUND';
    messageType: string;
    messageId: string;
    state: WhatsAppState;
    payload?: unknown;
    errorMessage?: string;
    processingTimeMs?: number;
}

// ==================================================
// SERVICE
// ==================================================

export class WhatsAppAuditLogger {
    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Log an inbound message.
     */
    async logInbound(
        message: IncomingMessage,
        phoneNumber: string,
        state: WhatsAppState,
        processingTimeMs?: number,
        errorMessage?: string
    ): Promise<void> {
        try {
            await this.prisma.whatsAppAuditLog.create({
                data: {
                    phoneNumber,
                    direction: 'INBOUND',
                    messageType: message.type,
                    messageId: message.id,
                    state,
                    payload: this.sanitizePayload(message),
                    processingTimeMs,
                    errorMessage,
                },
            });
        } catch (error) {
            // Log but don't fail on audit errors
            logger.error('Failed to write audit log', { error, messageId: message.id });
        }
    }

    /**
     * Log an outbound message.
     */
    async logOutbound(
        phoneNumber: string,
        messageType: string,
        messageId: string,
        state: WhatsAppState,
        payload?: unknown
    ): Promise<void> {
        try {
            await this.prisma.whatsAppAuditLog.create({
                data: {
                    phoneNumber,
                    direction: 'OUTBOUND',
                    messageType,
                    messageId,
                    state,
                    payload: payload ? this.sanitizePayload(payload) : null,
                },
            });
        } catch (error) {
            // Log but don't fail on audit errors
            logger.error('Failed to write audit log', { error, messageId });
        }
    }

    /**
     * Sanitize payload to remove sensitive data.
     */
    private sanitizePayload(payload: unknown): unknown {
        if (typeof payload !== 'object' || payload === null) {
            return payload;
        }

        const sanitized = { ...payload } as Record<string, unknown>;

        // Remove potentially sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'key'];
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }
}
