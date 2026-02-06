/**
 * Analytics Module
 * 
 * Batch processing for performance metrics.
 * Read-only aggregations - does not mutate core entities.
 */

export * from './analytics.service';
export * from './cost-attribution.service';
export * from './route-performance.aggregator';
export * from './hub-performance.aggregator';
export * from './volume-metrics.aggregator';
export * from './lead-source.aggregator';
