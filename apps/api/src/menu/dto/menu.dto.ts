import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
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
