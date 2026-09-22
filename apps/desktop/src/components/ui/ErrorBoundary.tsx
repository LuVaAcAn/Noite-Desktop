import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no recuperable de la interfaz', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-dvh items-center justify-center overflow-hidden p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xl">
          <h1 className="text-xl font-bold text-noche-text">Algo salió mal</h1>
          <p className="mt-2 text-sm text-noche-muted">Tus datos no se borraron. Reinicia esta pantalla y vuelve a intentarlo.</p>
          <button className="mt-5 rounded-full bg-noche-text px-5 py-2.5 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reiniciar pantalla</button>
        </div>
      </main>
    );
  }
}
