import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  buildPaginationMeta,
  MAX_LIMIT,
  paginate,
  PaginationQueryDto,
} from './index.js';

function toDto(query: Record<string, unknown>): PaginationQueryDto {
  return plainToInstance(PaginationQueryDto, query, {
    enableImplicitConversion: false,
  });
}

describe('PaginationQueryDto', () => {
  it('applies defaults when the query is empty', () => {
    const dto = toDto({});

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('transforms string query values into numbers', () => {
    const dto = toDto({ page: '3', limit: '10' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(10);
    expect(dto.skip).toBe(20);
    expect(dto.take).toBe(10);
  });

  it('rejects a limit above the maximum', () => {
    const errors = validateSync(toDto({ limit: String(MAX_LIMIT + 1) }));

    expect(errors.map((error) => error.property)).toContain('limit');
  });

  it('rejects a page below one', () => {
    const errors = validateSync(toDto({ page: '0' }));

    expect(errors.map((error) => error.property)).toContain('page');
  });

  it('rejects unknown properties when whitelisting is enforced', () => {
    const errors = validateSync(toDto({ sort: 'name' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).not.toHaveLength(0);
  });
});

describe('pagination meta', () => {
  it('computes totalPages', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 150 })).toEqual({
      page: 1,
      limit: 20,
      total: 150,
      totalPages: 8,
    });
  });

  it('reports zero pages for an empty result set', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 0 }).totalPages).toBe(
      0,
    );
  });

  it('wraps data in the paginated envelope', () => {
    expect(paginate([], { page: 1, limit: 20, total: 0 })).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });
});
