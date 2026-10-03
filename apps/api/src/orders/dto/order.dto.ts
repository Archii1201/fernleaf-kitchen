import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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
import { TIME_PATTERN } from '../../companies/dto/company.dto.js';
import { ORDER_STATUSES } from '../domain/order-state.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class OrderSelectionDto {
  @ApiProperty()
  @IsUUID()
  optionGroupId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  optionIds!: string[];
}

export class OrderCombinationInputDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [OrderSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderSelectionDto)
  selections?: OrderSelectionDto[];
}

export class OrderLineInputDto {
  @ApiProperty()
  @IsUUID()
  dishId!: string;

  @ApiPropertyOptional({
    description: 'Menu category used as the order path. Secret categories are allowed when set.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ type: [OrderCombinationInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderCombinationInputDto)
  combinations!: OrderCombinationInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  customerEmployeeId!: string;

  @ApiProperty({ example: '2031-03-05' })
  @Matches(DATE_PATTERN, { message: 'deliveryDate must be YYYY-MM-DD' })
  deliveryDate!: string;

  @ApiPropertyOptional({ example: '12:30' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'deliveryTime must be HH:mm' })
  deliveryTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deliveryAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  packagingTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNotes?: string;

  @ApiProperty({ type: [OrderLineInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  lines!: OrderLineInputDto[];
}

export class UpdateOrderDto extends CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Expected order.version. Rejected when the order has moved on.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class ReplaceOrderLinesDto {
  @ApiProperty({ description: 'Expected order.version' })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({ type: [OrderLineInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  lines!: OrderLineInputDto[];
}

export class RejectOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;
}

export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Alias of limit, accepted by the assignment contract' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_PATTERN)
  deliveryDateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_PATTERN)
  deliveryDateTo?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  invoiced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  override get take(): number {
    return this.pageSize ?? this.limit;
  }
}
