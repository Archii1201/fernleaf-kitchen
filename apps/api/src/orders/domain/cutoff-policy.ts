import { Injectable } from '@nestjs/common';
import {
  CutoffService,
  type ResolvedCutoff,
} from '../../kitchen/cutoff/cutoff.service.js';
import { KitchenCalendar } from '../../kitchen/calendar/kitchen-calendar.service.js';
import { OrderCutoffPassedError } from '../orders.errors.js';

/**
 * Placeability/editability for a delivery date. Delegates the date math to
 * CutoffService (kitchen calendar only — never the company week).
 */
@Injectable()
export class CutoffPolicy {
  constructor(
    private readonly cutoff: CutoffService,
    private readonly kitchenCalendar: KitchenCalendar,
  ) {}

  evaluate(deliveryDate: string): Promise<ResolvedCutoff> {
    return this.cutoff.resolve(deliveryDate);
  }

  async assertBeforeCutoff(deliveryDate: string): Promise<ResolvedCutoff> {
    const resolved = await this.evaluate(deliveryDate);

    if (resolved.hasPassed) {
      throw new OrderCutoffPassedError(deliveryDate, resolved.cutoffAt);
    }

    return resolved;
  }

  /** Kitchen holiday / closed weekday on the delivery date. */
  async isKitchenOperating(deliveryDate: string): Promise<boolean> {
    return this.kitchenCalendar.isWorkingDay(deliveryDate);
  }
}
