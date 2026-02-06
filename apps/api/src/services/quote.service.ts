/**
 * QuoteService Implementation
 * 
 * Pure domain logic for quotes.
 * Enforces immutability after acceptance.
 * NO HTTP, NO WhatsApp, NO AI logic.
 */

import type { PrismaClient, Quote, Shipment, ScanResult } from '@prisma/client';
import type {
    IQuoteService,
    CreateQuoteInput,
    CreateQuoteFromScanInput,
    QuoteDTO,
} from '../domain/services/quote.service';
import type { ServiceContext, Dimensions, PriceBreakdown } from '../domain/types';
import {
    QuoteNotFoundError,
    ShipmentNotFoundError,
    NotFoundError,
    InvalidStateError,
    QuoteExpiredError,
    QuoteAlreadyAcceptedError,
    ValidationError,
} from '../domain/errors';
import { PricingService } from './pricing.service';
import { WeightCalculator, getWeightCalculator } from '../pricing/weight.calculator';
import { logger } from '../lib/logger';

// ==================================================
// CONSTANTS
// ==================================================

const DEFAULT_QUOTE_VALIDITY_MINUTES = 24 * 60; // 24 hours
const MINIMUM_CONFIDENCE_THRESHOLD = 0.7;

// ==================================================
// SERVICE IMPLEMENTATION
// ==================================================

export class QuoteService implements IQuoteService {
    private readonly pricingService: PricingService;
    private readonly weightCalculator: WeightCalculator;

    constructor(private readonly prisma: PrismaClient) {
        this.pricingService = new PricingService(prisma);
        this.weightCalculator = getWeightCalculator();
    }

    // --------------------------------------------------
    // CREATE QUOTE (manual dimensions)
    // --------------------------------------------------

    async createQuote(
        input: CreateQuoteInput,
        ctx: ServiceContext
    ): Promise<QuoteDTO> {
        // Validate shipment exists and has no quote
        const shipment = await this.getShipmentOrThrow(input.shipmentId);
        await this.ensureNoExistingQuote(input.shipmentId);

        // Validate dimensions and weight
        this.validateDimensions(input.dimensions);
        this.validateWeight(input.weightKg);

        // Calculate weight breakdown (volumetric + payable)
        const weightCalc = this.weightCalculator.calculate({
            dimensions: input.dimensions,
            declaredWeightKg: input.weightKg,
            source: 'DECLARED',
        });

        // Calculate price using payable weight
        const priceResult = await this.pricingService.calculatePrice(
            {
                routeId: shipment.routeId,
                dimensions: input.dimensions,
                weightKg: weightCalc.payableWeightKg,
            },
            ctx
        );

        // Calculate validity
        const validityMinutes = input.validityMinutes ?? DEFAULT_QUOTE_VALIDITY_MINUTES;
        const validUntil = new Date();
        validUntil.setMinutes(validUntil.getMinutes() + validityMinutes);

        // Create the quote
        const quote = await this.prisma.quote.create({
            data: {
                shipmentId: input.shipmentId,
                status: 'PENDING',
                pricingRuleId: priceResult.pricingRuleId,

                // Dimension snapshot
                lengthCm: input.dimensions.lengthCm,
                widthCm: input.dimensions.widthCm,
                heightCm: input.dimensions.heightCm,
                volumeCm3: weightCalc.volumeCm3,

                // Weight breakdown (auditable)
                declaredWeightKg: weightCalc.declaredWeightKg,
                realWeightKg: weightCalc.realWeightKg,
                volumetricWeightKg: weightCalc.volumetricWeightKg,
                payableWeightKg: weightCalc.payableWeightKg,
                weightSource: weightCalc.weightSource,

                // Legacy field (deprecated)
                weightKg: weightCalc.payableWeightKg,

                // Price snapshot (immutable)
                basePriceXof: priceResult.breakdown.basePriceXof,
                weightPriceXof: priceResult.breakdown.weightPriceXof,
                volumePriceXof: priceResult.breakdown.volumePriceXof,
                totalPriceXof: priceResult.breakdown.totalPriceXof,

                validUntil,
            },
        });

        // Update shipment status to QUOTED
        await this.prisma.shipment.update({
            where: { id: input.shipmentId },
            data: { status: 'QUOTED' },
        });

        logger.info('Created quote', {
            quoteId: quote.id,
            shipmentId: input.shipmentId,
            totalPriceXof: priceResult.breakdown.totalPriceXof,
            validUntil,
            requestId: ctx.requestId,
        });

        return this.toDTO(quote, priceResult.pricingRuleVersion);
    }

