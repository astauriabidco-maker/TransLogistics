/**
 * WhatsApp Service Registry
 * 
 * Dependency container for domain services used by WhatsApp handlers.
 * Ensures consistent service instantiation and sharing.
 */

import type { PrismaClient } from '@prisma/client';
import { QuoteService } from '../services/quote.service';
import { ScanService } from '../services/scan.service';
import { getShipmentService, ShipmentService } from '../shipment/shipment.service';
import { getPaymentService, PaymentService } from '../payments/payment.service';

export class ServiceRegistry {
    readonly prisma: PrismaClient;
    readonly quote: QuoteService;
    readonly scan: ScanService;
    readonly shipment: ShipmentService;
    readonly payment: PaymentService;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.quote = new QuoteService(prisma);
        this.scan = new ScanService(prisma);
        this.shipment = getShipmentService(prisma);
        this.payment = getPaymentService(prisma);
    }
}
