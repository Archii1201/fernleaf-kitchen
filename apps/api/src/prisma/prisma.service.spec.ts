import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    // A syntactically valid connection string is enough: the service only
    // builds the PrismaPg adapter in its constructor and connects in
    // onModuleInit, which is not triggered by compile().
    const configService = {
      get: (key: string) =>
        key === 'DATABASE_URL'
          ? 'postgresql://user:password@localhost:5432/fernleaf_test'
          : undefined,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails fast when DATABASE_URL is not configured', () => {
    const emptyConfig = { get: () => undefined } as unknown as ConfigService;

    expect(() => new PrismaService(emptyConfig)).toThrow(
      'DATABASE_URL is not configured',
    );
  });
});
