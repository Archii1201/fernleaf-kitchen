import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MenuPreviewQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description:
      'When set, the preview uses this employee\'s company and is rejected if it does not match companyId.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class MenuAvailabilityItemDto {
  @ApiProperty()
  @IsUUID()
  dishId!: string;

  @ApiPropertyOptional({
    description:
      'When omitted, the dish is orderable if any visible category path succeeds.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/** Order-validation seam: same rules as preview, loud failures. */
export class MenuAvailabilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ type: [MenuAvailabilityItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MenuAvailabilityItemDto)
  items!: MenuAvailabilityItemDto[];
}

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Mains' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'mains' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  @MaxLength(80)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateMenuCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReorderMenuCategoriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  categoryIds!: string[];
}

export class MenuCategoryDishInputDto {
  @ApiProperty()
  @IsUUID()
  dishId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReplaceMenuCategoryDishesDto {
  @ApiProperty({ type: [MenuCategoryDishInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDishInputDto)
  dishes!: MenuCategoryDishInputDto[];
}

export class UpdateMenuCategoryDishDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
