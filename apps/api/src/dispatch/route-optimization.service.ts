/**
 * Route Optimization Service
 * 
 * Smart dispatch route optimization using OR-Tools:
 * - Minimize total distance/time
 * - Vehicle capacity constraints
 * - Max stops per route
 * - Optional time windows
 * 
 * Result is a SUGGESTION, not enforced.
 * Works with imprecise African addressing.
 */

import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface DeliveryStop {
    id: string;
    name: string;
    lat: number;
    lng: number;
    // Optional constraints
    demandKg?: number;
    timeWindowStart?: Date;
    timeWindowEnd?: Date;
    priority?: number; // 1-10, higher = more important
    // For imprecise locations
    locationQuality?: 'PRECISE' | 'APPROXIMATE' | 'LANDMARK';
}

export interface VehicleConstraints {
    capacityKg: number;
    maxStops: number;
    averageSpeedKmh?: number; // Default: 25 km/h for African urban
    stopDurationMinutes?: number; // Default: 10 min per stop
}

export interface OptimizationInput {
    depotLat: number;
    depotLng: number;
    stops: DeliveryStop[];
    vehicle: VehicleConstraints;
    returnToDepot?: boolean; // Default: true
}

export interface OptimizedRoute {
    orderedStops: OptimizedStop[];
    totalDistanceKm: number;
    estimatedDurationMinutes: number;
    warnings: string[];
    // Metadata
    stopsSkipped: string[]; // IDs of stops that couldn't be included
    optimizationMethod: 'OR_TOOLS' | 'NEAREST_NEIGHBOR' | 'AS_PROVIDED';
}

export interface OptimizedStop {
    id: string;
    name: string;
    sequence: number;
    lat: number;
    lng: number;
    distanceFromPreviousKm: number;
    estimatedArrivalMinutes: number;
    // Original data
    demandKg?: number;
    locationQuality?: string;
}

// ==================================================
// CONSTANTS
// ==================================================

const EARTH_RADIUS_KM = 6371;
const DEFAULT_SPEED_KMH = 25; // African urban conditions
const DEFAULT_STOP_DURATION_MIN = 10;

// ==================================================
// HELPERS
// ==================================================

/**
 * Calculate Haversine distance between two points.
 * Returns distance in kilometers.
 */
function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

/**
 * Build distance matrix for all locations.
 * Index 0 is depot, 1..n are stops.
 */
function buildDistanceMatrix(
    depotLat: number,
    depotLng: number,
    stops: DeliveryStop[]
): number[][] {
    const locations = [
        { lat: depotLat, lng: depotLng },
        ...stops.map(s => ({ lat: s.lat, lng: s.lng })),
    ];

    const n = locations.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
            if (i === j) {
                matrix[i]![j] = 0;
            } else {
                // Convert km to meters for OR-Tools (uses integers)
                const locI = locations[i]!;
                const locJ = locations[j]!;
                const distKm = haversineDistance(
                    locI.lat,
                    locI.lng,
                    locJ.lat,
                    locJ.lng
                );
                matrix[i]![j] = Math.round(distKm * 1000); // Meters
            }
        }
    }

    return matrix;
}

// ==================================================
// SERVICE
// ==================================================

export class RouteOptimizationService {
    private orToolsAvailable: boolean = false;

    constructor() {
        this.checkOrToolsAvailability();
    }

    /**
     * Check if OR-Tools is available.
     */
    private async checkOrToolsAvailability(): Promise<void> {
        try {
            // Try to require node_or_tools
            require('node_or_tools');
            this.orToolsAvailable = true;
            logger.info('OR-Tools available for route optimization');
        } catch {
            this.orToolsAvailable = false;
            logger.warn('OR-Tools not available, falling back to nearest neighbor heuristic');
        }
    }

