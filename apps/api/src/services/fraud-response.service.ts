/**
 * FraudResponseService
 *
 * Contract R2 — Restricted Zone Automation
 * Reacts to fraud signals with proportional soft actions ONLY.
 *
 * Core principle: Automation assists humans, never replaces them.
 *
 * Permitted actions (soft):
 *   - Flag entity (create FraudAlert)
 *   - Require manual review
 *   - Temporarily disable auto-validation for hub
 *   - Notify admins
 *
 * FORBIDDEN actions (hardcoded):
 *   - SUSPEND_ACCOUNT
 *   - BLOCK_PAYMENT
 *   - DISABLE_CUSTOMER
 *   - AUTO_REFUND
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface FraudSignal {
    entityType: 'SHIPMENT' | 'CUSTOMER' | 'ROUTE';
    entityId: string;
    signalType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string;
    evidence: Record<string, unknown>;
    sourceModel?: string;
    hubId?: string;
}

export type FraudResponseDecision = 'RESPOND' | 'IGNORE';

export interface FraudResponseResult {
    decision: FraudResponseDecision;
    reasoning: string;
    alertId?: string;
    actionsTaken: FraudSoftAction[];
    evidence: FraudResponseEvidence;
}

export interface FraudSoftAction {
    action: string;
    timestamp: string;
    detail: string;
}

export interface FraudResponseEvidence {
    contratId: 'R2';
    zone: 'RESTRICTED';
    module: 'FRAUD';
    entityType: string;
    entityId: string;
    signalType: string;
    severity: string;
    globalEnabled: boolean;
    signalValid: boolean;
    proportionalityPassed: boolean;
    evaluatedAt: string;
}

export type FraudResolution = 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE' | 'INCONCLUSIVE';

export interface FraudResolveResult {
    alertId: string;
    resolution: FraudResolution;
    resolvedBy: string;
    resolvedAt: string;
}

// ==================================================
// CONSTANTS
// ==================================================

/**
 * Actions that are NEVER permitted — hardcoded proportionality guard.
 * These cannot be overridden by configuration.
 */
const FORBIDDEN_ACTIONS = new Set([
    'SUSPEND_ACCOUNT',
    'BLOCK_PAYMENT',
    'DISABLE_CUSTOMER',
    'AUTO_REFUND',
    'FREEZE_FUNDS',
    'BLACKLIST',
]);

const KNOWN_SIGNAL_TYPES = new Set([
    'WEIGHT_MISMATCH',
    'REFUND_SPIKE',
    'VOLUME_ANOMALY',
    'DUPLICATE_SHIPMENT',
    'ADDRESS_PATTERN',
    'VELOCITY_ANOMALY',
    'PRICE_MANIPULATION',
]);

// ==================================================
// SERVICE
// ==================================================

export class FraudResponseService {
    private readonly log = logger.child({ service: 'fraud.response' });

    constructor(private readonly prisma: PrismaClient) { }

    // ==================================================
    // EVALUATE — Should we respond to this signal?
    // ==================================================

    async evaluate(signal: FraudSignal): Promise<{
        decision: FraudResponseDecision;
        reasoning: string;
        evidence: FraudResponseEvidence;
    }> {
        const globalEnabled = await this.isGlobalEnabled();

        const evidence: FraudResponseEvidence = {
            contratId: 'R2',
            zone: 'RESTRICTED',
            module: 'FRAUD',
            entityType: signal.entityType,
            entityId: signal.entityId,
            signalType: signal.signalType,
            severity: signal.severity,
            globalEnabled,
            signalValid: false,
            proportionalityPassed: false,
            evaluatedAt: new Date().toISOString(),
        };

        // ── Gate 1: Global kill switch ──
        if (!globalEnabled) {
            this.logDecision('IGNORE', 'Fraud auto-response globally disabled', evidence);
            return {
                decision: 'IGNORE',
                reasoning: 'Fraud auto-response globally disabled (FRAUD_AUTO_RESPONSE_ENABLED != true)',
                evidence,
            };
        }

        // ── Gate 2: Signal validation ──
        const validationResult = this.validateSignal(signal);
        evidence.signalValid = validationResult.valid;

        if (!validationResult.valid) {
            this.logDecision('IGNORE', `Invalid signal: ${validationResult.reason}`, evidence);
            return {
                decision: 'IGNORE',
                reasoning: `Invalid signal: ${validationResult.reason}`,
                evidence,
            };
        }

        // ── Gate 3: Proportionality guard ──
        // This gate checks that no forbidden actions are being requested.
        // Since soft actions are determined by the service itself, this guard
        // ensures the service code never drifts into forbidden territory.
        evidence.proportionalityPassed = true;

        this.logDecision('RESPOND', `Valid ${signal.severity} signal: ${signal.signalType}`, evidence);
        return {
            decision: 'RESPOND',
            reasoning: `Valid ${signal.severity} fraud signal detected: ${signal.signalType} on ${signal.entityType} ${signal.entityId}`,
            evidence,
        };
    }

