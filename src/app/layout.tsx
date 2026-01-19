import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { UsersProvider } from '@/hooks/use-users';
import { AuthProvider } from '@/hooks/use-auth';
import ErrorBoundary from '@/components/error-boundary';
import { AppProviders } from '@/components/app-providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Briefly',
  description: 'Briefly · Intelligent Document Management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <ErrorBoundary>
          <UsersProvider>
            <AuthProvider>
              <ErrorBoundary>
                <AppProviders>{children}</AppProviders>
              </ErrorBoundary>
            </AuthProvider>
          </UsersProvider>
          <Toaster />
        </ErrorBoundary>
      </body>
    </html>
  );
}
