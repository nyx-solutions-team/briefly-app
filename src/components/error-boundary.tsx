"use client";

import React from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{
    error?: Error;
    resetError: () => void;
  }>;
}

const DefaultErrorFallback: React.FC<{
  error?: Error;
  resetError: () => void;
}> = ({ error, resetError }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-4 p-8 max-w-md">
      <div className="text-6xl mb-4">⚠️</div>
      <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="text-muted-foreground">
        {error?.message || 'An unexpected error occurred while loading the application.'}
      </p>
      <div className="space-y-2">
        <Button onClick={resetError} className="w-full">
          Try Again
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.href = '/'}
          className="w-full"
        >
          Go Home
        </Button>
      </div>
      {process.env.NODE_ENV === 'development' && error && (
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Error Details (Development)
          </summary>
          <pre className="mt-2 text-xs bg-muted p-2 rounded text-red-600 overflow-auto">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  </div>
);

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error);
      console.error('Error Info:', errorInfo);
    }

    // Here you could send to an error reporting service like Sentry
    // logErrorToService(error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Hook for functional components to handle async errors
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    setError(errorObj);
    console.error('Async error caught:', errorObj);
  }, []);

  // Throw error to be caught by Error Boundary
  if (error) {
    throw error;
  }

  return { handleError, resetError };
}

// Specific error fallbacks for different sections
export const DocumentErrorFallback: React.FC<{
  error?: Error;
  resetError: () => void;
}> = ({ error, resetError }) => (
  <div className="text-center py-12 space-y-4">
    <div className="text-4xl mb-4">📄</div>
    <h2 className="text-xl font-semibold">Document Error</h2>
    <p className="text-muted-foreground max-w-md mx-auto">
      {error?.message || 'There was a problem loading the document.'}
    </p>
    <div className="space-x-2">
      <Button onClick={resetError} variant="outline">
        Try Again
      </Button>
      <Button
        onClick={() => window.history.back()}
        variant="outline"
      >
        Go Back
      </Button>
    </div>
  </div>
);

export const ChatErrorFallback: React.FC<{
  error?: Error;
  resetError: () => void;
}> = ({ error, resetError }) => (
  <div className="text-center py-8 space-y-4">
    <div className="text-3xl mb-4">💬</div>
    <h2 className="text-lg font-semibold">Chat Error</h2>
    <p className="text-muted-foreground text-sm">
      {error?.message || 'The chat system encountered an error.'}
    </p>
    <Button onClick={resetError} size="sm">
      Restart Chat
    </Button>
  </div>
);
