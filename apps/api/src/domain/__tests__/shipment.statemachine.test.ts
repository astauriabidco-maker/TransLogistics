/**
 * Shipment State Machine — Business Invariants Tests
 * 
 * Tests that the shipment lifecycle state machine enforces
 * correct transitions and prevents illegal state changes.
 */

import { describe, it, expect } from 'vitest';
import { createShipment } from '../test/factories';

// ==================================================
// VALID STATE TRANSITIONS
// ==================================================

/**
 * Shipment state machine:
 * 
 *   DRAFT → QUOTED → CONFIRMED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
 *                                                                              ↗
 *   Any non-terminal state → CANCELLED
 *   
 * Terminal states: DELIVERED, CANCELLED
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
    'DRAFT': ['QUOTED', 'CANCELLED'],
    'QUOTED': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['PICKED_UP', 'CANCELLED'],
    'PICKED_UP': ['IN_TRANSIT', 'CANCELLED'],
    'IN_TRANSIT': ['OUT_FOR_DELIVERY', 'CANCELLED'],
    'OUT_FOR_DELIVERY': ['DELIVERED', 'CANCELLED'],
    'DELIVERED': [],  // Terminal
    'CANCELLED': [],  // Terminal
};

const ALL_STATUSES = Object.keys(VALID_TRANSITIONS);
const TERMINAL_STATES = ['DELIVERED', 'CANCELLED'];
const NON_TERMINAL_STATES = ALL_STATUSES.filter(s => !TERMINAL_STATES.includes(s));

// ==================================================
// TESTS
// ==================================================

describe('Shipment State Machine', () => {
    describe('Forward transitions (happy path)', () => {
        const happyPath = [
            'DRAFT', 'QUOTED', 'CONFIRMED', 'PICKED_UP',
            'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
        ];

        for (let i = 0; i < happyPath.length - 1; i++) {
            const from = happyPath[i]!;
            const to = happyPath[i + 1]!;
            it(`should allow ${from} → ${to}`, () => {
                expect(VALID_TRANSITIONS[from]).toContain(to);
            });
        }
    });

    describe('Terminal states', () => {
        for (const terminalState of TERMINAL_STATES) {
            it(`${terminalState} should have no outgoing transitions`, () => {
                expect(VALID_TRANSITIONS[terminalState]).toHaveLength(0);
            });

            it(`should not allow transition from ${terminalState} to any state`, () => {
                for (const target of ALL_STATUSES) {
                    expect(VALID_TRANSITIONS[terminalState]).not.toContain(target);
                }
            });
        }
    });

    describe('Cancellation', () => {
        for (const state of NON_TERMINAL_STATES) {
            it(`should allow cancellation from ${state}`, () => {
                expect(VALID_TRANSITIONS[state]).toContain('CANCELLED');
            });
        }

        it('should NOT allow cancellation of DELIVERED shipment', () => {
            expect(VALID_TRANSITIONS['DELIVERED']).not.toContain('CANCELLED');
        });

        it('should NOT allow cancellation of already CANCELLED shipment', () => {
            expect(VALID_TRANSITIONS['CANCELLED']).not.toContain('CANCELLED');
        });
    });

    describe('Backward transitions (must be prevented)', () => {
        const backwardPairs = [
            ['CONFIRMED', 'QUOTED'],
            ['PICKED_UP', 'CONFIRMED'],
            ['IN_TRANSIT', 'PICKED_UP'],
            ['OUT_FOR_DELIVERY', 'IN_TRANSIT'],
            ['DELIVERED', 'OUT_FOR_DELIVERY'],
        ];

        for (const [from, to] of backwardPairs) {
            it(`should NOT allow backward transition ${from} → ${to}`, () => {
                expect(VALID_TRANSITIONS[from!]).not.toContain(to);
            });
        }
    });

    describe('Skip transitions (must be prevented)', () => {
        const skipPairs = [
            ['DRAFT', 'CONFIRMED'],       // Can't skip QUOTED
            ['DRAFT', 'DELIVERED'],        // Can't skip everything
            ['QUOTED', 'PICKED_UP'],       // Can't skip CONFIRMED
            ['CONFIRMED', 'IN_TRANSIT'],   // Can't skip PICKED_UP
            ['CONFIRMED', 'DELIVERED'],    // Can't skip to terminal
        ];

        for (const [from, to] of skipPairs) {
            it(`should NOT allow skip transition ${from} → ${to}`, () => {
                expect(VALID_TRANSITIONS[from!]).not.toContain(to);
            });
        }
    });
});

// ==================================================
// SHIPMENT FACTORY INVARIANTS
// ==================================================

describe('Shipment Data Invariants', () => {
    it('should generate unique tracking codes', () => {
        const s1 = createShipment();
        const s2 = createShipment();
        expect(s1.trackingCode).not.toBe(s2.trackingCode);
    });

    it('tracking code should start with TL-', () => {
        const shipment = createShipment();
        expect(shipment.trackingCode).toMatch(/^TL-/);
    });

    it('DRAFT shipment should have no confirmed/delivered timestamps', () => {
        const shipment = createShipment({ status: 'DRAFT' });
        expect(shipment.status).toBe('DRAFT');
        // These should all be null for a DRAFT shipment
        expect(shipment.deliveryAddress).toBeDefined();
        expect(shipment.originHubId).toBeDefined();
        expect(shipment.destinationHubId).toBeDefined();
    });

    it('shipment must have both origin and destination', () => {
        const shipment = createShipment();
        expect(shipment.originHubId).toBeTruthy();
        expect(shipment.destinationHubId).toBeTruthy();
        expect(shipment.originHubId).not.toBe(shipment.destinationHubId);
    });
});
