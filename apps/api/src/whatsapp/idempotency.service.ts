/**
 * Idempotency Service
 * 
 * Database-backed idempotency for WhatsApp messages.
 * Survives server restarts (unlike in-memory Set).
 * 
 * Can be swapped for Redis implementation later.
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// CONSTANTS
// ==================================================

const MESSAGE_TTL_HOURS = 24;

// ==================================================
// SERVICE
// ==================================================

export class IdempotencyService {
    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Check if a message has already been processed.
     */
    async isProcessed(messageId: string): Promise<boolean> {
        const existing = await this.prisma.whatsAppIdempotency.findUnique({
            where: { messageId },
        });

        return existing !== null;
    }

    /**
     * Mark a message as processed.
     */
    async markProcessed(messageId: string): Promise<void> {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + MESSAGE_TTL_HOURS);

        try {
            await this.prisma.whatsAppIdempotency.create({
                data: {
                    messageId,
                    expiresAt,
                },
            });
        } catch (error) {
            // Ignore duplicate key errors (race condition)
            if ((error as { code?: string }).code === 'P2002') {
                logger.debug('Duplicate idempotency key ignored', { messageId });
                return;
            }
            throw error;
        }
    }

    /**
     * Cleanup expired entries.
     * Should be called by a scheduled job.
     */
    async cleanupExpired(): Promise<number> {
        const result = await this.prisma.whatsAppIdempotency.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        if (result.count > 0) {
            logger.info('Cleaned up expired idempotency entries', {
                count: result.count,
            });
        }

        return result.count;
    }
}
