import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldCheck } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public props: Readonly<ErrorBoundaryProps>;
  public state: ErrorBoundaryState;
  public setState!: Component<ErrorBoundaryProps, ErrorBoundaryState>['setState'];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Arka Enterprise ErrorBoundary caught an unhandled exception:', error, errorInfo);
    if (typeof this.setState === 'function') {
      this.setState({ error, errorInfo });
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetState = (): void => {
    this.state = { hasError: false, error: null, errorInfo: null };
    if (typeof this.setState === 'function') {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 max-w-lg w-full p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle size={36} />
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-900">
                سامانه به طور موقت با خطا مواجه شد
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                یک خطای غیرمنتظره رخ داد. برای حفظ امنیت داده‌ها، سامانه به حالت محافظت‌شده منتقل گردید.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-900 text-rose-300 p-3 rounded-xl text-right text-[11px] font-mono overflow-x-auto max-h-32 border border-slate-800">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>بازخوانی مجدد صفحه</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetState}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Home size={16} />
                <span>تلاش مجدد و بازگشت</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>تمام داده‌ها و فاکتورهای شما در دیتابیس محفوظ باقی مانده‌اند.</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
