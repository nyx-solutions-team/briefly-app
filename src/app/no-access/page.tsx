"use client";

import { useAuth } from '@/hooks/use-auth';

export default function NoAccessPage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">No access</h1>
        <p className="text-muted-foreground">
          Your account is not a member of any active organization. Please contact an administrator for access.
        </p>
        <div className="pt-2">
          <button onClick={signOut} className="underline">Return to sign in</button>
        </div>
      </div>
    </div>
  );
}

