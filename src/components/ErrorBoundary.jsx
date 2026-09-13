import { Component } from "react";

/**
 * Catches a render-time crash so one broken page doesn't blank the whole app.
 * Data-fetch failures are handled inline by each page; this is the backstop for
 * everything else.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="page error-page">
        <div className="panel error-card">
          <span className="error-code">Error</span>
          <h1 className="page-title">Something went wrong on this page</h1>
          <p className="page-sub">
            The rest of the app is fine. Reloading usually clears it — your data is untouched.
          </p>

          <p className="page-error">{error.message || String(error)}</p>

          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
