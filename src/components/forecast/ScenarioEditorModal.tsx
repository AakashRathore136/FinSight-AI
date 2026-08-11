import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Sliders, X } from "lucide-react";

export interface ScenarioPreset {
  id: string;
  name: string;
  revenueGrowthModifier: number; // percentage (-50 to +50)
  expenseInflationModifier: number; // percentage (-50 to +50)
  defaultProbabilityModifier: number;
}

interface ScenarioEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (scenario: ScenarioPreset) => void;
}

export const ScenarioEditorModal: React.FC<ScenarioEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("Custom Scenario");
  const [revenueModifier, setRevenueModifier] = useState(-15);
  const [expenseModifier, setExpenseModifier] = useState(10);
  const [defaultModifier, setDefaultModifier] = useState(5);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      id: `scen-${Date.now()}`,
      name,
      revenueGrowthModifier: revenueModifier,
      expenseInflationModifier: expenseModifier,
      defaultProbabilityModifier: defaultModifier,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Sliders size={20} />
            <h3 className="text-lg font-bold text-white">Create Custom Scenario</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400">Scenario Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span>Revenue Change Modifier</span>
              <span className={revenueModifier >= 0 ? "text-emerald-400" : "text-red-400"}>
                {revenueModifier >= 0 ? `+${revenueModifier}%` : `${revenueModifier}%`}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              value={revenueModifier}
              onChange={(e) => setRevenueModifier(Number(e.target.value))}
              className="w-full mt-2 accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span>Expense Inflation Modifier</span>
              <span className={expenseModifier <= 0 ? "text-emerald-400" : "text-red-400"}>
                {expenseModifier >= 0 ? `+${expenseModifier}%` : `${expenseModifier}%`}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              value={expenseModifier}
              onChange={(e) => setExpenseModifier(Number(e.target.value))}
              className="w-full mt-2 accent-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <Button onClick={onClose} variant="outline" className="w-full border-slate-700 text-slate-300">
            Cancel
          </Button>
          <Button onClick={handleSave} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
            Apply Scenario
          </Button>
        </div>
      </div>
    </div>
  );
};
