import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** If WebGL is unavailable the app keeps working: draws still resolve and show the called ball. */
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
            Este navegador no puede mostrar la sala en 3D. El sorteo funciona igual: la bola que salga aparecerá
            en la placa.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
