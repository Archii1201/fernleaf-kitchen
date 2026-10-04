import type { Prisma } from '@prisma/client';

export const RICH_DOMAINS = ['tatadigital.com', 'infosys.com', 'razorpay.com', 'swiggy.in', 'zerodha.com', 'techmahindra.com'];
export const DEMO_ORDER_NUMBERS = ['DEMO-HIST-001', 'DEMO-TODAY-001', 'DEMO-FUT-001', 'DEMO-HIST-VOID-001',
  ...Array.from({ length: 26 }, (_, index) =>
    `RICH-${index < 8 ? 'PAST' : index < 14 ? 'TODAY' : 'FUTURE'}-${String(100 + index).padStart(4, '0')}`)];

/** Call only in a rollback-only transaction. Preserve all existing IDs/FKs/history,
 * while freeing natural lookup keys so seeds create independent new scenarios. */
export async function reserveDemoCompanies(tx: Prisma.TransactionClient, domains: string[]) {
  const rows = await tx.companyDomain.findMany({ where: { domain: { in: domains } } });
  for (const row of rows) {
    await tx.companyDomain.update({ where: { id: row.id }, data: { domain: `fixture-preserved-${row.id}.test` } });
  }
  const employees = await tx.customerEmployee.findMany({ where: { companyId: { in: rows.map((row) => row.companyId) } } });
  for (const row of employees) {
    await tx.customerEmployee.update({ where: { id: row.id }, data: { email: `fixture-preserved-${row.id}@example.test` } });
  }
}
