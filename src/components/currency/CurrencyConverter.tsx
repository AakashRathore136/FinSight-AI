import { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { MAJOR_CURRENCIES, convertAmount, formatCurrencyDisplay, fetchExchangeRates, type ExchangeRates } from '@/src/lib/currencyUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';

interface CurrencyConverterProps {
  defaultFrom?: string;
  defaultTo?: string;
  defaultAmount?: number;
  onConvert?: (amount: number, from: string, to: string, result: number) => void;
}

export function CurrencyConverter({
  defaultFrom = 'USD',
  defaultTo = 'EUR',
  defaultAmount = 100,
  onConvert,
}: CurrencyConverterProps) {
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [fromCurrency, setFromCurrency] = useState(defaultFrom);
  const [toCurrency, setToCurrency] = useState(defaultTo);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRates = async () => {
      setLoading(true);
      try {
        const data = await fetchExchangeRates('USD');
        setRates(data);
      } catch (err) {
        console.error("CurrencyConverter: failed to load exchange rates", err);
        setRates({
          base: 'USD',
          date: new Date().toISOString().split('T')[0],
          rates: {},
        });
      } finally {
        setLoading(false);
      }
    };
    loadRates();
  }, []);

  const numericAmount = parseFloat(amount) || 0;
  const converted = rates
    ? convertAmount(numericAmount, fromCurrency, toCurrency, rates.rates)
    : 0;

  useEffect(() => {
    if (onConvert && rates) {
      onConvert(numericAmount, fromCurrency, toCurrency, converted);
    }
  }, [numericAmount, fromCurrency, toCurrency, converted, onConvert, rates]);

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-2xl overflow-hidden">
      <CardHeader className="p-6 border-b border-slate-800 bg-slate-900/50">
        <CardTitle className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <ArrowRightLeft size={18} />
          </div>
          Currency Converter
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Amount</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-12 text-lg font-semibold tabular-nums"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={swapCurrencies}
            className="h-12 w-12 border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 shrink-0"
          >
            <ArrowRightLeft size={18} />
          </Button>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">To</label>
            <div className="h-12 flex items-center">
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12 text-lg font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                  {MAJOR_CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span>{currency.flag}</span>
                        <span>{currency.code}</span>
                        <span className="text-slate-500 text-xs">({currency.name})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
                Converted Amount
              </p>
              <p className="text-3xl font-black text-white tabular-nums">
                {loading ? '---' : formatCurrencyDisplay(converted, toCurrency)}
              </p>
            </div>
            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-bold text-xs">
              {rates
                ? (() => {
                    const fromRate = rates.rates[fromCurrency] ?? 1;
                    const toRate = rates.rates[toCurrency] ?? 1;
                    const crossRate = (toRate / fromRate).toFixed(4);
                    return `1 ${fromCurrency} = ${crossRate} ${toCurrency}`;
                  })()
                : 'Loading rates...'}
            </Badge>
          </div>
          {rates && (
            <p className="text-[10px] text-slate-500 mt-3 font-medium">
              Rates updated: {rates.date} via Frankfurter API
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
