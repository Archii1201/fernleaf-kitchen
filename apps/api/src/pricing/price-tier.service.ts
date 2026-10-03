import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BASIS_POINTS_SCALE } from './domain/money.js';
import type {
  PriceTierDefinition,
  PricingStrategyKind,
} from './domain/pricing.types.js';
import { validateTierChain } from './domain/tier-chain.js';
import { selectEffectiveTierId } from './domain/tier-selection.js';
import type {
  CreatePriceTierDto,
  PriceTierResponse,
  UpdatePriceTierDto,
} from './dto/price-tier.dto.js';
import { PricingContextLoader, chainTierIds } from './pricing-context.loader.js';
import {
  DefaultPriceTierMissingError,
  DefaultPriceTierProtectedError,
  InvalidPricingStrategyError,
  PriceTierNameConflictError,
  PriceTierNotFoundError,
} from './pricing.errors.js';

@Injectable()
export class PriceTierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextLoader: PricingContextLoader,
  ) {}

  async list(): Promise<PriceTierResponse[]> {
    const tiers = await this.prisma.priceTier.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    const definitions = tiers.map(toDefinition);

    return tiers.map((tier) =>
      toResponse(tier, definitions, chainTierIds(definitions, tier.id)),
    );
  }

  async getById(id: string): Promise<PriceTierResponse> {
    const tier = await this.prisma.priceTier.findUnique({ where: { id } });

    if (!tier) {
      throw new PriceTierNotFoundError(id);
    }

    const definitions = await this.contextLoader.loadTiers();

    return toResponse(tier, definitions, chainTierIds(definitions, tier.id));
  }

  async create(dto: CreatePriceTierDto): Promise<PriceTierResponse> {
    const existing = await this.prisma.priceTier.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
      select: { code: true, name: true },
    });

    if (existing) {
      throw new PriceTierNameConflictError(
        existing.code === dto.code ? 'code' : 'name',
        existing.code === dto.code ? dto.code : dto.name,
      );
    }

    const strategyInputs = this.validateStrategyInputs(
      dto.strategy,
      dto.markupBasisPoints ?? null,
      dto.baseTierId ?? null,
    );

    const tiers = await this.contextLoader.loadTiers();

    // Validate the chain the new tier *would* have, before writing it.
    validateTierChain(
      { id: NEW_TIER_PLACEHOLDER_ID, baseTierId: strategyInputs.baseTierId },
      new Map(tiers.map((tier) => [tier.id, tier])),
    );

    const created = await this.prisma.priceTier.create({
      data: {
        code: dto.code,
        name: dto.name,
        strategy: strategyInputs.strategy,
        markupBasisPoints: strategyInputs.markupBasisPoints,
        baseTierId: strategyInputs.baseTierId,
        // A new tier is never the default; use make-default for that, so the
        // "exactly one default" switch always happens in one transaction.
        isDefault: false,
        active: true,
      },
    });

    return this.getById(created.id);
  }

  async update(id: string, dto: UpdatePriceTierDto): Promise<PriceTierResponse> {
    const tier = await this.prisma.priceTier.findUnique({ where: { id } });

    if (!tier) {
      throw new PriceTierNotFoundError(id);
    }

    if (dto.name !== undefined && dto.name !== tier.name) {
      const conflict = await this.prisma.priceTier.findUnique({
        where: { name: dto.name },
        select: { id: true },
      });

      if (conflict) {
        throw new PriceTierNameConflictError('name', dto.name);
      }
    }

    if (tier.isDefault && dto.active === false) {
      throw new DefaultPriceTierProtectedError('deactivated');
    }

    const strategyInputs = this.validateStrategyInputs(
      (dto.strategy ?? tier.strategy) as PricingStrategyKind,
      dto.markupBasisPoints === undefined
        ? tier.markupBasisPoints
        : dto.markupBasisPoints,
      dto.baseTierId === undefined ? tier.baseTierId : dto.baseTierId,
    );

    const tiers = await this.contextLoader.loadTiers();
    const byId = new Map(tiers.map((entry) => [entry.id, entry]));
    byId.set(id, { ...toDefinitionFromMap(byId, id), baseTierId: strategyInputs.baseTierId });

    validateTierChain({ id, baseTierId: strategyInputs.baseTierId }, byId);

    await this.prisma.priceTier.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
        strategy: strategyInputs.strategy,
        markupBasisPoints: strategyInputs.markupBasisPoints,
        baseTierId: strategyInputs.baseTierId,
      },
    });

    return this.getById(id);
  }

  /**
   * Moves the default flag. The partial unique index allows only one row with
   * `isDefault = true`, so clearing and setting must happen inside one
   * transaction - otherwise a concurrent request could observe zero defaults
   * (every uncompanied employee suddenly unpriced) or the insert would fail.
   */
  async makeDefault(id: string): Promise<PriceTierResponse> {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id },
      select: { id: true, active: true, isDefault: true },
    });

    if (!tier) {
      throw new PriceTierNotFoundError(id);
    }

    if (!tier.active) {
      throw new InvalidPricingStrategyError(
        'An inactive tier cannot become the default.',
        { tierId: id },
      );
    }

    if (!tier.isDefault) {
      await this.prisma.$transaction(async (tx) => {
        await tx.priceTier.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });

        await tx.priceTier.update({
          where: { id },
          data: { isDefault: true },
        });
      });
    }

    return this.getById(id);
  }

  async getDefaultTierId(): Promise<string> {
    const tier = await this.prisma.priceTier.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    if (!tier) {
      throw new DefaultPriceTierMissingError();
    }

    return tier.id;
  }

  /**
   * The tier that prices a given company: its own, or the default. Exposed
   * here so the future Menu and Orders modules reuse one implementation.
   */
  async resolveEffectiveTierId(
    companyTierId: string | null,
  ): Promise<string> {
    if (companyTierId) {
      return selectEffectiveTierId(companyTierId, null);
    }

    return selectEffectiveTierId(null, await this.getDefaultTierId());
  }

  private validateStrategyInputs(
    strategy: PricingStrategyKind,
    markupBasisPoints: number | null,
    baseTierId: string | null,
  ): {
    strategy: PricingStrategyKind;
    markupBasisPoints: number | null;
    baseTierId: string | null;
  } {
    if (markupBasisPoints !== null && !Number.isInteger(markupBasisPoints)) {
      throw new InvalidPricingStrategyError(
        'Markup must be whole basis points (10000 = 100%).',
        { markupBasisPoints },
      );
    }

    switch (strategy) {
      case 'EXPLICIT':
        // Manual pricing takes no inputs; drop any leftovers so a tier that
        // used to derive cannot keep a stale multiplier.
        return { strategy, markupBasisPoints: null, baseTierId: null };

      case 'COST_MULTIPLIER':
        if (markupBasisPoints === null || markupBasisPoints <= 0) {
          throw new InvalidPricingStrategyError(
            'A cost-multiplier tier needs a positive multiplier in basis points (24000 = x2.4).',
            { markupBasisPoints },
          );
        }

        return { strategy, markupBasisPoints, baseTierId: null };

      case 'BASE_MARKUP':
        if (markupBasisPoints === null || markupBasisPoints < 0) {
          throw new InvalidPricingStrategyError(
            'A base-markup tier needs a non-negative percentage in basis points (1500 = +15%).',
            { markupBasisPoints },
          );
        }

        if (!baseTierId) {
          throw new InvalidPricingStrategyError(
            'A base-markup tier must say which tier it derives from.',
          );
        }

        return { strategy, markupBasisPoints, baseTierId };

      default:
        throw new InvalidPricingStrategyError('Unknown pricing strategy.', {
          strategy,
        });
    }
  }
}

