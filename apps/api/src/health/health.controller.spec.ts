import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Mocked so the unit test needs no PostgreSQL connection.
    queryRaw = vi.fn().mockResolvedValue([{ 1: 1 }]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reports ok after a successful database round trip', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(queryRaw).toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting ok', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow('connection refused');
  });
});
