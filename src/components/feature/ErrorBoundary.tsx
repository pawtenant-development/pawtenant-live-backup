import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * ErrorBoundary — catches any unhandled React render errors and shows a
 * friendly fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-5">
            <i className="ri-error-warning-line text-orange-500 text-3xl"></i>
          </div>

          <h1 className="text-xl font-extrabold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            We hit an unexpected snag. Your progress may still be saved — try
            reloading or head back to the homepage.
          </p>

          {import.meta.env.DEV && this.state.errorMessage && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
              <p className="text-xs font-mono text-red-700 break-words">
                {this.state.errorMessage}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-refresh-line"></i>
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <i className="ri-home-2-line"></i>
              Go to Homepage
            </button>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            Need help?{" "}
            <a
              href="tel:+14099655885"
              className="text-orange-500 hover:underline cursor-pointer"
            >
              Call 409-965-5885
            </a>
          </p>
        </div>
      </div>
    );
  }
}
