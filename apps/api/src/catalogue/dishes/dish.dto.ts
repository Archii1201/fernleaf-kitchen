import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
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
import { PaginationQueryDto } from '../../common/pagination/index.js';

export const DISH_TEMPERATURES = ['HOT', 'COLD', 'AMBIENT'] as const;
export type DishTemperature = (typeof DISH_TEMPERATURES)[number];

export class CreateDishDto {
  @ApiProperty({ example: 'Paneer Wrap' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'WRAP-PNR-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku!: string;

  @ApiProperty({ enum: DISH_TEMPERATURES })
  @IsIn(DISH_TEMPERATURES)
  temperature!: DishTemperature;

  @ApiProperty({ example: 25000, description: 'Internal cost in integer cents' })
  @IsInt()
  @Min(0)
  costCents!: number;

  @ApiProperty()
  @IsUUID()
  kitchenStationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  portionSizeId?: string;

  @ApiPropertyOptional({ description: 'DbFile id of the dish image' })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @ApiPropertyOptional({ example: 5, description: 'Maps to Dish.moq' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQuantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allergenIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dietaryTagIds?: string[];
}

export class UpdateDishDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional({ enum: DISH_TEMPERATURES })
  @IsOptional()
  @IsIn(DISH_TEMPERATURES)
  temperature?: DishTemperature;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  costCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  kitchenStationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  portionSizeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQuantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allergenIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dietaryTagIds?: string[];
}

export class SetDishActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active!: boolean;
}

export class SetDishOptionGroupsDto {
  @ApiProperty({ type: [String], description: 'Option group ids, in order' })
  @IsArray()
  @IsUUID('4', { each: true })
  optionGroupIds!: string[];
}

export class ListDishQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active state' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive name or SKU search' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(120)
  search?: string;
}
