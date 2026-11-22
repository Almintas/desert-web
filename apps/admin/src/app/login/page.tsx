import type { Metadata } from 'next';
import { Wordmark } from '@/components/wordmark';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Prisijungimas' };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="card">
        <Wordmark />
        <h1>Prisijungimas</h1>
        <LoginForm />
      </div>
    </main>
  );
}
