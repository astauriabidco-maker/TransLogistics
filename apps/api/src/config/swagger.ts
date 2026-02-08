/**
 * Swagger / OpenAPI Configuration
 *
 * Generates OpenAPI 3.0 spec from JSDoc annotations in route files.
 * Serves interactive API docs at /api-docs.
 */

import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { logger } from '../lib/logger';

const swaggerOptions: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TransLogistics API',
            version: '1.0.0',
            description: `
Multi-hub logistics platform API for the West African market.

## Authentication
Most endpoints require a JWT Bearer token. Obtain one via \`POST /api/auth/login\`.

## Modules
- **Shipments** — Create, track, and manage shipments
- **Analytics** — Route margins, hub performance, volume metrics
- **Autonomy** — Automation governance and transparency
- **Admin** — Hub management, pricing, dispatch
- **Shop & Ship** — Purchase request pipeline
- **Tracking** — Public shipment tracking

## Rate Limiting
API requests are rate-limited per IP and per user.
            `.trim(),
            contact: {
                name: 'TransLogistics API Support',
                email: 'api@translogistics.io',
            },
        },
        servers: [
            {
                url: 'http://localhost:3001',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT access token',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string', example: 'INTERNAL_ERROR' },
                                message: { type: 'string', example: 'An unexpected error occurred' },
                            },
                        },
                        meta: {
                            type: 'object',
                            properties: {
                                requestId: { type: 'string' },
                                timestamp: { type: 'string', format: 'date-time' },
                            },
                        },
                    },
                },
                Meta: {
                    type: 'object',
                    properties: {
                        requestId: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Health', description: 'Service health checks' },
            { name: 'Auth', description: 'Authentication (login, register, tokens)' },
            { name: 'Tracking', description: 'Public shipment tracking (no auth)' },
            { name: 'Shipments', description: 'Shipment management' },
            { name: 'Analytics', description: 'Business analytics and reporting' },
            { name: 'Autonomy', description: 'Automation governance transparency' },
            { name: 'Admin', description: 'Administrative operations' },
            { name: 'Shop & Ship', description: 'Purchase request pipeline' },
        ],
    },
    apis: [
        './src/routes/*.ts',
        './src/routes/*.routes.ts',
        './src/shipment/*.routes.ts',
        './src/dispatch/*.routes.ts',
        './src/shop-ship/*.routes.ts',
    ],
};

export function setupSwagger(app: Express): void {
    try {
        const swaggerSpec = swaggerJsdoc(swaggerOptions);

        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
            customCss: `
                .swagger-ui .topbar { background-color: #0f3460; }
                .swagger-ui .info .title { color: #0f3460; }
            `,
            customSiteTitle: 'TransLogistics API Docs',
        }));

        // Serve raw spec as JSON
        app.get('/api-docs.json', (_req, res) => {
            res.json(swaggerSpec);
        });

        logger.info('Swagger UI available at /api-docs');
    } catch (error) {
        logger.warn({ error }, 'Failed to setup Swagger — swagger-jsdoc or swagger-ui-express may not be installed');
    }
}
