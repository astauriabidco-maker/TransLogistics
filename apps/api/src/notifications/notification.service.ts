/**
 * Notification Service
 *
 * Handles rendering templates, persisting notification records,
 * and dispatching through channel adapters (email for Phase 15).
 *
 * Usage:
 *   const notifier = new NotificationService(prisma);
 *   await notifier.send('userId', 'shipment_status_update', { trackingNumber: 'TL-001', status: 'DELIVERED' });
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import nodemailer from 'nodemailer';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface NotificationData {
    [key: string]: string | number | boolean | undefined;
}

interface ChannelAdapter {
    send(to: string, subject: string, body: string): Promise<void>;
}

// ──────────────────────────────────────────────────
// Template System (simple Handlebars-like {{key}})
// ──────────────────────────────────────────────────

function renderTemplate(template: string, data: NotificationData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = data[key];
        return value !== undefined ? String(value) : `{{${key}}}`;
    });
}

// ──────────────────────────────────────────────────
// Email Adapter (Nodemailer / Resend)
// ──────────────────────────────────────────────────

class EmailAdapter implements ChannelAdapter {
    private transporter: nodemailer.Transporter;

    constructor() {
        // Production: use Resend SMTP or custom SMTP
        // Development: use ethereal or local mailhog
        this.transporter = nodemailer.createTransport({
            host: process.env['SMTP_HOST'] || 'localhost',
            port: parseInt(process.env['SMTP_PORT'] || '1025'),
            secure: process.env['SMTP_SECURE'] === 'true',
            auth: process.env['SMTP_USER'] ? {
                user: process.env['SMTP_USER'],
                pass: process.env['SMTP_PASS'],
            } : undefined,
        });
    }

    async send(to: string, subject: string, body: string): Promise<void> {
        await this.transporter.sendMail({
            from: process.env['SMTP_FROM'] || 'TransLogistics <noreply@translogistics.io>',
            to,
            subject,
            html: body,
        });
    }
}

// ──────────────────────────────────────────────────
// Notification Service
// ──────────────────────────────────────────────────

export class NotificationService {
    private prisma: PrismaClient;
    private emailAdapter: EmailAdapter;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.emailAdapter = new EmailAdapter();
    }

    /**
     * Send a single notification to a user.
     */
    async send(
        userId: string,
        templateKey: string,
        data: NotificationData,
        recipientEmail?: string,
    ): Promise<{ id: string; status: string }> {
        // 1. Look up the template
        const template = await (this.prisma as any).notificationTemplate.findUnique({
            where: { key: templateKey },
        });

        if (!template || !template.active) {
            logger.warn({ templateKey }, 'Notification template not found or inactive');
            return { id: '', status: 'SKIPPED' };
        }

        // 2. Render subject + body
        const subject = renderTemplate(template.subject, data);
        const body = renderTemplate(template.body, data);

        // 3. Persist the notification record
        const notification = await (this.prisma as any).notification.create({
            data: {
                userId,
                channel: template.channel,
                templateKey,
                subject,
                body,
                status: 'PENDING',
            },
        });

        // 4. Dispatch through the appropriate channel adapter
        try {
            const email = recipientEmail || await this.resolveEmail(userId);

            if (!email) {
                throw new Error(`No email found for user ${userId}`);
            }

            if (template.channel === 'EMAIL') {
                await this.emailAdapter.send(email, subject, body);
            }
            // SMS and PUSH deferred to Phase 16

            // 5. Mark as sent
            await (this.prisma as any).notification.update({
                where: { id: notification.id },
                data: { status: 'SENT', sentAt: new Date() },
            });

            logger.info({ notificationId: notification.id, templateKey, userId }, 'Notification sent');
            return { id: notification.id, status: 'SENT' };
        } catch (error) {
            // 5b. Mark as failed
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await (this.prisma as any).notification.update({
                where: { id: notification.id },
                data: { status: 'FAILED', error: errorMessage },
            });

            logger.error({ error, notificationId: notification.id }, 'Notification dispatch failed');
            return { id: notification.id, status: 'FAILED' };
        }
    }

    /**
     * Send bulk notifications to multiple users.
     */
    async sendBulk(
        userIds: string[],
        templateKey: string,
        data: NotificationData,
    ): Promise<{ sent: number; failed: number }> {
        let sent = 0;
        let failed = 0;

        for (const userId of userIds) {
            const result = await this.send(userId, templateKey, data);
            if (result.status === 'SENT') sent++;
            else failed++;
        }

        logger.info({ templateKey, sent, failed, total: userIds.length }, 'Bulk notification complete');
        return { sent, failed };
    }

    /**
     * Look up user email from User table.
     */
    private async resolveEmail(userId: string): Promise<string | null> {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { email: true },
            });
            return user?.email || null;
        } catch {
            return null;
        }
    }
}

// ──────────────────────────────────────────────────
// Singleton factory
// ──────────────────────────────────────────────────

let _instance: NotificationService | null = null;

export function getNotificationService(prisma: PrismaClient): NotificationService {
    if (!_instance) {
        _instance = new NotificationService(prisma);
    }
    return _instance;
}

// ──────────────────────────────────────────────────
// Convenience: fire-and-forget notification
// ──────────────────────────────────────────────────

export function notifyUser(
    prisma: PrismaClient,
    userId: string,
    templateKey: string,
    data: NotificationData,
    email?: string,
): void {
    const svc = getNotificationService(prisma);
    svc.send(userId, templateKey, data, email).catch(err => {
        logger.error({ err, userId, templateKey }, 'Fire-and-forget notification failed (non-blocking)');
    });
}
