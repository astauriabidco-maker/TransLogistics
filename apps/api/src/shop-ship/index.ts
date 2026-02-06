/**
 * Shop & Ship Module Index
 */

export {
    PurchaseRequestService,
    getPurchaseRequestService,
    PurchaseRequestError,
    type PricingSnapshot,
    type CreatePurchaseRequestInput,
    type QuotePurchaseRequestInput,
    type AdjustmentInput,
} from './purchase-request.service';

export {
    SupplierOrderService,
    getSupplierOrderService,
    SupplierOrderError,
    type CreateSupplierOrderInput,
    type PlaceOrderInput,
    type MarkShippedInput,
    type ReceiveOrderInput,
    type ReportExceptionInput,
    type ResolveExceptionInput,
} from './supplier-order.service';

export {
    ConsolidationService,
    getConsolidationService,
    ConsolidationError,
    type CreateBatchInput,
    type AddOrderToBatchInput,
    type RepackagingInput,
    type PackBatchInput,
    type ApproveBatchInput,
    type CreateShipmentInput,
} from './consolidation.service';

export { default as purchaseRequestRoutes } from './purchase-request.routes';
export { default as supplierOrderRoutes } from './supplier-order.routes';
export { default as consolidationRoutes } from './consolidation.routes';