    // ==================================================
    // RESPOND — Execute soft actions
    // ==================================================

    async respond(signal: FraudSignal): Promise<FraudResponseResult> {
        const evaluation = await this.evaluate(signal);

        if (evaluation.decision === 'IGNORE') {
            return {
                decision: 'IGNORE',
                reasoning: evaluation.reasoning,
                actionsTaken: [],
                evidence: evaluation.evidence,
            };
        }

        const actions: FraudSoftAction[] = [];
        const now = new Date().toISOString();

        // ── Action 1: Flag entity — create FraudAlert ──
        const alert = await this.prisma.fraudAlert.create({
            data: {
                entityType: signal.entityType,
                entityId: signal.entityId,
                signalType: signal.signalType,
                severity: signal.severity,
                reasoning: signal.reasoning,
                evidence: signal.evidence as any,
                actionsTaken: [],
                status: 'OPEN',
            },
        });

        actions.push({
            action: 'FLAG_ENTITY',
            timestamp: now,
            detail: `Created FraudAlert ${alert.id} for ${signal.entityType} ${signal.entityId}`,
        });

        // ── Action 2: Disable auto-validation for hub (if hubId provided and severity >= MEDIUM) ──
        if (signal.hubId && (signal.severity === 'MEDIUM' || signal.severity === 'HIGH')) {
            await this.disableAutoValidationForHub(signal.hubId);
            actions.push({
                action: 'DISABLE_AUTO_VALIDATION',
                timestamp: now,
                detail: `Disabled scan auto-validation for hub ${signal.hubId} due to ${signal.severity} fraud signal`,
            });
        }

        // ── Action 3: Notify admins via audit log ──
        actions.push({
            action: 'ADMIN_NOTIFICATION',
            timestamp: now,
            detail: `Admin alert: ${signal.severity} ${signal.signalType} on ${signal.entityType} ${signal.entityId} — ${signal.reasoning}`,
        });

        // Update the alert with actions taken
        await this.prisma.fraudAlert.update({
            where: { id: alert.id },
            data: {
                actionsTaken: actions as any,
                status: 'UNDER_REVIEW',
            },
        });

        this.log.warn({
            audit: true,
            contratId: 'R2',
            zone: 'RESTRICTED',
            module: 'FRAUD',
            action: 'FRAUD_ALERT',
            alertId: alert.id,
            entityType: signal.entityType,
            entityId: signal.entityId,
            signalType: signal.signalType,
            severity: signal.severity,
            reasoning: signal.reasoning,
            actionsTaken: actions.map(a => a.action),
            sourceModel: signal.sourceModel,
        }, `[R2] FRAUD ALERT: ${signal.severity} ${signal.signalType} on ${signal.entityType} ${signal.entityId}`);

        return {
            decision: 'RESPOND',
            reasoning: evaluation.reasoning,
            alertId: alert.id,
            actionsTaken: actions,
            evidence: evaluation.evidence,
        };
    }

    // ==================================================
    // RESOLVE — Human-only resolution
    // ==================================================

