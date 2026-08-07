import { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Calculator,
  Download,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Save,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  COUNTRY_TAX_DATA,
  calculateTax,
  calculateEffectiveRate,
  generateTaxSummary,
  formatCurrency,
  formatPercent,
  type TaxBreakdown,
  type TaxEstimateRecord,
} from '@/src/lib/taxUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Select } from '@/src/components/ui/select';

interface TaxEstimationProps {
  user: any;
}

type IncomeFrequency = 'annual' | 'monthly';

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TaxEstimation({ user }: TaxEstimationProps) {
  const [countryCode, setCountryCode] = useState('US');
  const [regionCode, setRegionCode] = useState('US-FED');
  const [incomeInput, setIncomeInput] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency>('annual');
  const [breakdown, setBreakdown] = useState<TaxBreakdown | null>(null);
  const [previousYear, setPreviousYear] = useState<TaxEstimateRecord | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const country = useMemo(
    () => COUNTRY_TAX_DATA.find((c) => c.code === countryCode),
    [countryCode]
  );

  const regions = country?.regions || [];

  // Keep region in sync when country changes
  useEffect(() => {
    if (regions.length > 0 && !regions.find((r) => r.code === regionCode)) {
      setRegionCode(regions[0].code);
    }
  }, [regions, regionCode]);

  // Load the most recent previous estimate for comparison
  useEffect(() => {
    if (!user) return;
    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const q = query(
          collection(db, 'tax_estimates'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        // Pick the latest record that differs from the current selection
        const prev = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TaxEstimateRecord, 'id'>) }))
          .find((r) => r.country !== country?.name || r.region !== regions.find((x) => x.code === regionCode)?.name);
        if (prev) {
          setPreviousYear({
            ...prev,
            effectiveRate: calculateEffectiveRate(prev.totalTax, prev.income),
          });
        } else {
          setPreviousYear(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'tax_estimates');
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [user, country, regions, regionCode]);

  const annualIncome = useMemo(() => {
    const amount = parseFloat(incomeInput);
    if (isNaN(amount) || amount <= 0) return 0;
    return frequency === 'monthly' ? amount * 12 : amount;
  }, [incomeInput, frequency]);

  useEffect(() => {
    if (annualIncome > 0) {
      const result = calculateTax(annualIncome, countryCode, regionCode);
      setBreakdown(result);
    } else {
      setBreakdown(null);
    }
  }, [annualIncome, countryCode, regionCode]);

  const handleSave = async () => {
    if (!user || !breakdown) {
      toast.error('Enter a valid income to estimate first');
      return;
    }
    try {
      const record: TaxEstimateRecord = {
        userId: user.uid,
        country: breakdown.country,
        region: breakdown.region,
        income: breakdown.income,
        federalTax: breakdown.federalTax,
        stateTax: breakdown.stateTax,
        localTax: breakdown.localTax,
        totalTax: breakdown.totalTax,
        effectiveRate: breakdown.effectiveRate,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'tax_estimates'), record);
      toast.success('Tax estimate saved');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tax_estimates');
      toast.error('Failed to save estimate');
    }
  };

  const handleDownloadPDF = () => {
    if (!breakdown) {
      toast.error('Nothing to download yet');
      return;
    }
    const content = generateTaxSummary(breakdown);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      downloadFile('tax-summary.txt', content, 'text/plain');
      return;
    }
    printWindow.document.write(`<pre>${content.replace(/</g, '&lt;')}</pre>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownloadCSV = () => {
    if (!breakdown) {
      toast.error('Nothing to download yet');
      return;
    }
    const header = 'Country,Region,Income,FederalTax,StateTax,LocalTax,TotalTax,EffectiveRate';
    const row = [
      breakdown.country,
      breakdown.region,
      breakdown.income.toFixed(2),
      breakdown.federalTax.toFixed(2),
      breakdown.stateTax.toFixed(2),
      breakdown.localTax.toFixed(2),
      breakdown.totalTax.toFixed(2),
      (breakdown.effectiveRate * 100).toFixed(2) + '%',
    ].join(',');
    downloadFile('tax-summary.csv', `${header}\n${row}\n`, 'text/csv');
  };

  const currency = breakdown?.currency || country?.currency || 'USD';
  const delta = previousYear && breakdown
    ? breakdown.effectiveRate - previousYear.effectiveRate
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white leading-none flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Calculator size={24} />
            </div>
            Tax Estimator
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Estimate regional income tax across multiple countries and regions.
          </p>
        </div>
        {breakdown && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCSV}
              className="h-10 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <FileSpreadsheet className="mr-2" size={14} />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              className="h-10 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <FileText className="mr-2" size={14} />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              <Save className="mr-2" size={14} />
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Input form */}
        <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-800">
            <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Calculator size={18} />
              </div>
              Estimate Inputs
            </CardTitle>
            <CardDescription className="text-slate-500 mt-1">
              Select your region and enter your income.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Country
              </label>
              <Select
                value={countryCode}
                onValueChange={setCountryCode}
                className="bg-slate-800 border-slate-700 text-white h-12"
                options={COUNTRY_TAX_DATA.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Region / State
              </label>
              <Select
                value={regionCode}
                onValueChange={setRegionCode}
                className="bg-slate-800 border-slate-700 text-white h-12"
                options={regions.map((r) => ({ value: r.code, label: r.name }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Income
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={`Income in ${currency}`}
                  value={incomeInput}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val < 0) {
                      setIncomeInput('0');
                    } else {
                      setIncomeInput(e.target.value);
                    }
                  }}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-12 tabular-nums"
                  min="0"
                  step="100"
                />
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as IncomeFrequency)}
                  className="bg-slate-800 border-slate-700 text-white h-12 w-36"
                  options={[
                    { value: 'annual', label: 'Annual' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
              </div>
              {frequency === 'monthly' && annualIncome > 0 && (
                <p className="text-xs text-slate-500">
                  Annualized: {formatCurrency(annualIncome, currency)}
                </p>
              )}
            </div>

            <Button
              onClick={() => {
                if (annualIncome > 0 && breakdown) {
                  toast.success('Estimate updated');
                }
              }}
              disabled={!breakdown}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12"
            >
              <Calculator className="mr-2" size={16} />
              Calculate
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-6">
          {!breakdown ? (
            <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
              <CardContent className="p-12 text-center text-slate-500">
                <Calculator size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Enter an income to see your tax breakdown</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
                  <CardContent className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                      Estimated Total Tax
                    </p>
                    <p className="text-3xl font-black text-white tabular-nums">
                      {formatCurrency(breakdown.totalTax, currency)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      on {formatCurrency(breakdown.income, currency)} income
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
                  <CardContent className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                      Effective Tax Rate
                    </p>
                    <p className="text-3xl font-black text-indigo-400 tabular-nums">
                      {formatPercent(breakdown.effectiveRate)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">of total income</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
                <CardHeader className="p-6 border-b border-slate-800">
                  <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                      <FileText size={18} />
                    </div>
                    Tax Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  {[
                    { label: 'Federal Tax', value: breakdown.federalTax, color: 'text-indigo-400' },
                    { label: 'State / Provincial Tax', value: breakdown.stateTax, color: 'text-emerald-400' },
                    { label: 'Local / Municipal Tax', value: breakdown.localTax, color: 'text-amber-400' },
                    { label: 'Total Tax', value: breakdown.totalTax, color: 'text-white' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-lg bg-slate-800/40 border border-slate-700/50 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-400">{row.label}</span>
                      <span className={`text-sm font-black tabular-nums ${row.color}`}>
                        {formatCurrency(row.value, currency)}
                      </span>
                    </div>
                  ))}
                  {breakdown.income - breakdown.totalTax >= 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-indigo-500/5 border border-indigo-500/20 px-4 py-3">
                      <span className="text-sm font-medium text-slate-300">Net Take-Home</span>
                      <span className="text-sm font-black text-indigo-300 tabular-nums">
                        {formatCurrency(breakdown.income - breakdown.totalTax, currency)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {delta !== null && (
                <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
                  <CardHeader className="p-6 border-b border-slate-800">
                    <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <TrendingUp size={18} />
                      </div>
                      Comparison with Previous Estimate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-3">
                    {loadingHistory ? (
                      <p className="text-sm text-slate-500">Loading previous estimate...</p>
                    ) : previousYear ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">Previous Effective Rate</span>
                          <span className="font-bold text-white tabular-nums">
                            {formatPercent(previousYear.effectiveRate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">Current Effective Rate</span>
                          <span className="font-bold text-white tabular-nums">
                            {formatPercent(breakdown.effectiveRate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <Badge
                            className={`${
                              delta >= 0
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {delta >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                            {delta >= 0 ? '+' : ''}
                            {formatPercent(Math.abs(delta))} vs previous
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No previous estimate available for comparison.</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <Card className="border-amber-500/30 bg-amber-500/5 shadow-2xl rounded-2xl overflow-hidden">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <Info size={14} /> Disclaimer
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              This tool provides a <strong>simplified estimate</strong> using illustrative tax brackets and does not
              account for deductions, credits, exemptions, or local surcharges. It is for educational purposes only and
              does <strong>not</strong> constitute professional tax advice. Consult a qualified tax professional before
              making financial decisions.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadCSV}
          disabled={!breakdown}
          className="h-10 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
        >
          <Download className="mr-2" size={14} />
          Download CSV
        </Button>
        <Button
          size="sm"
          onClick={handleDownloadPDF}
          disabled={!breakdown}
          className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
        >
          <Download className="mr-2" size={14} />
          Download Summary
        </Button>
      </div>
    </div>
  );
}
