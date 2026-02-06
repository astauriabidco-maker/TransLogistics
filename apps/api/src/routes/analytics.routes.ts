/**
 * Analytics API Routes
 * 
 * Internal analytics endpoints for decision-making.
 * Read-only access to aggregated performance data.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

// ==================================================
// TYPES
// ==================================================

interface AnalyticsFilters {
    startDate?: string;
    endDate?: string;
    hubId?: string;
    routeId?: string;
}

// ==================================================
// ROUTES LIST (for filter dropdowns)
// ==================================================

router.get('/routes', async (req: Request, res: Response) => {
    try {
        const routes = await prisma.route.findMany({
            where: { status: 'ACTIVE' },
            select: {
                id: true,
                code: true,
                originHub: { select: { code: true, name: true } },
                destinationHub: { select: { code: true, name: true } },
            },
            orderBy: { code: 'asc' },
        });

        res.json({
            data: routes,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch routes');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch routes' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// ROUTE MARGINS
// ==================================================

router.get('/route-margins', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, routeId } = req.query as AnalyticsFilters;

        const where: Record<string, unknown> = {};

        if (routeId) {
            where['routeId'] = routeId;
        }

        if (startDate || endDate) {
            where['periodDay'] = {};
            if (startDate) (where['periodDay'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['periodDay'] as Record<string, unknown>)['lte'] = new Date(endDate);
        } else {
            // Default: last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            where['periodDay'] = { gte: thirtyDaysAgo };
        }

        const snapshots = await prisma.routePerformanceSnapshot.findMany({
            where,
            orderBy: [{ periodDay: 'desc' }, { routeId: 'asc' }],
        });

        // Get route details for display
        const routeIds = [...new Set(snapshots.map(s => s.routeId))];
        const routes = await prisma.route.findMany({
            where: { id: { in: routeIds } },
            include: {
                originHub: { select: { code: true } },
                destinationHub: { select: { code: true } },
            },
        });
        const routeMap = new Map(routes.map(r => [r.id, r]));

        // Aggregate by route for summary
        const routeSummary = new Map<string, {
            code: string;
            origin: string;
            destination: string;
            totalRevenue: number;
            totalCost: number;
            totalMargin: number;
            shipmentCount: number;
            isComplete: boolean;
            daysWithData: number;
        }>();

        for (const snap of snapshots) {
            const route = routeMap.get(snap.routeId);
            if (!route) continue;

            const existing = routeSummary.get(snap.routeId) || {
                code: route.code,
                origin: route.originHub.code,
                destination: route.destinationHub.code,
                totalRevenue: 0,
                totalCost: 0,
                totalMargin: 0,
                shipmentCount: 0,
                isComplete: true,
                daysWithData: 0,
            };

            existing.totalRevenue += Number(snap.netRevenueXof);
            existing.totalCost += Number(snap.totalCostXof);
            existing.totalMargin += Number(snap.grossMarginXof);
            existing.shipmentCount += snap.shipmentCount;
            existing.isComplete = existing.isComplete && snap.isMarginComplete;
            existing.daysWithData++;

            routeSummary.set(snap.routeId, existing);
        }

        const summary = Array.from(routeSummary.entries()).map(([routeId, data]) => ({
            routeId,
            ...data,
            marginPercent: data.totalRevenue > 0
                ? ((data.totalMargin / data.totalRevenue) * 100).toFixed(1)
                : '0.0',
        }));

        // Sort by margin (highest first)
        summary.sort((a, b) => b.totalMargin - a.totalMargin);

        res.json({
            data: {
                summary,
                details: snapshots.map(s => ({
                    ...s,
                    route: routeMap.get(s.routeId),
                })),
            },
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                period: {
                    start: startDate || 'last 30 days',
                    end: endDate || 'now',
                },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch route margins');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch route margins' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// HUB PERFORMANCE
// ==================================================

router.get('/hub-performance', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, hubId } = req.query as AnalyticsFilters;

        const where: Record<string, unknown> = {};

        if (hubId) {
            where['hubId'] = hubId;
        }

        if (startDate || endDate) {
            where['periodDay'] = {};
            if (startDate) (where['periodDay'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['periodDay'] as Record<string, unknown>)['lte'] = new Date(endDate);
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            where['periodDay'] = { gte: thirtyDaysAgo };
        }

        const snapshots = await prisma.hubPerformanceSnapshot.findMany({
            where,
            orderBy: [{ periodDay: 'desc' }, { hubId: 'asc' }],
        });

        // Get hub details
        const hubIds = [...new Set(snapshots.map(s => s.hubId))];
        const hubs = await prisma.hub.findMany({
            where: { id: { in: hubIds } },
            select: { id: true, code: true, name: true, city: true },
        });
        const hubMap = new Map(hubs.map(h => [h.id, h]));

        // Aggregate by hub
        const hubSummary = new Map<string, {
            code: string;
            name: string;
            city: string;
            totalOriginated: number;
            totalReceived: number;
            totalScans: number;
            avgScanQuality: number;
            drivers: number;
            daysWithData: number;
        }>();

        for (const snap of snapshots) {
            const hub = hubMap.get(snap.hubId);
            if (!hub) continue;

            const existing = hubSummary.get(snap.hubId) || {
                code: hub.code,
                name: hub.name,
                city: hub.city,
                totalOriginated: 0,
                totalReceived: 0,
                totalScans: 0,
                avgScanQuality: 0,
                drivers: 0,
                daysWithData: 0,
            };

            existing.totalOriginated += snap.shipmentsOriginated;
            existing.totalReceived += snap.shipmentsReceived;
            existing.totalScans += snap.scanCount;
            existing.avgScanQuality += Number(snap.avgScanConfidence);
            existing.drivers = Math.max(existing.drivers, snap.activeDrivers);
            existing.daysWithData++;

            hubSummary.set(snap.hubId, existing);
        }

        const summary = Array.from(hubSummary.entries()).map(([hubId, data]) => ({
            hubId,
            ...data,
            avgScanQuality: data.daysWithData > 0
                ? (data.avgScanQuality / data.daysWithData).toFixed(1)
                : '0.0',
            throughput: data.totalOriginated + data.totalReceived,
        }));

        // Sort by throughput
        summary.sort((a, b) => b.throughput - a.throughput);

        res.json({
            data: {
                summary,
                details: snapshots.map(s => ({
                    ...s,
                    hub: hubMap.get(s.hubId),
                })),
            },
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch hub performance');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch hub performance' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// VOLUME METRICS
// ==================================================

router.get('/volume-metrics', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, routeId } = req.query as AnalyticsFilters;

        const where: Record<string, unknown> = {};

        if (routeId) {
            where['routeId'] = routeId;
        }

        if (startDate || endDate) {
            where['periodDay'] = {};
            if (startDate) (where['periodDay'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['periodDay'] as Record<string, unknown>)['lte'] = new Date(endDate);
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            where['periodDay'] = { gte: thirtyDaysAgo };
        }

        const snapshots = await prisma.volumeMetricsSnapshot.findMany({
            where,
            orderBy: [{ periodDay: 'desc' }],
        });

        // Calculate totals
        let totalDeclaredWeight = 0;
        let totalVolumetricWeight = 0;
        let totalPayableWeight = 0;
        let totalRevenueUplift = 0;
        let totalQuotes = 0;
        let volumetricWins = 0;

        for (const snap of snapshots) {
            totalDeclaredWeight += Number(snap.totalDeclaredWeightKg);
            totalVolumetricWeight += Number(snap.totalVolumetricWeightKg);
            totalPayableWeight += Number(snap.totalPayableWeightKg);
            totalRevenueUplift += Number(snap.revenueUpliftXof);
            totalQuotes += snap.quoteCount;
            volumetricWins += snap.volumetricWinCount;
        }

        const volumeScanImpact = {
            totalQuotes,
            volumetricWins,
            volumetricWinRate: totalQuotes > 0
                ? ((volumetricWins / totalQuotes) * 100).toFixed(1)
                : '0.0',
            avgWeightDelta: totalQuotes > 0
                ? ((totalPayableWeight - totalDeclaredWeight) / totalQuotes).toFixed(2)
                : '0.00',
            totalRevenueUplift: totalRevenueUplift.toFixed(0),
        };

        res.json({
            data: {
                summary: {
                    totalDeclaredWeightKg: totalDeclaredWeight.toFixed(1),
                    totalVolumetricWeightKg: totalVolumetricWeight.toFixed(1),
                    totalPayableWeightKg: totalPayableWeight.toFixed(1),
                },
                volumeScanImpact,
                details: snapshots,
            },
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch volume metrics');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch volume metrics' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// LEAD SOURCE PERFORMANCE
// ==================================================

router.get('/lead-sources', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query as AnalyticsFilters;

        const where: Record<string, unknown> = {};

        if (startDate || endDate) {
            where['periodDay'] = {};
            if (startDate) (where['periodDay'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['periodDay'] as Record<string, unknown>)['lte'] = new Date(endDate);
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            where['periodDay'] = { gte: thirtyDaysAgo };
        }

        const snapshots = await prisma.leadSourceSnapshot.findMany({
            where,
            orderBy: [{ periodDay: 'desc' }, { leadSource: 'asc' }],
        });

        // Aggregate by lead source
        const sourceSummary = new Map<string, {
            shipments: number;
            quotes: number;
            payments: number;
            revenue: number;
        }>();

        for (const snap of snapshots) {
            const existing = sourceSummary.get(snap.leadSource) || {
                shipments: 0,
                quotes: 0,
                payments: 0,
                revenue: 0,
            };

            existing.shipments += snap.shipmentCount;
            existing.quotes += snap.quoteCount;
            existing.payments += snap.paymentCount;
            existing.revenue += Number(snap.revenueXof);

            sourceSummary.set(snap.leadSource, existing);
        }

        const summary = Array.from(sourceSummary.entries()).map(([source, data]) => ({
            source,
            ...data,
            conversionRate: data.quotes > 0
                ? ((data.payments / data.quotes) * 100).toFixed(1)
                : '0.0',
            avgOrderValue: data.payments > 0
                ? (data.revenue / data.payments).toFixed(0)
                : '0',
        }));

        // Sort by revenue
        summary.sort((a, b) => b.revenue - a.revenue);

        // Calculate totals
        const totals = summary.reduce((acc, s) => ({
            shipments: acc.shipments + s.shipments,
            quotes: acc.quotes + s.quotes,
            payments: acc.payments + s.payments,
            revenue: acc.revenue + s.revenue,
        }), { shipments: 0, quotes: 0, payments: 0, revenue: 0 });

        res.json({
            data: {
                summary,
                totals,
                details: snapshots,
            },
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch lead sources');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch lead sources' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// EXECUTIVE SUMMARY (Dashboard Overview)
// ==================================================

router.get('/summary', async (req: Request, res: Response) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get route performance totals
        const routeSnapshots = await prisma.routePerformanceSnapshot.findMany({
            where: { periodDay: { gte: thirtyDaysAgo } },
        });

        let totalRevenue = 0;
        let totalCost = 0;
        let totalShipments = 0;
        let incompleteMargins = 0;

        for (const snap of routeSnapshots) {
            totalRevenue += Number(snap.netRevenueXof);
            totalCost += Number(snap.totalCostXof);
            totalShipments += snap.shipmentCount;
            if (!snap.isMarginComplete) incompleteMargins++;
        }

        const totalMargin = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

        // Get volume metrics
        const volumeSnapshots = await prisma.volumeMetricsSnapshot.findMany({
            where: { periodDay: { gte: thirtyDaysAgo } },
        });

        let volumeUplift = 0;
        let volumetricWins = 0;
        for (const snap of volumeSnapshots) {
            volumeUplift += Number(snap.revenueUpliftXof);
            volumetricWins += snap.volumetricWinCount;
        }

        // Get lead source distribution
        const leadSnapshots = await prisma.leadSourceSnapshot.findMany({
            where: { periodDay: { gte: thirtyDaysAgo } },
        });

        const leadTotals = new Map<string, number>();
        for (const snap of leadSnapshots) {
            leadTotals.set(
                snap.leadSource,
                (leadTotals.get(snap.leadSource) || 0) + Number(snap.revenueXof)
            );
        }

        const topSources = Array.from(leadTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([source, revenue]) => ({ source, revenue }));

        res.json({
            data: {
                period: '30 days',
                financials: {
                    totalRevenue: totalRevenue.toFixed(0),
                    totalCost: totalCost.toFixed(0),
                    grossMargin: totalMargin.toFixed(0),
                    marginPercent: marginPercent.toFixed(1),
                    dataQuality: {
                        totalSnapshots: routeSnapshots.length,
                        incompleteMargins,
                        completenessRate: routeSnapshots.length > 0
                            ? (((routeSnapshots.length - incompleteMargins) / routeSnapshots.length) * 100).toFixed(0)
                            : '0',
                    },
                },
                operations: {
                    totalShipments,
                    volumeScanUplift: volumeUplift.toFixed(0),
                    volumetricWins,
                },
                acquisition: {
                    topSources,
                },
            },
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch summary');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch summary' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

export default router;
