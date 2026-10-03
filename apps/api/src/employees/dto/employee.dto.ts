import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/index.js';

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class CreateEmployeeDto {
  @ApiProperty({ description: 'Employees belong to exactly one company' })
  @IsUUID()
  companyId!: string;

@ApiProperty({ example: 'alice@northwind.com' })
@Transform(({ value }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value,
)
@IsEmail()
@MaxLength(200)
email!: string;

  @ApiProperty({ example: 'Alice Mehta' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({
    description: "One of the company's addresses; where this person eats",
  })
  @IsOptional()
  @IsUUID()
  defaultAddressId?: string;

  @ApiPropertyOptional({ description: 'May choose the delivery address' })
  @IsOptional()
  @IsBoolean()
  canChooseAddress?: boolean;

  @ApiPropertyOptional({ description: 'May choose the delivery time' })
  @IsOptional()
  @IsBoolean()
  canChooseDeliveryTime?: boolean;

  @ApiPropertyOptional({ description: 'May choose the packaging' })
  @IsOptional()
  @IsBoolean()
  canChoosePackaging?: boolean;

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

  @ApiPropertyOptional({ description: 'Free text in addition to allergen ids' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergyNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dietaryNotes?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({
    description:
      'Moves the employee to another company. Historical orders are never rewritten.',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultAddressId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canChooseAddress?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canChooseDeliveryTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canChoosePackaging?: boolean;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergyNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dietaryNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListEmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter to one company' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsIn([true, false])
  active?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive name or email search' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(200)
  search?: string;
}
