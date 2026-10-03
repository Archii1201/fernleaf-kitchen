import PricingAdmin from './pricing-admin';

export const metadata = {
  title: 'Pricing | Fernleaf Kitchen',
};

export default function PricingPage() {
  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Pricing</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Price tiers and the whole-tier price grid. Prices are stored as integer
        cents; derived prices round up to the next 5 cents.
      </p>
      <PricingAdmin />
    </main>
  );
}
