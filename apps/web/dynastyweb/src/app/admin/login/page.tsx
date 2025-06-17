import { Suspense } from 'react';
import AdminLoginClient from './AdminLoginClient';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" /></div>}>
      <AdminLoginClient />
    </Suspense>
  );
}
