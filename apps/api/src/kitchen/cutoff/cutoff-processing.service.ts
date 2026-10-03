import { Injectable } from '@nestjs/common';
import { KitchenTime } from '../time/kitchen-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CutoffService } from './cutoff.service.js';
import { plannedKitchenTimes } from '../board/kitchen-timing.js';

export interface CutoffProcessResult {
  date: string;
  cutoffAt: string;
  processed: boolean;
  skipped: boolean;
  alreadyProcessed: boolean;
  reason: string | null;
  cancelled: number;
  confirmed: number;
  drops: number;
}

const SKIPPED: Pick<
  CutoffProcessResult,
  'processed' | 'skipped' | 'alreadyProcessed' | 'cancelled' | 'confirmed' | 'drops'
> = {
  processed: false,
  skipped: true,
  alreadyProcessed: false,
  cancelled: 0,
  confirmed: 0,
  drops: 0,
};

/**
 * Turns a delivery date whose kitchen cutoff has passed into confirmed /
 * cancelled orders and drops. Writes never live on a query service.
 */
@Injectable()
export class CutoffProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cutoff: CutoffService,
    private readonly kitchenTime: KitchenTime,
  ) {}

  async ensureProcessed(date: string): Promise<CutoffProcessResult> {
    const deliveryDate = this.kitchenTime.assertDateString(date);
    const cutoff = await this.cutoff.resolve(deliveryDate);

    if (!cutoff.hasPassed) {
      return {
        date: deliveryDate,
        cutoffAt: cutoff.cutoffAt.toISOString(),
        ...SKIPPED,
        reason: 'CUTOFF_NOT_PASSED',
      };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(8713, hashtext(${deliveryDate}))`;

      const target = this.kitchenTime.fromDateString(deliveryDate);
      const existing = await tx.cutoffRun.findFirst({
        where: { targetDeliveryDate: target, status: 'COMPLETED' },
      });

      if (existing) {
        return {
          date: deliveryDate,
          cutoffAt: existing.cutoffAt.toISOString(),
          processed: false,
          skipped: true,
          alreadyProcessed: true,
          reason: 'ALREADY_PROCESSED',
          cancelled: existing.ordersRejected,
          confirmed: existing.ordersConfirmed,
          drops: await tx.drop.count({ where: { deliveryDate: target } }),
        };
      }

      const orders = await tx.order.findMany({
        where: {
          deliveryDate: target,
          status: { in: ['DRAFT', 'PLACED'] },
        },
        select: {
          id: true,
          status: true,
          companyId: true,
          deliveryAddressId: true,
          deliveryDate: true,
          deliveryTime: true,
          leaveKitchenMinutes: true,
          kitchenStartedAt: true,
        },
      });

      let cancelled = 0;
      let confirmed = 0;
      const now = this.kitchenTime.now();

      for (const order of orders) {
        if (order.status === 'DRAFT') {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: now,
            },
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'CANCELLED',
              actorType: 'SYSTEM',
              note: 'Cancelled automatically at kitchen cutoff.',
            },
          });
          cancelled += 1;
          continue;
        }

        const deliveryAt = this.kitchenTime.combineDateAndTime(
          deliveryDate,
          this.kitchenTime.toTimeString(order.deliveryTime),
        );
        const planned = plannedKitchenTimes(
          deliveryAt,
          order.leaveKitchenMinutes,
        );

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: now,
            kitchenReadyAt: planned.kitchenReadyAt,
            dispatchReadyAt: planned.dispatchReadyAt,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: 'CONFIRMED',
            actorType: 'SYSTEM',
            note: 'Confirmed automatically at kitchen cutoff.',
          },
        });
        confirmed += 1;

        const drop = await tx.drop.upsert({
          where: {
            companyId_companyAddressId_deliveryDate_deliveryTime: {
              companyId: order.companyId,
              companyAddressId: order.deliveryAddressId,
              deliveryDate: order.deliveryDate,
              deliveryTime: order.deliveryTime,
            },
          },
          create: {
            companyId: order.companyId,
            companyAddressId: order.deliveryAddressId,
            deliveryDate: order.deliveryDate,
            deliveryTime: order.deliveryTime,
            status: 'PENDING',
          },
          update: {},
        });

        await tx.dropOrder.upsert({
          where: { orderId: order.id },
          create: { dropId: drop.id, orderId: order.id },
          update: { dropId: drop.id },
        });
      }

      const run = await tx.cutoffRun.upsert({
        where: {
          processingDate_targetDeliveryDate: {
            processingDate: target,
            targetDeliveryDate: target,
          },
        },
        create: {
          processingDate: target,
          targetDeliveryDate: target,
          cutoffAt: cutoff.cutoffAt,
          status: 'COMPLETED',
          ordersProcessed: cancelled + confirmed,
          ordersConfirmed: confirmed,
          ordersRejected: cancelled,
          completedAt: now,
        },
        update: {
          status: 'COMPLETED',
          ordersProcessed: cancelled + confirmed,
          ordersConfirmed: confirmed,
          ordersRejected: cancelled,
          completedAt: now,
          cutoffAt: cutoff.cutoffAt,
          failureReason: null,
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((row) => row.id) } },
        data: { cutoffRunId: run.id, cutoffProcessedAt: now },
      });

      const drops = await tx.drop.count({ where: { deliveryDate: target } });

      return {
        date: deliveryDate,
        cutoffAt: cutoff.cutoffAt.toISOString(),
        processed: true,
        skipped: false,
        alreadyProcessed: false,
        reason: null,
        cancelled,
        confirmed,
        drops,
      };
    });
  }
}
