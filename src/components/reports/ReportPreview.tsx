/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/src/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Badge } from '@/src/components/ui/badge';
import { formatCurrency, formatDate } from '@/src/lib/reportUtils';
import type { ExpenseSummaryItem, IncomeSummaryItem, ReportData } from '@/src/lib/reportUtils';

interface ReportPreviewProps {
  reportData: ReportData;
}

export function ReportPreview({ reportData }: ReportPreviewProps) {
  const { dateRange, expenseSummary, incomeSummary, totalIncome, totalExpenses, transactions } = reportData;

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-lg">Report Preview</CardTitle>
              <CardDescription className="text-slate-500 mt-1">
                {format(dateRange.start, 'dd MMM yyyy')} - {format(dateRange.end, 'dd MMM yyyy')}
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total Income</p>
                <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(totalIncome)}</p>
              </div>
              <div className="w-px bg-slate-800" />
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total Expenses</p>
                <p className="text-lg font-bold text-red-400 tabular-nums">{formatCurrency(totalExpenses)}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Expenses by Category</h3>
              {expenseSummary.length === 0 ? (
                <p className="text-sm text-slate-600 py-4">No expenses found for the selected period.</p>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-800/30 hover:bg-slate-800/30">
                        <TableHead className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Category</TableHead>
                        <TableHead className="text-right text-slate-400 text-[10px] font-black uppercase tracking-wider">Count</TableHead>
                        <TableHead className="text-right text-slate-400 text-[10px] font-black uppercase tracking-wider">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseSummary.map((item: ExpenseSummaryItem) => (
                        <TableRow key={item.category} className="border-slate-800/50 hover:bg-slate-800/20">
                          <TableCell className="font-medium text-slate-300 text-sm">{item.category}</TableCell>
                          <TableCell className="text-right text-slate-500 text-xs tabular-nums">{item.count}</TableCell>
                          <TableCell className="text-right text-slate-300 text-sm font-semibold tabular-nums">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Income by Source</h3>
              {incomeSummary.length === 0 ? (
                <p className="text-sm text-slate-600 py-4">No income found for the selected period.</p>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-800/30 hover:bg-slate-800/30">
                        <TableHead className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Source</TableHead>
                        <TableHead className="text-right text-slate-400 text-[10px] font-black uppercase tracking-wider">Count</TableHead>
                        <TableHead className="text-right text-slate-400 text-[10px] font-black uppercase tracking-wider">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeSummary.map((item: IncomeSummaryItem) => (
                        <TableRow key={item.source} className="border-slate-800/50 hover:bg-slate-800/20">
                          <TableCell className="font-medium text-slate-300 text-sm">{item.source}</TableCell>
                          <TableCell className="text-right text-slate-500 text-xs tabular-nums">{item.count}</TableCell>
                          <TableCell className="text-right text-slate-300 text-sm font-semibold tabular-nums">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-slate-800 border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  {transactions.length} Transactions
                </Badge>
              </div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">
                Generated on {format(new Date(), 'dd MMM yyyy, HH:mm')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
