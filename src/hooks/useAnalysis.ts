import { useState, useCallback } from 'react'

export interface AnalysisResult {
  summary: string
  riskScore: number
  metrics: Record<string, string | number>
  rawResponse: string
}

export interface UseAnalysisReturn {
  result: AnalysisResult | null
  isAnalyzing: boolean
  error: string | null
  analyze: (file: File) => Promise<void>
  reset: () => void
}

/**
 * Hook encapsulating the Gemini document analysis lifecycle:
 * loading state, error handling, and result storage.
 *
 * Usage:
 *   const { result, isAnalyzing, error, analyze, reset } = useAnalysis()
 */
export function useAnalysis(
  runAnalysis: (file: File) => Promise<AnalysisResult>
): UseAnalysisReturn {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(
    async (file: File) => {
      setIsAnalyzing(true)
      setError(null)
      setResult(null)

      try {
        const analysisResult = await runAnalysis(file)
        setResult(analysisResult)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred'
        setError(getFriendlyError(message))
      } finally {
        setIsAnalyzing(false)
      }
    },
    [runAnalysis]
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setIsAnalyzing(false)
  }, [])

  return { result, isAnalyzing, error, analyze, reset }
}

function getFriendlyError(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('quota') || msg.includes('429'))
    return 'Gemini API quota exceeded. Please wait a moment and try again.'
  if (msg.includes('too large') || msg.includes('413'))
    return 'File too large. Please upload a document under 20MB.'
  if (msg.includes('unsupported') || msg.includes('415'))
    return 'Unsupported file type. Please upload a PDF or image.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Network error. Check your connection and retry.'
  if (msg.includes('401') || msg.includes('unauthorized'))
    return 'Invalid API key. Check your VITE_GEMINI_API_KEY.'
  return `Analysis failed: ${message}`
}