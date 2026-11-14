import React from 'react';
import { getStoredLanguage, getTranslations } from '../i18n';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const tr = getTranslations(getStoredLanguage());
    return {
      hasError: true,
      message: error.message || tr.errors.unexpected,
    };
  }

  render() {
    if (this.state.hasError) {
      const tr = getTranslations(getStoredLanguage());
      return (
        <div className="min-h-screen bg-[#f4f7fb] dark:bg-[#0E1621] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] p-6 shadow-lg space-y-4">
            <h2 className="text-lg font-bold text-[#0E1621] dark:text-white">
              {tr.errors.somethingWrong}
            </h2>
            <p className="text-xs text-slate-700 dark:text-[#C5D3E0] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-10 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold cursor-pointer"
            >
              {tr.errors.reloadApp}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
