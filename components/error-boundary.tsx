'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export function FatalFallback() {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="text-center px-6 max-w-md">
        <h1 className="text-2xl font-bold mb-4">
          Unable to load The Daily Feed
        </h1>
        <p className="mb-6" style={{ color: 'var(--foreground-muted)' }}>
          Reload the page to continue. If the problem continues, try again later.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="primary-action px-6 py-2 rounded font-medium button-hover-fade"
        >
          Reload page
        </button>
      </div>
    </main>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <FatalFallback />;
    }

    return this.props.children;
  }
}
