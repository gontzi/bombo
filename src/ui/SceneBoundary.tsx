import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** If WebGL is unavailable the app keeps working: spins still resolve and show the result. */
export class SceneBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="stage__fallback">
          <p>
            Este navegador no puede mostrar la rueda 3D. Puedes seguir girando: el resultado aparecerá igualmente.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
