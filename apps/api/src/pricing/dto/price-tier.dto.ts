import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PRICING_STRATEGIES,
  type PricingStrategyKind,
} from '../domain/pricing.types.js';

export class CreatePriceTierDto {
  @ApiProperty({ example: 'PARTNER' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Partner' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PRICING_STRATEGIES })
  @IsIn(PRICING_STRATEGIES)
  strategy!: PricingStrategyKind;

  @ApiPropertyOptional({
    example: 1500,
    description:
      'Basis points. 24000 = cost x 2.4 (COST_MULTIPLIER); 1500 = base + 15% (BASE_MARKUP).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  markupBasisPoints?: number;

  @ApiPropertyOptional({ description: 'Required for BASE_MARKUP tiers' })
  @IsOptional()
  @IsUUID()
  baseTierId?: string;
}

export class UpdatePriceTierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: PRICING_STRATEGIES })
  @IsOptional()
  @IsIn(PRICING_STRATEGIES)
  strategy?: PricingStrategyKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  markupBasisPoints?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  baseTierId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PriceTierResponse {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PRICING_STRATEGIES }) strategy!: PricingStrategyKind;
  @ApiProperty({ nullable: true }) markupBasisPoints!: number | null;
  @ApiProperty({ nullable: true }) baseTierId!: string | null;
  @ApiProperty({ nullable: true }) baseTierName!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() active!: boolean;
  @ApiProperty({
    description: 'Human-readable derivation rule, e.g. "Standard + 15%"',
  })
  rule!: string;
  @ApiProperty({ type: [String], description: 'Tier ids, root last' })
  chain!: string[];
}
