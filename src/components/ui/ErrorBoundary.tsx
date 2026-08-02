import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary for the AI analysis pipeline.
 * Catches unhandled errors in child components and renders a
 * user-friendly fallback with a retry button instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, send to your error monitoring service here
    console.error('[ErrorBoundary] Caught error:', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-red-300">
            Analysis Error
          </h3>
          <p className="mb-4 max-w-md text-sm text-red-400/80">
            {getFriendlyMessage(this.state.error)}
          </p>
          <button
            onClick={this.handleRetry}
            className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/** Maps known Gemini API error patterns to human-readable messages */
function getFriendlyMessage(error: Error | null): string {
  if (!error) return 'An unexpected error occurred. Please try again.'

  const msg = error.message.toLowerCase()

  if (msg.includes('quota') || msg.includes('429')) {
    return 'API quota exceeded. Please wait a moment before analyzing another document.'
  }
  if (msg.includes('too large') || msg.includes('file size') || msg.includes('413')) {
    return 'This document is too large for analysis. Please upload a file under 20MB.'
  }
  if (msg.includes('unsupported') || msg.includes('invalid file') || msg.includes('415')) {
    return 'This file type is not supported. Please upload a PDF, DOCX, or image file.'
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'Network error. Please check your internet connection and try again.'
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('api key')) {
    return 'API authentication failed. Please check your Gemini API key configuration.'
  }

  return 'Document analysis failed. Please try again or upload a different document.'
}