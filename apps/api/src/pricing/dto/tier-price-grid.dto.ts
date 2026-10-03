import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/index.js';
import {
  PRICED_ITEM_TYPES,
  type MissingPriceReason,
  type PriceSource,
  type PricedItemType,
} from '../domain/pricing.types.js';

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class TierPriceGridQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PRICED_ITEM_TYPES, default: 'dish' })
  @IsOptional()
  @IsIn(PRICED_ITEM_TYPES)
  type?: PricedItemType;

  @ApiPropertyOptional({ description: 'Only rows with no effective price' })
  @IsOptional()
  @Transform(toBoolean)
  @IsIn([true, false])
  missingOnly?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive name/code search' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TierPriceGridRow {
  @ApiProperty({ enum: PRICED_ITEM_TYPES }) itemType!: PricedItemType;
  @ApiProperty() itemId!: string;
  @ApiProperty({ description: 'SKU for a dish, code for an option' })
  reference!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Internal cost in integer cents' })
  costCents!: number;
  @ApiProperty({
    nullable: true,
    description: 'What the tier rule produces, ignoring any override',
  })
  derivedPriceCents!: number | null;
  @ApiProperty({ nullable: true, description: 'Manually entered price' })
  overrideCents!: number | null;
  @ApiProperty({ nullable: true, description: 'Null when the price is missing' })
  effectivePriceCents!: number | null;
  @ApiProperty({ nullable: true, enum: ['EXPLICIT', 'DERIVED'] })
  source!: PriceSource | null;
  @ApiProperty() missing!: boolean;
  @ApiProperty({ nullable: true }) missingReason!: MissingPriceReason | null;
  @ApiProperty({
    nullable: true,
    description: 'Tier that produced the price; may be a base tier',
  })
  resolvedFromTierId!: string | null;
}

export class SetTierPriceDto {
  @ApiProperty({ enum: PRICED_ITEM_TYPES })
  @IsIn(PRICED_ITEM_TYPES)
  itemType!: PricedItemType;

  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty({
    nullable: true,
    description: 'Integer cents, or null to clear the override',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents!: number | null;
}

export class BulkSetTierPricesDto {
  @ApiProperty({ type: [SetTierPriceDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SetTierPriceDto)
  prices!: SetTierPriceDto[];
}

export class BulkSetTierPricesResponse {
  @ApiProperty() updated!: number;
  @ApiProperty() cleared!: number;
}