/** Placeholder id used only to chain-check a tier that does not exist yet. */
const NEW_TIER_PLACEHOLDER_ID = '__new__';

type PriceTierRow = {
  id: string;
  code: string;
  name: string;
  strategy: string;
  markupBasisPoints: number | null;
  baseTierId: string | null;
  isDefault: boolean;
  active: boolean;
};

function toDefinition(tier: PriceTierRow): PriceTierDefinition {
  return {
    id: tier.id,
    code: tier.code,
    name: tier.name,
    strategy: tier.strategy as PricingStrategyKind,
    markupBasisPoints: tier.markupBasisPoints,
    baseTierId: tier.baseTierId,
  };
}

function toDefinitionFromMap(
  byId: ReadonlyMap<string, PriceTierDefinition>,
  id: string,
): PriceTierDefinition {
  const existing = byId.get(id);

  if (!existing) {
    throw new PriceTierNotFoundError(id);
  }

  return existing;
}

/** "cost x 2.4", "Standard + 15%", "Manual prices". */
export function describeRule(
  tier: PriceTierDefinition,
  tiersById: ReadonlyMap<string, PriceTierDefinition>,
): string {
  switch (tier.strategy) {
    case 'COST_MULTIPLIER':
      return `cost x ${formatScale(tier.markupBasisPoints ?? 0)}`;

    case 'BASE_MARKUP': {
      const base = tier.baseTierId ? tiersById.get(tier.baseTierId) : undefined;

      return `${base?.name ?? 'unknown tier'} + ${formatPercent(tier.markupBasisPoints ?? 0)}%`;
    }

    default:
      return 'Manual prices';
  }
}

function formatScale(basisPoints: number): string {
  return trimTrailingZeros((basisPoints / BASIS_POINTS_SCALE).toFixed(4));
}

function formatPercent(basisPoints: number): string {
  return trimTrailingZeros((basisPoints / 100).toFixed(2));
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

function toResponse(
  tier: PriceTierRow,
  definitions: readonly PriceTierDefinition[],
  chain: string[],
): PriceTierResponse {
  const byId = new Map(definitions.map((entry) => [entry.id, entry]));
  const definition = toDefinition(tier);

  return {
    id: tier.id,
    code: tier.code,
    name: tier.name,
    strategy: definition.strategy,
    markupBasisPoints: tier.markupBasisPoints,
    baseTierId: tier.baseTierId,
    baseTierName: tier.baseTierId
      ? (byId.get(tier.baseTierId)?.name ?? null)
      : null,
    isDefault: tier.isDefault,
    active: tier.active,
    rule: describeRule(definition, byId),
    chain,
  };
}