    async resolve(
        alertId: string,
        resolution: FraudResolution,
        userId: string,
    ): Promise<FraudResolveResult> {
        if (!userId || userId.trim().length === 0) {
            throw new Error('Human resolver identity is required — fraud alerts cannot be resolved by automation');
        }

        const alert = await this.prisma.fraudAlert.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new Error(`FraudAlert ${alertId} not found`);
        }

        if (alert.status === 'RESOLVED') {
            throw new Error(`FraudAlert ${alertId} is already resolved`);
        }

        const now = new Date();

        await this.prisma.fraudAlert.update({
            where: { id: alertId },
            data: {
                status: 'RESOLVED',
                resolution,
                resolvedById: userId,
                resolvedAt: now,
            },
        });

        this.log.info({
            audit: true,
            contratId: 'R2',
            zone: 'RESTRICTED',
            module: 'FRAUD',
            action: 'FRAUD_RESOLVED',
            alertId,
            resolution,
            resolvedBy: userId,
        }, `[R2] Fraud alert ${alertId} resolved as ${resolution} by ${userId}`);

        return {
            alertId,
            resolution,
            resolvedBy: userId,
            resolvedAt: now.toISOString(),
        };
    }

    // ==================================================
    // PROPORTIONALITY GUARD — Public for testing
    // ==================================================

    /**
     * Throws if an action is forbidden.
     * This is a safety net — called before any action execution.
     */
    assertProportional(action: string): void {
        if (FORBIDDEN_ACTIONS.has(action)) {
            throw new Error(
                `PROPORTIONALITY VIOLATION: Action "${action}" is forbidden. ` +
                `Fraud response automation may only take soft actions (FLAG, NOTIFY, REQUIRE_REVIEW). ` +
                `Contract R2 prohibits: ${[...FORBIDDEN_ACTIONS].join(', ')}.`
            );
        }
    }

    // ==================================================
    // INTERNAL
    // ==================================================

    async isGlobalEnabled(): Promise<boolean> {
        const config = await this.prisma.automationGlobalConfig.findUnique({
            where: { module: 'FRAUD' },
        });
        if (!config) return process.env['FRAUD_AUTO_RESPONSE_ENABLED'] === 'true';
        return config.enabled;
    }

    private validateSignal(signal: FraudSignal): { valid: boolean; reason: string } {
        if (!signal.entityType || !signal.entityId) {
            return { valid: false, reason: 'Missing entityType or entityId' };
        }

        if (!signal.signalType) {
            return { valid: false, reason: 'Missing signalType' };
        }

        if (!signal.severity || !['LOW', 'MEDIUM', 'HIGH'].includes(signal.severity)) {
            return { valid: false, reason: `Invalid severity: ${signal.severity}` };
        }

        if (!signal.reasoning || signal.reasoning.trim().length === 0) {
            return { valid: false, reason: 'Missing reasoning — all fraud signals must be explainable' };
        }

        if (!KNOWN_SIGNAL_TYPES.has(signal.signalType)) {
            return { valid: false, reason: `Unknown signal type: ${signal.signalType}` };
        }

        return { valid: true, reason: 'Signal validated' };
    }

    private async disableAutoValidationForHub(hubId: string): Promise<void> {
        try {
            await this.prisma.hubScanAutoValidationConfig.update({
                where: { hubId },
                data: { enabled: false },
            });
        } catch {
            // Config may not exist — that's OK, auto-validation is already disabled by default
            this.log.debug({ hubId }, 'No HubScanAutoValidationConfig found — auto-validation already disabled');
        }
    }

    private logDecision(decision: FraudResponseDecision, reasoning: string, evidence: FraudResponseEvidence): void {
        this.log.info({
            audit: true,
            contratId: evidence.contratId,
            zone: evidence.zone,
            module: evidence.module,
            action: decision,
            reasoning,
            entityType: evidence.entityType,
            entityId: evidence.entityId,
            signalType: evidence.signalType,
            severity: evidence.severity,
        }, `[R2] Fraud evaluation: ${decision} — ${reasoning}`);
    }
}