    /**
     * Optimize route for given stops.
     * Returns best route as SUGGESTION.
     */
    async optimizeRoute(input: OptimizationInput): Promise<OptimizedRoute> {
        const warnings: string[] = [];
        const stopsSkipped: string[] = [];

        // Validate input
        if (input.stops.length === 0) {
            return {
                orderedStops: [],
                totalDistanceKm: 0,
                estimatedDurationMinutes: 0,
                warnings: ['No stops provided'],
                stopsSkipped: [],
                optimizationMethod: 'AS_PROVIDED',
            };
        }

        // Filter valid stops
        let validStops = input.stops.filter(s => {
            if (isNaN(s.lat) || isNaN(s.lng)) {
                warnings.push(`Stop ${s.id} skipped: invalid coordinates`);
                stopsSkipped.push(s.id);
                return false;
            }
            return true;
        });

        // Apply max stops constraint
        if (validStops.length > input.vehicle.maxStops) {
            warnings.push(`Max stops (${input.vehicle.maxStops}) exceeded, optimizing subset`);
            // Sort by priority if available, otherwise take first N
            validStops = validStops
                .sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5))
                .slice(0, input.vehicle.maxStops);
            const skipped = input.stops
                .filter(s => !validStops.find(v => v.id === s.id))
                .map(s => s.id);
            stopsSkipped.push(...skipped);
        }

        // Apply capacity constraint
        let totalDemand = 0;
        const capacityFilteredStops: DeliveryStop[] = [];
        for (const stop of validStops) {
            const demand = stop.demandKg ?? 0;
            if (totalDemand + demand <= input.vehicle.capacityKg) {
                capacityFilteredStops.push(stop);
                totalDemand += demand;
            } else {
                warnings.push(`Stop ${stop.id} skipped: exceeds vehicle capacity`);
                stopsSkipped.push(stop.id);
            }
        }
        validStops = capacityFilteredStops;

        // Check for approximate locations
        const approximateStops = validStops.filter(s => s.locationQuality === 'APPROXIMATE');
        if (approximateStops.length > 0) {
            warnings.push(`${approximateStops.length} stops have approximate locations`);
        }

        // If only 1-2 stops, no optimization needed
        if (validStops.length <= 2) {
            return this.buildSimpleRoute(input, validStops, warnings, stopsSkipped);
        }

        // Try OR-Tools optimization, fallback to nearest neighbor
        if (this.orToolsAvailable) {
            try {
                return await this.optimizeWithOrTools(input, validStops, warnings, stopsSkipped);
            } catch (error) {
                logger.error({ error }, 'OR-Tools optimization failed, falling back to heuristic');
                warnings.push('OR-Tools failed, using heuristic optimization');
            }
        }

        // Fallback: Nearest neighbor heuristic
        return this.optimizeWithNearestNeighbor(input, validStops, warnings, stopsSkipped);
    }

    /**
     * Optimize using OR-Tools VRP solver.
     */
    private async optimizeWithOrTools(
        input: OptimizationInput,
        stops: DeliveryStop[],
        warnings: string[],
        stopsSkipped: string[]
    ): Promise<OptimizedRoute> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const orTools = require('node_or_tools');

        const distanceMatrix = buildDistanceMatrix(input.depotLat, input.depotLng, stops);

        // Build demands array (depot = 0)
        const demands = [0, ...stops.map(s => Math.round((s.demandKg ?? 0) * 100))]; // Scale for integers

        const solverOpts = {
            numNodes: distanceMatrix.length,
            costs: distanceMatrix,
            durations: distanceMatrix.map(row => row.map(d => Math.round(d / 1000 * 60 / (input.vehicle.averageSpeedKmh ?? DEFAULT_SPEED_KMH) * 60))), // seconds
            demands: [demands],
            vehicleCapacities: [Math.round(input.vehicle.capacityKg * 100)],
            depotNode: 0,
            timeHorizon: 24 * 60 * 60, // 24 hours in seconds
            vehicleNumber: 1,
        };

        return new Promise((resolve, reject) => {
            try {
                const solver = new orTools.VRP(solverOpts);

                const searchOpts = {
                    computeTimeLimit: 5000, // 5 seconds max
                    numIterationsWithoutImprovement: 100,
                };

                solver.Solve(searchOpts, (err: Error | null, solution: { routes: number[][] }) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!solution.routes || solution.routes.length === 0 || !solution.routes[0] || solution.routes[0].length === 0) {
                        // OR-Tools found no solution, use fallback
                        resolve(this.optimizeWithNearestNeighbor(input, stops, warnings, stopsSkipped));
                        return;
                    }

                    // Build optimized route from solution
                    const route = solution.routes[0];
                    const orderedStops: OptimizedStop[] = [];
                    let totalDistance = 0;
                    let prevLat = input.depotLat;
                    let prevLng = input.depotLng;
                    let cumulativeTime = 0;

                    const speedKmh = input.vehicle.averageSpeedKmh ?? DEFAULT_SPEED_KMH;
                    const stopDuration = input.vehicle.stopDurationMinutes ?? DEFAULT_STOP_DURATION_MIN;

                    for (let seq = 0; seq < route.length; seq++) {
                        const nodeIndex = route[seq];
                        if (nodeIndex === undefined || nodeIndex === 0) continue; // Skip depot

                        const stop = stops[nodeIndex - 1]; // -1 because depot is index 0
                        if (!stop) continue; // Skip if stop not found

                        const distFromPrev = haversineDistance(prevLat, prevLng, stop.lat, stop.lng);
                        totalDistance += distFromPrev;

                        const travelTime = (distFromPrev / speedKmh) * 60;
                        cumulativeTime += travelTime + stopDuration;

                        orderedStops.push({
                            id: stop.id,
                            name: stop.name,
                            sequence: seq,
                            lat: stop.lat,
                            lng: stop.lng,
                            distanceFromPreviousKm: Math.round(distFromPrev * 100) / 100,
                            estimatedArrivalMinutes: Math.round(cumulativeTime),
                            demandKg: stop.demandKg,
                            locationQuality: stop.locationQuality,
                        });

                        prevLat = stop.lat;
                        prevLng = stop.lng;
                    }

                    // Add return to depot if requested
                    if (input.returnToDepot !== false) {
                        const returnDist = haversineDistance(prevLat, prevLng, input.depotLat, input.depotLng);
                        totalDistance += returnDist;
                        cumulativeTime += (returnDist / speedKmh) * 60;
                    }

                    resolve({
                        orderedStops,
                        totalDistanceKm: Math.round(totalDistance * 100) / 100,
                        estimatedDurationMinutes: Math.round(cumulativeTime),
                        warnings,
                        stopsSkipped,
                        optimizationMethod: 'OR_TOOLS',
                    });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Nearest neighbor heuristic (fallback).
     * Greedy algorithm: always go to closest unvisited stop.
     */
    private optimizeWithNearestNeighbor(
        input: OptimizationInput,
        stops: DeliveryStop[],
        warnings: string[],
        stopsSkipped: string[]
    ): OptimizedRoute {
        const orderedStops: OptimizedStop[] = [];
        const unvisited = [...stops];
        let currentLat = input.depotLat;
        let currentLng = input.depotLng;
        let totalDistance = 0;
        let cumulativeTime = 0;
        let sequence = 0;

        const speedKmh = input.vehicle.averageSpeedKmh ?? DEFAULT_SPEED_KMH;
        const stopDuration = input.vehicle.stopDurationMinutes ?? DEFAULT_STOP_DURATION_MIN;

        while (unvisited.length > 0) {
            // Find nearest
            let nearestIdx = 0;
            let nearestDist = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const stopItem = unvisited[i]!;
                const dist = haversineDistance(
                    currentLat,
                    currentLng,
                    stopItem.lat,
                    stopItem.lng
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }

            const stop = unvisited.splice(nearestIdx, 1)[0]!;
            totalDistance += nearestDist;

            const travelTime = (nearestDist / speedKmh) * 60;
            cumulativeTime += travelTime + stopDuration;

            orderedStops.push({
                id: stop.id,
                name: stop.name,
                sequence: sequence++,
                lat: stop.lat,
                lng: stop.lng,
                distanceFromPreviousKm: Math.round(nearestDist * 100) / 100,
                estimatedArrivalMinutes: Math.round(cumulativeTime),
                demandKg: stop.demandKg,
                locationQuality: stop.locationQuality,
            });

            currentLat = stop.lat;
            currentLng = stop.lng;
        }

        // Return to depot
        if (input.returnToDepot !== false) {
            const returnDist = haversineDistance(currentLat, currentLng, input.depotLat, input.depotLng);
            totalDistance += returnDist;
            cumulativeTime += (returnDist / speedKmh) * 60;
        }

        return {
            orderedStops,
            totalDistanceKm: Math.round(totalDistance * 100) / 100,
            estimatedDurationMinutes: Math.round(cumulativeTime),
            warnings,
            stopsSkipped,
            optimizationMethod: 'NEAREST_NEIGHBOR',
        };
    }

    /**
     * Simple route for 1-2 stops (no optimization needed).
     */
    private buildSimpleRoute(
        input: OptimizationInput,
        stops: DeliveryStop[],
        warnings: string[],
        stopsSkipped: string[]
    ): OptimizedRoute {
        const orderedStops: OptimizedStop[] = [];
        let prevLat = input.depotLat;
        let prevLng = input.depotLng;
        let totalDistance = 0;
        let cumulativeTime = 0;

        const speedKmh = input.vehicle.averageSpeedKmh ?? DEFAULT_SPEED_KMH;
        const stopDuration = input.vehicle.stopDurationMinutes ?? DEFAULT_STOP_DURATION_MIN;

        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i]!;
            const dist = haversineDistance(prevLat, prevLng, stop.lat, stop.lng);
            totalDistance += dist;

            const travelTime = (dist / speedKmh) * 60;
            cumulativeTime += travelTime + stopDuration;

            orderedStops.push({
                id: stop.id,
                name: stop.name,
                sequence: i,
                lat: stop.lat,
                lng: stop.lng,
                distanceFromPreviousKm: Math.round(dist * 100) / 100,
                estimatedArrivalMinutes: Math.round(cumulativeTime),
                demandKg: stop.demandKg,
                locationQuality: stop.locationQuality,
            });

            prevLat = stop.lat;
            prevLng = stop.lng;
        }

        if (input.returnToDepot !== false) {
            const returnDist = haversineDistance(prevLat, prevLng, input.depotLat, input.depotLng);
            totalDistance += returnDist;
            cumulativeTime += (returnDist / speedKmh) * 60;
        }

        return {
            orderedStops,
            totalDistanceKm: Math.round(totalDistance * 100) / 100,
            estimatedDurationMinutes: Math.round(cumulativeTime),
            warnings,
            stopsSkipped,
            optimizationMethod: 'AS_PROVIDED',
        };
    }

    /**
     * Estimate route metrics without optimization.
     * Useful for quick cost estimates.
     */
    estimateRouteMetrics(
        depotLat: number,
        depotLng: number,
        stops: Array<{ lat: number; lng: number }>,
        speedKmh: number = DEFAULT_SPEED_KMH,
        stopDurationMin: number = DEFAULT_STOP_DURATION_MIN
    ): { totalDistanceKm: number; estimatedDurationMinutes: number } {
        let totalDistance = 0;
        let prevLat = depotLat;
        let prevLng = depotLng;

        for (const stop of stops) {
            totalDistance += haversineDistance(prevLat, prevLng, stop.lat, stop.lng);
            prevLat = stop.lat;
            prevLng = stop.lng;
        }

        // Return to depot
        totalDistance += haversineDistance(prevLat, prevLng, depotLat, depotLng);

        const travelTime = (totalDistance / speedKmh) * 60;
        const stopTime = stops.length * stopDurationMin;

        return {
            totalDistanceKm: Math.round(totalDistance * 100) / 100,
            estimatedDurationMinutes: Math.round(travelTime + stopTime),
        };
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: RouteOptimizationService | null = null;

export function getRouteOptimizationService(): RouteOptimizationService {
    if (!instance) {
        instance = new RouteOptimizationService();
    }
    return instance;
}
