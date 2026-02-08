import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/db';
import { connectRedis, disconnectRedis } from './lib/redis';
import { httpLogger, errorLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalRateLimiter, webhookRateLimiter, adminRateLimiter, adminPerUserRateLimiter } from './middleware/rate-limiter';
import {
    getCorsOptions,
    getHelmetOptions,
    requestIdMiddleware,
    webhookCircuitBreaker,
} from './middleware/security';
import { authenticate } from './middleware/auth.middleware';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import automationRoutes from './routes/automation.routes';
import autonomyRoutes from './routes/autonomy.routes';
import shipmentRoutes from './shipment/shipment.routes';
import trackingRoutes from './routes/tracking.routes';
import { purchaseRequestRoutes, supplierOrderRoutes, consolidationRoutes } from './shop-ship';
import { webhookRouter, getPaymentService, createCinetPayAdapter, createStripeAdapter } from './payments';
import driverRoutes from './dispatch/driver.routes';
import { createWhatsAppRouter } from './whatsapp/webhook.handler';
import { prisma } from './lib/prisma';
import { startPaymentCron, stopPaymentCron } from './cron/payment.cron';
import { setupSwagger } from './config/swagger';

/**
 * TransLogistics API Server
 * 
 * Entry point for the Node.js API layer.
 */

const app = express();

// ==================================================
// MIDDLEWARE
// ==================================================

// Request ID (must be first)
app.use(requestIdMiddleware);

// Security
app.use(helmet(getHelmetOptions()));
app.use(cors(getCorsOptions()));

// Rate Limiting (global)
app.use(globalRateLimiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// ==================================================
// WEBHOOKS (must be before JSON parsing for raw body)
// ==================================================

// Payment webhooks need raw body for signature verification
app.use('/webhooks', webhookRateLimiter, webhookCircuitBreaker(), express.raw({ type: 'application/json' }), webhookRouter);

// WhatsApp webhook
app.use('/whatsapp', webhookRateLimiter, createWhatsAppRouter(prisma));

// Logging
app.use(httpLogger);

// ==================================================
// API DOCUMENTATION
// ==================================================

setupSwagger(app);

// ==================================================
// ROUTES — Public
// ==================================================

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tracking', trackingRoutes);

// ==================================================
// JWT AUTHENTICATION — Applied globally after public routes
// ==================================================

app.use(authenticate);

// ==================================================
// ROUTES — Protected
// ==================================================

app.use('/api/admin', adminRateLimiter, adminPerUserRateLimiter, adminRoutes);
app.use('/api/admin/automation', adminRateLimiter, adminPerUserRateLimiter, automationRoutes);
app.use('/api/admin/autonomy', adminRateLimiter, adminPerUserRateLimiter, autonomyRoutes);
app.use('/api/analytics', adminRateLimiter, adminPerUserRateLimiter, analyticsRoutes);
app.use('/api/shipments', shipmentRoutes);

// Shop & Ship module
app.use('/api/shop-ship/requests', purchaseRequestRoutes);
app.use('/api/shop-ship/supplier-orders', supplierOrderRoutes);
app.use('/api/shop-ship/consolidation', consolidationRoutes);

// Driver mobile app
app.use('/api/driver', driverRoutes);

// API v1 routes will be mounted here
// app.use('/api/v1/shipments', shipmentRoutes);
// app.use('/api/v1/quotes', quoteRoutes);
// etc.

// ==================================================
// ERROR HANDLING
// ==================================================

app.use(notFoundHandler);
app.use(errorLogger);
app.use(errorHandler);

// ==================================================
// SERVER LIFECYCLE
// ==================================================

async function start(): Promise<void> {
    try {
        logger.info({ env: env.NODE_ENV }, 'Starting TransLogistics API...');

        // Connect to infrastructure
        await connectDatabase();
        await connectRedis();

        // Initialize payment adapters
        const paymentService = getPaymentService(prisma);
        paymentService.registerAdapter(createCinetPayAdapter());
        paymentService.registerAdapter(createStripeAdapter());
        logger.info('Payment adapters registered');

        // Start HTTP server
        const server = app.listen(env.PORT, () => {
            logger.info(
                { port: env.PORT, env: env.NODE_ENV },
                `TransLogistics API listening on port ${env.PORT}`
            );
        });

        // Start cron jobs
        startPaymentCron();

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info({ signal }, 'Received shutdown signal');

            server.close(async () => {
                logger.info('HTTP server closed');

                stopPaymentCron();
                await disconnectRedis();
                await disconnectDatabase();

                logger.info('Graceful shutdown complete');
                process.exit(0);
            });

            // Force exit after 30 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        logger.fatal({ error }, 'Failed to start API server');
        process.exit(1);
    }
}

start();

export { app };
