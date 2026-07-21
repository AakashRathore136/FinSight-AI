import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Progress } from '@/src/components/ui/progress';
import { Check, X, Edit3, Save, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CategoryBudgetSuggestion, formatCurrency } from '@/src/lib/budgetUtils';

interface BudgetRecommendationsProps {
  suggestions: CategoryBudgetSuggestion[];
  totalBudget: number;
  confidenceScore: number;
  onSave: (suggestions: CategoryBudgetSuggestion[]) => void;
  onDiscard: () => void;
  isLoading?: boolean;
}

export function BudgetRecommendations({
  suggestions,
  totalBudget,
  confidenceScore,
  onSave,
  onDiscard,
  isLoading = false,
}: BudgetRecommendationsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [localSuggestions, setLocalSuggestions] = useState<CategoryBudgetSuggestion[]>(suggestions);

  const handleEdit = (suggestion: CategoryBudgetSuggestion) => {
    setEditingId(suggestion.category);
    setEditValue(String(suggestion.modifiedAmount ?? suggestion.suggestedAmount));
  };

  const handleSaveEdit = (category: string) => {
    const value = parseFloat(editValue);
    if (!isNaN(value) && value >= 0) {
      setLocalSuggestions(prev =>
        prev.map(s =>
          s.category === category
            ? { ...s, modifiedAmount: value, status: 'modified' as const }
            : s
        )
      );
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleStatusChange = (category: string, status: 'accepted' | 'rejected') => {
    setLocalSuggestions(prev =>
      prev.map(s =>
        s.category === category
          ? { ...s, status, modifiedAmount: status === 'rejected' ? 0 : s.suggestedAmount }
          : s
      )
    );
  };

  const handleReset = () => {
    setLocalSuggestions(suggestions);
    setEditingId(null);
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
    if (current < previous) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
    return <Minus className="h-3.5 w-3.5 text-slate-500" />;
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800 rounded-2xl">
        <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500 mt-4">Generating AI budget recommendations...</p>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <Card className="bg-slate-900 border-slate-800 rounded-2xl">
        <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px]">
          <p className="text-slate-500 text-sm font-medium">No budget suggestions available.</p>
          <p className="text-slate-600 text-xs mt-2">Add transactions to generate personalized recommendations.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800 rounded-2xl">
        <CardHeader className="p-6 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-white tracking-tight">
                AI-Generated Budget Recommendations
              </CardTitle>
              <p className="text-slate-500 text-xs mt-1 font-medium">
                Based on your last 3 months of spending patterns
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Confidence
                </span>
                <span className={`text-lg font-black ${getConfidenceColor(confidenceScore)}`}>
                  {confidenceScore}%
                </span>
              </div>
              <div className="w-32">
                <Progress value={confidenceScore} className="h-2" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4">
            {localSuggestions.map((suggestion) => {
              const isEditing = editingId === suggestion.category;
              const displayAmount = suggestion.status === 'rejected' ? 0 : (suggestion.modifiedAmount ?? suggestion.suggestedAmount);
              const isModified = suggestion.status === 'modified';
              const isRejected = suggestion.status === 'rejected';

              return (
                <div
                  key={suggestion.category}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
                    isRejected
                      ? 'bg-red-500/5 border-red-500/20 opacity-60'
                      : isModified
                        ? 'bg-amber-500/5 border-amber-500/20'
                        : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {suggestion.category}
                        </span>
                        {isModified && (
                          <Badge className="bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-wider border-amber-500/20">
                            Modified
                          </Badge>
                        )}
                        {isRejected && (
                          <Badge className="bg-red-500/10 text-red-400 text-[9px] font-black uppercase tracking-wider border-red-500/20">
                            Rejected
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-slate-500 font-medium">
                          Avg: {formatCurrency(suggestion.averageSpending)}
                        </span>
                        <span className="text-slate-700">|</span>
                        <div className="flex items-center gap-1">
                          {getTrendIcon(displayAmount, suggestion.previousMonthSpending)}
                          <span className="text-xs text-slate-500 font-medium">
                            Prev: {formatCurrency(suggestion.previousMonthSpending)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-28 h-9 text-sm bg-slate-900 border-slate-700 text-white rounded-lg"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(suggestion.category);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => handleSaveEdit(suggestion.category)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-lg font-black text-white tabular-nums w-24 text-right">
                          {formatCurrency(displayAmount)}
                        </span>

                        <div className="flex items-center gap-1">
                          {isRejected ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              onClick={() => handleStatusChange(suggestion.category, 'accepted')}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                                onClick={() => handleEdit(suggestion)}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleStatusChange(suggestion.category, 'rejected')}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Suggested Budget:
              </span>
              <span className="text-2xl font-black text-white tabular-nums">
                {formatCurrency(totalBudget)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-800 h-9 px-4 text-xs font-bold uppercase tracking-wider"
                onClick={handleReset}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reset
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-6 text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-900/20"
                onClick={() => onSave(localSuggestions)}
              >
                <Check className="h-3.5 w-3.5 mr-2" />
                Save Budget
              </Button>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9 px-4 text-xs font-bold uppercase tracking-wider"
                onClick={onDiscard}
              >
                Discard
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
