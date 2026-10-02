import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 150 })
  total!: number;

  @ApiProperty({ example: 8 })
  totalPages!: number;
}

/** Envelope returned by every list endpoint. */
export class PaginatedResponse<T> {
  data!: T[];
  meta!: PaginationMeta;
}

export interface PaginationInput {
  page: number;
  limit: number;
  total: number;
}

export function buildPaginationMeta({
  page,
  limit,
  total,
}: PaginationInput): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function paginate<T>(
  data: T[],
  pagination: PaginationInput,
): PaginatedResponse<T> {
  return { data, meta: buildPaginationMeta(pagination) };
}
