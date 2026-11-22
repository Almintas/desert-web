import { SHOP_NAME } from '@desert-web/shared';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Prisijungimas' };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="card">
        <p className="brand">{SHOP_NAME}</p>
        <h1>Prisijungimas</h1>
        <LoginForm />
      </div>
    </main>
  );
}
