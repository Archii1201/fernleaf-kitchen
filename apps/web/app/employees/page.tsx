import EmployeesAdmin from './employees-admin';

export const metadata = {
  title: 'Employees | Fernleaf Kitchen',
};

export default function EmployeesPage() {
  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Employees</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Company employees, their delivery permissions and their allergies and
        dietary preferences. Moving an employee changes future behaviour only;
        past orders stay with the company that placed them.
      </p>
      <EmployeesAdmin />
    </main>
  );
}
