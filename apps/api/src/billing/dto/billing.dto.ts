import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/index.js';

export class CreateInvoiceDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds!: string[];
}

export class CreateCreditDto {
  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  invoiceId?: string;
}

export class ListInvoicesQueryDto extends PaginationQueryDto {}
export class ListBillableQueryDto extends PaginationQueryDto {}
