/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * Skeleton loader that mimics the analysis result card layout.
 * Shown while the Gemini API processes the uploaded document.
 */
export function AnalysisSkeleton() {
  return (
    <div className="animate-pulse space-y-6 rounded-xl border border-white/10 bg-white/5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-white/10" />
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="h-3 w-24 rounded bg-white/10" />
        </div>
      </div>

      {/* Executive summary block */}
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
        <div className="h-3 w-4/6 rounded bg-white/10" />
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2"
          >
            <div className="h-3 w-16 rounded bg-white/10" />
            <div className="h-6 w-20 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Risk score bar */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-4 w-full rounded-full bg-white/10">
          <div className="h-4 w-2/3 rounded-full bg-emerald-500/20" />
        </div>
      </div>

      {/* Bottom text lines */}
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-3/4 rounded bg-white/10" />
      </div>

      <p className="text-center text-xs text-white/30">
        Gemini is analysing your document…
      </p>
    </div>
  )
}