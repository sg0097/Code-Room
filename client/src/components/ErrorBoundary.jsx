import { Component } from 'react'

/**
 * Catches a crash inside its children and shows a short message instead of a blank page.
 * `inline` is for one broken part of a page (a diagram); without it the whole screen is replaced.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('[ui]', error)
  }
  // A new page or a new value gets another try.
  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.inline) return <div className="muted small broken-part">{this.props.message || "This part couldn't be shown."}</div>
    return (
      <div className="center">
        <div className="card join-card">
          <h2>Something went wrong</h2>
          <p className="muted">The page hit a problem. Reloading usually fixes it.</p>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