    // --------------------------------------------------
    // CREATE QUOTE FROM SCAN
    // --------------------------------------------------

    async createQuoteFromScan(
        input: CreateQuoteFromScanInput,
        ctx: ServiceContext
    ): Promise<QuoteDTO> {
        // Validate shipment
        const shipment = await this.getShipmentOrThrow(input.shipmentId);
        await this.ensureNoExistingQuote(input.shipmentId);

        // Get and validate scan result
        const scanResult = await this.prisma.scanResult.findUnique({
            where: { id: input.scanResultId },
        });

        if (!scanResult) {
            throw new NotFoundError('ScanResult', input.scanResultId);
        }

        if (scanResult.status !== 'VALIDATED') {
            throw new InvalidStateError(
                scanResult.status,
                'create quote from scan',
                ['VALIDATED']
            );
        }

        if (Number(scanResult.confidenceScore) < MINIMUM_CONFIDENCE_THRESHOLD) {
            throw new ValidationError(
                `Scan confidence ${scanResult.confidenceScore} is below threshold ${MINIMUM_CONFIDENCE_THRESHOLD}`,
                'confidenceScore'
            );
        }

        // Extract dimensions from scan result
        const dimensions: Dimensions = {
            lengthCm: Number(scanResult.lengthCm),
            widthCm: Number(scanResult.widthCm),
            heightCm: Number(scanResult.heightCm),
        };

        // Create quote using scan dimensions
        return this.createQuote(
            {
                shipmentId: input.shipmentId,
                dimensions,
                weightKg: input.weightKg,
                validityMinutes: input.validityMinutes,
            },
            ctx
        );
    }

    // --------------------------------------------------
    // ACCEPT QUOTE
    // --------------------------------------------------

    async acceptQuote(quoteId: string, ctx: ServiceContext): Promise<QuoteDTO> {
        const quote = await this.getQuoteOrThrow(quoteId);

        // Validate state
        if (quote.status !== 'PENDING') {
            if (quote.status === 'ACCEPTED') {
                throw new QuoteAlreadyAcceptedError(quoteId);
            }
            throw new InvalidStateError(quote.status, 'accept', ['PENDING']);
        }

        // Check expiry
        if (new Date() > quote.validUntil) {
            throw new QuoteExpiredError(quote.validUntil);
        }

        // Mark quote as accepted (IMMUTABLE from now on)
        const acceptedQuote = await this.prisma.quote.update({
            where: { id: quoteId },
            data: {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
            },
        });

        logger.info('Quote accepted', {
            quoteId,
            shipmentId: quote.shipmentId,
            totalPriceXof: Number(quote.totalPriceXof),
            requestId: ctx.requestId,
        });

        return this.toDTO(acceptedQuote);
    }

    // --------------------------------------------------
    // REJECT QUOTE
    // --------------------------------------------------

    async rejectQuote(quoteId: string, ctx: ServiceContext): Promise<QuoteDTO> {
        const quote = await this.getQuoteOrThrow(quoteId);

        if (quote.status !== 'PENDING') {
            throw new InvalidStateError(quote.status, 'reject', ['PENDING']);
        }

        const rejectedQuote = await this.prisma.quote.update({
            where: { id: quoteId },
            data: { status: 'REJECTED' },
        });

        // Also update shipment back to DRAFT
        await this.prisma.shipment.update({
            where: { id: quote.shipmentId },
            data: { status: 'DRAFT' },
        });

        logger.info('Quote rejected', {
            quoteId,
            shipmentId: quote.shipmentId,
            requestId: ctx.requestId,
        });

        return this.toDTO(rejectedQuote);
    }

    // --------------------------------------------------
    // GET BY ID
    // --------------------------------------------------

    async getQuoteById(quoteId: string): Promise<QuoteDTO> {
        const quote = await this.getQuoteOrThrow(quoteId);
        return this.toDTO(quote);
    }

    // --------------------------------------------------
    // GET BY SHIPMENT
    // --------------------------------------------------

    async getQuoteByShipmentId(shipmentId: string): Promise<QuoteDTO | null> {
        // Validate shipment exists
        await this.getShipmentOrThrow(shipmentId);

        const quote = await this.prisma.quote.findUnique({
            where: { shipmentId },
        });

        return quote ? this.toDTO(quote) : null;
    }

    // --------------------------------------------------
    // EXPIRE STALE QUOTES
    // --------------------------------------------------

