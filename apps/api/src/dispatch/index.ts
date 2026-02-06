/**
 * Dispatch Module Exports
 */

export { DispatchTaskService, DispatchError, getDispatchTaskService } from './dispatch-task.service';
export type { CreateDispatchTaskInput, AssignDriverInput, ConfirmPickupInput, FailTaskInput } from './dispatch-task.service';

export { DeliveryProofService, DeliveryProofError, getDeliveryProofService } from './delivery-proof.service';
export type { CreateDeliveryProofInput } from './delivery-proof.service';

export { RouteOptimizationService, getRouteOptimizationService } from './route-optimization.service';
export type { OptimizationInput, OptimizedRoute, DeliveryStop, VehicleConstraints } from './route-optimization.service';

export { RoutePlanService, RoutePlanError, getRoutePlanService } from './route-plan.service';
export type { CreateRoutePlanInput } from './route-plan.service';

