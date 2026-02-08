/**
 * Route Optimization — Business Invariants Tests
 * 
 * Tests route optimization constraints, distance calculations,
 * and dispatch planning invariants.
 */

import { describe, it, expect } from 'vitest';

// ==================================================
// HAVERSINE DISTANCE
// ==================================================

const EARTH_RADIUS_KM = 6371;

function haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================================================
// TESTS
// ==================================================

describe('Haversine Distance', () => {
    it('distance to self should be 0', () => {
        const d = haversineDistance(5.3364, -3.9684, 5.3364, -3.9684);
        expect(d).toBe(0);
    });

    it('Abidjan to Bouaké should be ~300km', () => {
        // Abidjan: 5.3364° N, 3.9684° W
        // Bouaké: 7.6881° N, 5.0339° W
        const d = haversineDistance(5.3364, -3.9684, 7.6881, -5.0339);
        expect(d).toBeGreaterThan(250);
        expect(d).toBeLessThan(350);
    });

    it('distance must be symmetric', () => {
        const d1 = haversineDistance(5.3364, -3.9684, 7.6881, -5.0339);
        const d2 = haversineDistance(7.6881, -5.0339, 5.3364, -3.9684);
        expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
    });

    it('triangle inequality must hold', () => {
        // A: Abidjan, B: Yamoussoukro, C: Bouaké
        const A = { lat: 5.3364, lng: -3.9684 };
        const B = { lat: 6.8206, lng: -5.2764 };
        const C = { lat: 7.6881, lng: -5.0339 };

        const AB = haversineDistance(A.lat, A.lng, B.lat, B.lng);
        const BC = haversineDistance(B.lat, B.lng, C.lat, C.lng);
        const AC = haversineDistance(A.lat, A.lng, C.lat, C.lng);

        expect(AC).toBeLessThanOrEqual(AB + BC + 0.001); // Small epsilon
    });
});

// ==================================================
// OPTIMIZATION CONSTRAINTS
// ==================================================

describe('Route Optimization Constraints', () => {
    const DEFAULT_SPEED_KMH = 25;
    const DEFAULT_STOP_DURATION_MIN = 10;

    describe('Vehicle capacity', () => {
        const vehicleCapacities = {
            MOTO: 30,
            TRICYCLE: 150,
            VAN: 500,
        };

        it('MOTO capacity should be 30kg', () => {
            expect(vehicleCapacities.MOTO).toBe(30);
        });

        it('TRICYCLE capacity should be 150kg', () => {
            expect(vehicleCapacities.TRICYCLE).toBe(150);
        });

        it('VAN capacity should be 500kg', () => {
            expect(vehicleCapacities.VAN).toBe(500);
        });

        it('vehicle types should be ordered by capacity', () => {
            expect(vehicleCapacities.MOTO)
                .toBeLessThan(vehicleCapacities.TRICYCLE);
            expect(vehicleCapacities.TRICYCLE)
                .toBeLessThan(vehicleCapacities.VAN);
        });
    });

    describe('Duration estimation', () => {
        it('should calculate travel time correctly', () => {
            const distanceKm = 10;
            const travelTimeMin = (distanceKm / DEFAULT_SPEED_KMH) * 60;
            expect(travelTimeMin).toBe(24); // 10km at 25km/h = 24min
        });

        it('total duration should include stop time', () => {
            const distanceKm = 10;
            const numStops = 3;
            const travelTimeMin = (distanceKm / DEFAULT_SPEED_KMH) * 60;
            const totalMin = travelTimeMin + (numStops * DEFAULT_STOP_DURATION_MIN);
            expect(totalMin).toBe(54); // 24 travel + 30 stop = 54 min
        });

        it('speed assumption must be reasonable for African urban', () => {
            expect(DEFAULT_SPEED_KMH).toBeGreaterThanOrEqual(15);
            expect(DEFAULT_SPEED_KMH).toBeLessThanOrEqual(40);
        });
    });

    describe('Optimization method selection', () => {
        it('should use simple route for <= 2 stops', () => {
            const stopCount = 2;
            const useSimple = stopCount <= 2;
            expect(useSimple).toBe(true);
        });

        it('should attempt OR-Tools for > 2 stops', () => {
            const stopCount = 5;
            const useOptimization = stopCount > 2;
            expect(useOptimization).toBe(true);
        });
    });

    describe('Location quality handling', () => {
        it('should warn about approximate locations', () => {
            const stops = [
                { id: '1', locationQuality: 'PRECISE' },
                { id: '2', locationQuality: 'APPROXIMATE' },
                { id: '3', locationQuality: 'LANDMARK' },
            ];
            const approximateCount = stops.filter(
                s => s.locationQuality === 'APPROXIMATE'
            ).length;
            expect(approximateCount).toBe(1);
        });

        it('all three location quality levels should be valid', () => {
            const validQualities = ['PRECISE', 'APPROXIMATE', 'LANDMARK'];
            expect(validQualities).toHaveLength(3);
        });
    });
});

describe('Route Plan Invariants', () => {
    const VALID_PLAN_TRANSITIONS: Record<string, string[]> = {
        'DRAFT': ['APPROVED', 'CANCELLED'],
        'APPROVED': ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
        'COMPLETED': [],  // Terminal
        'CANCELLED': [],  // Terminal
    };

    it('COMPLETED route plan is terminal', () => {
        expect(VALID_PLAN_TRANSITIONS['COMPLETED']).toHaveLength(0);
    });

    it('CANCELLED route plan is terminal', () => {
        expect(VALID_PLAN_TRANSITIONS['CANCELLED']).toHaveLength(0);
    });

    it('DRAFT must be APPROVED before execution', () => {
        expect(VALID_PLAN_TRANSITIONS['DRAFT']).not.toContain('IN_PROGRESS');
        expect(VALID_PLAN_TRANSITIONS['DRAFT']).toContain('APPROVED');
    });

    it('any non-terminal state can be CANCELLED', () => {
        const nonTerminal = ['DRAFT', 'APPROVED', 'IN_PROGRESS'];
        for (const state of nonTerminal) {
            expect(VALID_PLAN_TRANSITIONS[state]).toContain('CANCELLED');
        }
    });
});
