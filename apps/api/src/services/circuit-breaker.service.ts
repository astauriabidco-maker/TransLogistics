/**
 * Circuit Breaker Service
 *
 * Monitors automation module health and automatically disables modules
 * when error rates exceed thresholds. Provides self-healing by recording
 * events and enabling admin resolution.
 *
 * Integrates with AutomationGlobalConfig to persist disable state.
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino({ name: 'circuit-breaker' });

// ── Configurable Thresholds ──
const THRESHOLDS = {
    CONSECUTIVE_FAILURES: 5,        // Trip after N consecutive failures
    ERROR_RATE_PERCENT: 15,         // Trip if error rate exceeds 15% in window
    WINDOW_MINUTES: 30,             // Evaluation window
    MIN_SAMPLES: 10,                // Minimum evaluations before rate applies
};

interface CircuitCheckInput {
    module: string;       // SCAN, PRICING, DISPATCH, FRAUD
    scope: string;        // "global" | hubId | routeId
    success: boolean;     // Did the last evaluation succeed?
    metric?: string;      // Optional description of what was measured
}

interface InMemoryState {
    consecutiveFailures: number;
    recentResults: { success: boolean; timestamp: number }[];
}

// In-memory sliding window per module+scope
const stateMap = new Map<string, InMemoryState>();

function getState(key: string): InMemoryState {
    if (!stateMap.has(key)) {
        stateMap.set(key, { consecutiveFailures: 0, recentResults: [] });
    }
    return stateMap.get(key)!;
}

export class CircuitBreakerService {
    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Record a decision outcome and check if the circuit should trip.
     * Called after each governance service evaluation.
     */
    async recordAndCheck(input: CircuitCheckInput): Promise<{ tripped: boolean; reason?: string }> {
        const key = `${input.module}:${input.scope}`;
        const state = getState(key);
        const now = Date.now();
        const windowMs = THRESHOLDS.WINDOW_MINUTES * 60 * 1000;

        // ── Update state ──
        if (input.success) {
            state.consecutiveFailures = 0;
        } else {
            state.consecutiveFailures++;
        }

        // Add to sliding window and prune old entries
        state.recentResults.push({ success: input.success, timestamp: now });
        state.recentResults = state.recentResults.filter(r => now - r.timestamp < windowMs);

        // ── Check 1: Consecutive failures ──
        if (state.consecutiveFailures >= THRESHOLDS.CONSECUTIVE_FAILURES) {
            const reason = `${state.consecutiveFailures} consecutive failures (threshold: ${THRESHOLDS.CONSECUTIVE_FAILURES})`;
            await this.trip(input, reason, state.consecutiveFailures, THRESHOLDS.CONSECUTIVE_FAILURES, 'consecutive_failures');
            state.consecutiveFailures = 0; // Reset after tripping
            return { tripped: true, reason };
        }

        // ── Check 2: Error rate in window ──
        if (state.recentResults.length >= THRESHOLDS.MIN_SAMPLES) {
            const failures = state.recentResults.filter(r => !r.success).length;
            const errorRate = (failures / state.recentResults.length) * 100;

            if (errorRate > THRESHOLDS.ERROR_RATE_PERCENT) {
                const reason = `Error rate ${errorRate.toFixed(1)}% exceeds ${THRESHOLDS.ERROR_RATE_PERCENT}% (${failures}/${state.recentResults.length} in ${THRESHOLDS.WINDOW_MINUTES}min)`;
                await this.trip(input, reason, errorRate, THRESHOLDS.ERROR_RATE_PERCENT, 'error_rate_exceeded');
                state.recentResults = []; // Reset window after trip
                return { tripped: true, reason };
            }
        }

        return { tripped: false };
    }

    /**
     * Trip the circuit breaker: disable the module and record the event.
     */
    private async trip(
        input: CircuitCheckInput,
        reason: string,
        actual: number,
        threshold: number,
        trigger: string,
    ): Promise<void> {
        // ── 1. Record the event ──
        await this.prisma.circuitBreakerEvent.create({
            data: {
                module: input.module,
                scope: input.scope,
                trigger,
                metric: input.metric || trigger,
                threshold,
                actual,
                action: input.scope === 'global' ? 'DISABLE_MODULE' : `DISABLE_${input.scope.includes('hub') ? 'HUB' : 'ROUTE'}`,
            },
        });

        // ── 2. Disable the module globally via AutomationGlobalConfig ──
        if (input.scope === 'global') {
            await this.prisma.automationGlobalConfig.upsert({
                where: { module: input.module },
                update: {
                    enabled: false,
                    reason: `Circuit breaker tripped: ${reason}`,
                    updatedBy: 'circuit-breaker',
                },
                create: {
                    module: input.module,
                    enabled: false,
                    reason: `Circuit breaker tripped: ${reason}`,
                    updatedBy: 'circuit-breaker',
                },
            });
        }

        // ── 3. Audit log ──
        await this.prisma.auditLog.create({
            data: {
                entityType: 'CIRCUIT_BREAKER',
                entityId: `${input.module}:${input.scope}`,
                action: 'CIRCUIT_TRIPPED',
                performedById: 'circuit-breaker',
                performedByRole: 'SYSTEM',
                changes: {
                    module: input.module,
                    scope: input.scope,
                    trigger,
                    actual,
                    threshold,
                    reason,
                },
            },
        });

        logger.error({
            audit: true,
            module: input.module,
            scope: input.scope,
            trigger,
            actual,
            threshold,
            reason,
        }, `🚨 [CIRCUIT BREAKER] Module ${input.module} DISABLED — ${reason}`);
    }

    /**
     * Resolve an open circuit breaker event (admin action).
     */
    async resolve(eventId: string, resolvedBy: string): Promise<void> {
        await this.prisma.circuitBreakerEvent.update({
            where: { id: eventId },
            data: {
                resolvedAt: new Date(),
                resolvedBy,
            },
        });

        logger.info({
            audit: true,
            eventId,
            resolvedBy,
        }, `[CIRCUIT BREAKER] Event ${eventId} resolved by ${resolvedBy}`);
    }

    /**
     * Get recent circuit breaker events for UI display.
     */
    async getRecentEvents(limit = 20) {
        return this.prisma.circuitBreakerEvent.findMany({
            orderBy: { triggeredAt: 'desc' },
            take: limit,
        });
    }
}

// ── Singleton & Convenience ──

let instance: CircuitBreakerService | null = null;

export function getCircuitBreaker(prisma: PrismaClient): CircuitBreakerService {
    if (!instance) {
        instance = new CircuitBreakerService(prisma);
    }
    return instance;
}

/**
 * Fire-and-forget convenience: report a governance decision result.
 * Call after evaluate() in route handler or middleware.
 *
 * @example
 *   const decision = await scanService.evaluate(scan);
 *   reportToCircuitBreaker(prisma, 'SCAN', scan.hubId ?? 'global', decision.decision === 'AUTO_VALIDATE');
 */
export function reportToCircuitBreaker(
    prisma: PrismaClient,
    module: string,
    scope: string,
    success: boolean,
): void {
    const cb = getCircuitBreaker(prisma);
    cb.recordAndCheck({ module, scope, success }).catch(err => {
        logger.error({ err, module, scope }, 'Circuit breaker report failed (non-blocking)');
    });
}
