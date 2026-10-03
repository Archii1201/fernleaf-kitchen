import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 'ef82f1a9-7da3-453d-bff9-5b493724b4d8';
const EMPLOYEE_ID = '19d9bc99-d074-4647-8982-8c6e2822d265';
const ADDRESS_ID = '6d6b0e8c-6adb-4691-ae86-a115bcf577ee';
const PRICE_TIER_ID = 'b0bc7d5f-30b1-4a52-beab-52f088128f20';

async function main() {
  console.log('Prisma benchmark connection OK.');
  console.log({
    COMPANY_ID,
    EMPLOYEE_ID,
    ADDRESS_ID,
    PRICE_TIER_ID,
  });

  await prisma.$queryRaw`SELECT 1`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
