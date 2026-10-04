'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Feedback } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/api/client';
import { login } from '../../lib/api/auth';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { profile, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) router.replace('/dashboard');
  }, [profile, router]);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[var(--navy)] p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--orange)]/15" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--orange)] text-[var(--navy-dark)]">
            <Icon name="leaf" />
          </span>
          <span className="serif text-2xl font-semibold">Fernleaf Kitchen</span>
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow text-[var(--orange)]">Operations</p>
          <p className="serif mt-3 text-5xl font-semibold leading-tight">Every plate, on time, from pass to desk.</p>
          <p className="mt-4 text-white/70">Orders, kitchen, dispatch and billing in one calm place.</p>
        </div>
        <p className="relative text-xs text-white/50">© Fernleaf Kitchen</p>
      </section>

      <section className="paper grid place-items-center bg-[var(--cream)] px-4 py-12">
        <form
          className="slide-up w-full max-w-md space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-modal)]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError(null);
            login(String(data.get('email')).trim(), String(data.get('password')))
              .then(() => refresh())
              .then((signedIn) => {
                if (signedIn) router.replace('/dashboard');
                else setError('Signed in, but your profile could not be loaded.');
              })
              .catch((caught: unknown) => setError(errorMessage(caught)))
              .finally(() => setBusy(false));
          }}
        >
          <div>
            <p className="eyebrow">Fernleaf Kitchen</p>
            <h1 className="serif mt-1 text-4xl font-semibold text-[var(--navy)]">Welcome back</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Sign in to the operations panel.</p>
          </div>
          <Feedback error={error} />
          <Input name="email" label="Email" type="email" autoComplete="username" required autoFocus />
          <Input name="password" label="Password" type="password" autoComplete="current-password" required />
          <Button type="submit" size="lg" className="w-full" busy={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  );
}
