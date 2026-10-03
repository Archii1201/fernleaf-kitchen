'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('Test@1234');
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          })
            .then(() => router.push('/dashboard'))
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Login failed');
            });
        }}
      >
        <input className="border p-2" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input
          className="border p-2"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="rounded border px-3 py-2" type="submit">
          Sign in
        </button>
      </form>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
