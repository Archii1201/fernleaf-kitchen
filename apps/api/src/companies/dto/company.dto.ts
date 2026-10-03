import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/index.js';
import { WEEKDAYS } from '../../kitchen/time/weekday.js';

/** `HH:mm` in the application timezone. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes in a day; the matching CHECK lives in postgres_constraints.sql. */
export const MAX_LEAVE_KITCHEN_MINUTES = 1_440;

export const DEFAULT_LEAVE_KITCHEN_MINUTES = 30;

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class CompanyAddressInputDto {
  @ApiProperty({ example: 'Head office' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  postalCode!: string;

  @ApiPropertyOptional({ default: 'IN' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNotes?: string;
}

export class UpdateCompanyAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  line1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCompanyDto {
  @ApiProperty({ example: 'Northwind Analytics' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiProperty()
  @IsUUID()
  priceTierId!: string;

  @ApiProperty({
    type: [String],
    description: 'At least one company-owned email domain',
    example: ['northwind.com'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  domains!: string[];

  @ApiPropertyOptional({ type: [CompanyAddressInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyAddressInputDto)
  addresses?: CompanyAddressInputDto[];

  @ApiPropertyOptional({ enum: WEEKDAYS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(WEEKDAYS, { each: true })
  workingDays?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  billingContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  billingContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  billingContactPhone?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  billingContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  billingContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  billingContactPhone?: string;

  @ApiPropertyOptional({ description: 'Must be an employee of this company' })
  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDeliveryDefaultsDto {
  @ApiPropertyOptional({ description: 'One of this company\'s addresses' })
  @IsOptional()
  @IsUUID()
  defaultAddressId?: string | null;

  @ApiPropertyOptional({ example: '12:30' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'defaultDeliveryTime must be HH:mm' })
  defaultDeliveryTime?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultPackagingTypeId?: string | null;

  @ApiPropertyOptional({ default: DEFAULT_LEAVE_KITCHEN_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_LEAVE_KITCHEN_MINUTES)
  leaveKitchenMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  driverInstructions?: string | null;

  @ApiPropertyOptional({ description: 'Staff id of an eligible driver' })
  @IsOptional()
  @IsUUID()
  defaultDriverStaffId?: string | null;
}

export class UpdateCompanyPriceTierDto {
  @ApiProperty()
  @IsUUID()
  priceTierId!: string;
}

export class AddCompanyDomainDto {
  @ApiProperty({ example: 'northwind.com' })
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;
}

export class UpdateCompanyCalendarDto {
  @ApiProperty({ enum: WEEKDAYS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEEKDAYS, { each: true })
  workingDays!: string[];
}

export class CreateCompanyHolidayDto {
  @ApiProperty({ example: '2026-12-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class UpdateMenuVisibilityDto {
  @ApiProperty({ type: [String], description: 'Menu category ids to hide' })
  @IsArray()
  @IsUUID('4', { each: true })
  hiddenCategoryIds!: string[];

  @ApiProperty({ type: [String], description: 'Dish ids to hide' })
  @IsArray()
  @IsUUID('4', { each: true })
  hiddenDishIds!: string[];
}

export class ListCompanyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsIn([true, false])
  active?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive name or domain search' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(160)
  search?: string;
}
