import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/index.js';

export class CreateOptionGroupDto {
  @ApiProperty({ example: 'SPICE-LEVEL' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Spice level' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Maximum selections per combination; omit for unlimited',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number;
}

export class UpdateOptionGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class OptionGroupMemberDto {
  @ApiProperty()
  @IsUUID()
  optionId!: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class SetOptionGroupOptionsDto {
  @ApiProperty({ type: [OptionGroupMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupMemberDto)
  options!: OptionGroupMemberDto[];
}

export class ListOptionGroupQueryDto extends PaginationQueryDto {}
