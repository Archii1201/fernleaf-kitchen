import 'dotenv/config';
import { createSeedClient } from './prisma/seed.js';

async function main() {
  const p = createSeedClient();
  try {
    const driver = await p.staff.findUnique({ where: { staffCode: 'DRIVER-001' } });
    const drops = await p.drop.findMany({ where: { driverStaffId: driver?.id } });
    console.log('DRIVER DROPS:', drops.length, drops);
  } finally {
    await p.$disconnect();
  }
}

main().catch(console.error);
