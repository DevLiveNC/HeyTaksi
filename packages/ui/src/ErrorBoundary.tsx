import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uygulama hatası', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="app-error" role="alert">
        <span>HT</span>
        <h1>Sayfa yüklenemedi</h1>
        <p>{this.state.error.message || 'Beklenmeyen bir hata oluştu.'}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>Yeniden dene</button>
      </div>
    );
  }
}
