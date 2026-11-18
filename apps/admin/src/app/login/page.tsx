import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Prisijungimas · Desert Web Admin' };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="card">
        <p className="brand">Desert Web</p>
        <h1>Prisijungimas</h1>
        <LoginForm />
      </div>
    </main>
  );
}