    async expireStaleQuotes(ctx: ServiceContext): Promise<number> {
        const result = await this.prisma.quote.updateMany({
            where: {
                status: 'PENDING',
                validUntil: { lt: new Date() },
            },
            data: {
                status: 'EXPIRED',
                expiredAt: new Date(),
            },
        });

        if (result.count > 0) {
            logger.info('Expired stale quotes', {
                count: result.count,
                requestId: ctx.requestId,
            });
        }

        return result.count;
    }

    // --------------------------------------------------
    // RECALCULATE QUOTE
    // --------------------------------------------------

    async recalculateQuote(
        quoteId: string,
        newDimensions: Dimensions,
        newWeightKg: number,
        ctx: ServiceContext
    ): Promise<QuoteDTO> {
        const quote = await this.getQuoteOrThrow(quoteId);

        if (quote.status !== 'PENDING') {
            throw new InvalidStateError(quote.status, 'recalculate', ['PENDING']);
        }

        const shipment = await this.getShipmentOrThrow(quote.shipmentId);

        // Calculate new price
        const priceResult = await this.pricingService.calculatePrice(
            {
                routeId: shipment.routeId,
                dimensions: newDimensions,
                weightKg: newWeightKg,
            },
            ctx
        );

        // Update the quote
        const updatedQuote = await this.prisma.quote.update({
            where: { id: quoteId },
            data: {
                pricingRuleId: priceResult.pricingRuleId,
                lengthCm: newDimensions.lengthCm,
                widthCm: newDimensions.widthCm,
                heightCm: newDimensions.heightCm,
                volumeCm3: priceResult.volumeCm3,
                weightKg: newWeightKg,
                basePriceXof: priceResult.breakdown.basePriceXof,
                weightPriceXof: priceResult.breakdown.weightPriceXof,
                volumePriceXof: priceResult.breakdown.volumePriceXof,
                totalPriceXof: priceResult.breakdown.totalPriceXof,
            },
        });

        logger.info('Recalculated quote', {
            quoteId,
            newTotalPriceXof: priceResult.breakdown.totalPriceXof,
            requestId: ctx.requestId,
        });

        return this.toDTO(updatedQuote, priceResult.pricingRuleVersion);
    }

    // ==================================================
    // PRIVATE HELPERS
    // ==================================================

    private async getQuoteOrThrow(quoteId: string): Promise<Quote> {
        const quote = await this.prisma.quote.findUnique({
            where: { id: quoteId },
        });

        if (!quote) {
            throw new QuoteNotFoundError(quoteId);
        }

        return quote;
    }

    private async getShipmentOrThrow(shipmentId: string): Promise<Shipment> {
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
        });

        if (!shipment) {
            throw new ShipmentNotFoundError(shipmentId);
        }

        return shipment;
    }

    private async ensureNoExistingQuote(shipmentId: string): Promise<void> {
        const existing = await this.prisma.quote.findUnique({
            where: { shipmentId },
        });

        if (existing && existing.status !== 'REJECTED') {
            throw new InvalidStateError(
                'HAS_QUOTE',
                'create quote',
                ['NO_QUOTE']
            );
        }
    }

    private validateDimensions(dimensions: Dimensions): void {
        if (dimensions.lengthCm <= 0) {
            throw new ValidationError('Length must be positive', 'lengthCm');
        }
        if (dimensions.widthCm <= 0) {
            throw new ValidationError('Width must be positive', 'widthCm');
        }
        if (dimensions.heightCm <= 0) {
            throw new ValidationError('Height must be positive', 'heightCm');
        }
    }

    private validateWeight(weightKg: number): void {
        if (weightKg <= 0) {
            throw new ValidationError('Weight must be positive', 'weightKg');
        }
    }

    private toDTO(quote: Quote, pricingRuleVersion?: number): QuoteDTO {
        return {
            id: quote.id,
            shipmentId: quote.shipmentId,
            status: quote.status as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED',
            dimensions: {
                lengthCm: Number(quote.lengthCm),
                widthCm: Number(quote.widthCm),
                heightCm: Number(quote.heightCm),
            },
            volumeCm3: Number(quote.volumeCm3),
            weightKg: Number(quote.weightKg),
            pricingRuleId: quote.pricingRuleId,
            pricingRuleVersion: pricingRuleVersion ?? 0,
            breakdown: {
                basePriceXof: Number(quote.basePriceXof),
                weightPriceXof: Number(quote.weightPriceXof),
                volumePriceXof: Number(quote.volumePriceXof),
                totalPriceXof: Number(quote.totalPriceXof),
            },
            validUntil: quote.validUntil,
            acceptedAt: quote.acceptedAt,
            expiredAt: quote.expiredAt,
            createdAt: quote.createdAt,
        };
    }
}
