/**
 * Lead Source Aggregator
 * 
 * Computes daily lead source metrics from:
 * - Shipments (with leadSource attribution)
 * - Quotes (generated)
 * - Payments (completed)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AggregationResult } from './analytics.service';
import { Prisma, type LeadSource } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

// LeadSource values (defined here until prisma client is regenerated)
const LEAD_SOURCES: LeadSource[] = [
    'WHATSAPP_CTA',
    'WHATSAPP_DIRECT',
    'WEB',
    'REFERRAL',
    'B2B_CONTACT',
    'AGENT_ONBOARDING',
    'UNKNOWN',
] as LeadSource[];

/**
 * Aggregate lead source attribution for a specific date.
 * Tracks conversion funnel by source.
 */
export async function aggregateLeadSources(
    targetDate: Date
): Promise<AggregationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let recordsProcessed = 0;
    let snapshotsCreated = 0;

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Use defined lead sources (will match Prisma enum after regeneration)
    const leadSources = LEAD_SOURCES;

    for (const leadSource of leadSources) {
        try {
            // Count shipments created with this lead source
            const shipmentsCreated = await prisma.shipment.count({
                where: {
                    leadSource,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Count quotes generated for shipments with this lead source
            const quotesGenerated = await prisma.quote.count({
                where: {
                    shipment: {
                        leadSource,
                    },
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Count confirmed shipments
            const shipmentsConfirmed = await prisma.shipment.count({
                where: {
                    leadSource,
                    status: { in: ['CREATED', 'RECEIVED_AT_HUB', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
                    confirmedAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Count and sum completed payments
            const payments = await prisma.payment.findMany({
                where: {
                    shipment: {
                        leadSource,
                    },
                    status: 'CONFIRMED',
                    confirmedAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                select: {
                    amountXof: true,
                },
            });

            const paymentsCompleted = payments.length;
            let totalRevenueXof = new Decimal(0);
            for (const payment of payments) {
                totalRevenueXof = totalRevenueXof.add(payment.amountXof);
            }

            recordsProcessed += shipmentsCreated + quotesGenerated + shipmentsConfirmed + paymentsCompleted;

            // Skip if no activity
            if (shipmentsCreated === 0 && quotesGenerated === 0 && shipmentsConfirmed === 0 && paymentsCompleted === 0) {
                continue;
            }

            // Calculate conversion rates
            // Note: leadsInitiated is approximated as shipmentsCreated (DRAFT state)
            const leadsInitiated = shipmentsCreated;

            const leadToQuoteRate = leadsInitiated > 0
                ? new Decimal(quotesGenerated).div(leadsInitiated)
                : new Decimal(0);

            const quoteToShipmentRate = quotesGenerated > 0
                ? new Decimal(shipmentsConfirmed).div(quotesGenerated)
                : new Decimal(0);

            const overallConversionRate = leadsInitiated > 0
                ? new Decimal(paymentsCompleted).div(leadsInitiated)
                : new Decimal(0);

            // Upsert snapshot
            await prisma.leadSourceSnapshot.upsert({
                where: {
                    leadSource_periodDay: {
                        leadSource,
                        periodDay: startOfDay,
                    },
                },
                create: {
                    leadSource,
                    periodDay: startOfDay,
                    leadsInitiated,
                    quotesGenerated,
                    shipmentsConfirmed,
                    paymentsCompleted,
                    leadToQuoteRate,
                    quoteToShipmentRate,
                    overallConversionRate,
                    totalRevenueXof,
                },
                update: {
                    leadsInitiated,
                    quotesGenerated,
                    shipmentsConfirmed,
                    paymentsCompleted,
                    leadToQuoteRate,
                    quoteToShipmentRate,
                    overallConversionRate,
                    totalRevenueXof,
                    computedAt: new Date(),
                },
            });

            snapshotsCreated++;
        } catch (error) {
            const msg = `LeadSource ${leadSource}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(msg);
            logger.error({ leadSource, error: msg }, 'Lead source aggregation failed');
        }
    }

    return {
        success: errors.length === 0,
        recordsProcessed,
        snapshotsCreated,
        errors,
        durationMs: Date.now() - startTime,
    };
}
