import { describe, expect, it, vi } from 'vitest';
import { databaseIsEmpty, seedIfNeeded } from '../../prisma/seed.js';

describe('seed safety', () => {
  it('treats a database with users as populated', async () => {
    expect(await databaseIsEmpty({ user: { count: async () => 2 } } as never)).toBe(false);
    expect(await databaseIsEmpty({ user: { count: async () => 0 } } as never)).toBe(true);
  });

  it('does not seed a populated database unless forced', async () => {
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(4) },
    };
    const result = await seedIfNeeded(prisma as never, { force: false });
    expect(result.seeded).toBe(false);
  });
});
