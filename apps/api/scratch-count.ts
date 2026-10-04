import 'dotenv/config';
import { createSeedClient } from './prisma/seed.js';

async function main() {
  const p = createSeedClient();
  try {
    const c = {
      users: await p.user.count(),
      companies: await p.company.count(),
      employees: await p.customerEmployee.count(),
      dishes: await p.dish.count(),
      categories: await p.menuCategory.count(),
      orders: await p.order.count(),
      invoices: await p.invoice.count(),
      credits: await p.orderCredit.count(),
    };
    console.log('COUNTS:', JSON.stringify(c, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch(console.error);
