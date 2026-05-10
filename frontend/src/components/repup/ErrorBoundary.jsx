import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-2xl border-2 border-[#FF3B30]/40 bg-[#FF3B30]/10 p-4 text-sm text-[#FF8A82]"
          data-testid="error-boundary"
        >
          <div className="font-display text-base font-black text-[#FF3B30]">
            Something broke here
          </div>
          <div className="mt-1 text-xs">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={this.reset}
            className="btn-push btn-ghost mt-3 px-3 py-1 text-xs"
            data-testid="error-boundary-retry"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
