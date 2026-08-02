interface ErrorAlertProps {
  message: string
  onDismiss?: () => void
  onRetry?: () => void
}

/**
 * Inline error alert for async errors (e.g. Gemini API failure).
 * Distinct from ErrorBoundary which catches synchronous render errors.
 */
export function ErrorAlert({ message, onDismiss, onRetry }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-950/20 p-4"
    >
      <svg
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <div className="flex-1">
        <p className="text-sm text-red-300">{message}</p>
        <div className="mt-2 flex gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs font-medium text-red-400 underline hover:text-red-300"
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs font-medium text-red-400/60 hover:text-red-400"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}