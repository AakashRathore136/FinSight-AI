// HOW TO USE in your analysis page component:
//
// import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
// import { AnalysisSkeleton } from '@/components/ui/AnalysisSkeleton'
// import { ErrorAlert } from '@/components/ui/ErrorAlert'
// import { useAnalysis } from '@/hooks/useAnalysis'
//
// function AnalysisPage() {
//   const { result, isAnalyzing, error, analyze, reset } = useAnalysis(runGeminiAnalysis)
//
//   return (
//     <ErrorBoundary>
//       <div>
//         <button onClick={() => analyze(uploadedFile)} disabled={isAnalyzing}>
//           {isAnalyzing ? 'Analysing...' : 'Analyse Document'}
//         </button>
//
//         {isAnalyzing && <AnalysisSkeleton />}
//         {error && <ErrorAlert message={error} onRetry={reset} onDismiss={reset} />}
//         {result && <AnalysisResultCard result={result} />}
//       </div>
//     </ErrorBoundary>
//   )
// }