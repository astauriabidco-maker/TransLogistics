/**
 * Session Repository
 * 
 * Manages WhatsApp session persistence in database.
 * Handles session creation, updates, and expiry.
 */

import type { PrismaClient } from '@prisma/client';
import type { WhatsAppSession, WhatsAppState, SessionStateData } from './types';
import { getWhatsAppConfig } from './config';

// ==================================================
// REPOSITORY
// ==================================================

export class SessionRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Find or create a session for a phone number.
     */
    async getOrCreateSession(phoneNumber: string): Promise<WhatsAppSession> {
        const existing = await this.prisma.whatsAppSession.findUnique({
            where: { phoneNumber },
        });

        if (existing) {
            // Check if expired
            if (existing.expiresAt < new Date()) {
                return this.resetSession(phoneNumber);
            }
            return this.toSession(existing);
        }

        return this.createSession(phoneNumber);
    }

    /**
     * Create a new session.
     */
    async createSession(phoneNumber: string): Promise<WhatsAppSession> {
        const config = getWhatsAppConfig();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + config.sessionExpiryMinutes);

        const session = await this.prisma.whatsAppSession.create({
            data: {
                phoneNumber,
                state: 'INIT',
                stateData: {},
                expiresAt,
            },
        });

        return this.toSession(session);
    }

    /**
     * Reset a session to INIT state.
     */
    async resetSession(phoneNumber: string): Promise<WhatsAppSession> {
        const config = getWhatsAppConfig();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + config.sessionExpiryMinutes);

        const session = await this.prisma.whatsAppSession.upsert({
            where: { phoneNumber },
            update: {
                state: 'INIT',
                stateData: {},
                userId: null,
                currentShipmentId: null,
                expiresAt,
            },
            create: {
                phoneNumber,
                state: 'INIT',
                stateData: {},
                expiresAt,
            },
        });

        return this.toSession(session);
    }

    /**
     * Update session state and data.
     */
    async updateSession(
        sessionId: string,
        updates: {
            state?: WhatsAppState;
            stateData?: SessionStateData;
            userId?: string | null;
            currentShipmentId?: string | null;
        }
    ): Promise<WhatsAppSession> {
        const config = getWhatsAppConfig();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + config.sessionExpiryMinutes);

        const session = await this.prisma.whatsAppSession.update({
            where: { id: sessionId },
            data: {
                ...updates,
                expiresAt,
            },
        });

        return this.toSession(session);
    }

    /**
     * Transition session to new state with merged data.
     */
    async transitionState(
        sessionId: string,
        newState: WhatsAppState,
        additionalData: Partial<SessionStateData>
    ): Promise<WhatsAppSession> {
        const current = await this.prisma.whatsAppSession.findUniqueOrThrow({
            where: { id: sessionId },
        });

        const mergedData = {
            ...(current.stateData as SessionStateData),
            ...additionalData,
        };

        return this.updateSession(sessionId, {
            state: newState,
            stateData: mergedData,
        });
    }

    /**
     * Find session by phone number.
     */
    async findByPhoneNumber(phoneNumber: string): Promise<WhatsAppSession | null> {
        const session = await this.prisma.whatsAppSession.findUnique({
            where: { phoneNumber },
        });

        return session ? this.toSession(session) : null;
    }

    /**
     * Delete expired sessions (cleanup job).
     */
    async deleteExpiredSessions(): Promise<number> {
        const result = await this.prisma.whatsAppSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });
        return result.count;
    }

    /**
     * Convert Prisma model to domain type.
     */
    private toSession(dbSession: {
        id: string;
        phoneNumber: string;
        state: string;
        stateData: unknown;
        userId: string | null;
        currentShipmentId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date;
    }): WhatsAppSession {
        return {
            id: dbSession.id,
            phoneNumber: dbSession.phoneNumber,
            state: dbSession.state as WhatsAppState,
            stateData: (dbSession.stateData ?? {}) as SessionStateData,
            userId: dbSession.userId,
            currentShipmentId: dbSession.currentShipmentId,
            createdAt: dbSession.createdAt,
            updatedAt: dbSession.updatedAt,
            expiresAt: dbSession.expiresAt,
        };
    }
}
