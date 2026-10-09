import * as Sentry from '@sentry/react';
import { AlertTriangle } from 'lucide-react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * `app`: the whole window, for a failure nothing else can show around.
   * `page`: inside the layout, so the navigation stays and the rest of the
   * app can still be reached when one screen fails.
   */
  scope?: 'app' | 'page';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// React error boundary that catches rendering errors in child components
// And displays a friendly fallback UI instead of a blank screen.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isPage = this.props.scope === 'page';

      return (
        <div
          role="alert"
          className={
            isPage
              ? 'flex flex-1 flex-col items-center justify-center min-h-[60vh] text-white px-4 py-10'
              : 'flex flex-col items-center justify-center min-h-dvh bg-black text-white px-6'
          }
        >
          <div className="glass-panel rounded-3xl p-8 w-full max-w-md text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-brand-secondary/12 text-brand-secondary flex items-center justify-center">
              <AlertTriangle size={26} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold">
              {i18n.t('common.error_title')}
            </h2>
            <p className="text-sm text-white/60">
              {i18n.t(
                isPage
                  ? 'common.error_message_page'
                  : 'common.error_message_refresh',
              )}
            </p>
            {/* The error text is technical and in English: developers only. */}
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-left text-xs text-red-400 bg-white/5 p-3 rounded-lg overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="min-h-12 px-6 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-sm font-bold shadow-lg shadow-brand-primary/25"
              >
                {i18n.t('common.try_again')}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-12 px-6 rounded-full bg-white/8 border border-white/10 hover:bg-white/12 transition-colors text-sm font-semibold"
              >
                {i18n.t('common.reload_page')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
