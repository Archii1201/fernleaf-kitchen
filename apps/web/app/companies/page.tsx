import CompaniesAdmin from './companies-admin';

export const metadata = {
  title: 'Companies | Fernleaf Kitchen',
};

export default function CompaniesPage() {
  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Companies</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Customer companies, their email domains, delivery addresses, receiving
        calendar, delivery defaults, price tier and menu visibility.
      </p>
      <CompaniesAdmin />
    </main>
  );
}
