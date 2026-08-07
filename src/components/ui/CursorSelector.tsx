import React, { useState, useEffect } from "react";
import { MousePointer } from "lucide-react";

type CursorStyle = "default" | "pixel" | "glow" | "trail" | "crosshair";

interface CursorOption {
  id: CursorStyle;
  label: string;
  icon: string;
}

const CURSOR_OPTIONS: CursorOption[] = [
  { id: "default", label: "Default", icon: "Default" },
  { id: "pixel", label: "Pixel", icon: "Pixel" },
  { id: "glow", label: "Glow", icon: "Glow" },
  { id: "trail", label: "Trail", icon: "Trail" },
  { id: "crosshair", label: "Crosshair", icon: "Cross" },
];

export const CursorSelector: React.FC = () => {
  const [selectedCursor, setSelectedCursor] = useState<CursorStyle>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("finsight_cursor_style") as CursorStyle) || "default";
    }
    return "default";
  });

  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    document.body.setAttribute("data-cursor", selectedCursor);
    localStorage.setItem("finsight_cursor_style", selectedCursor);
  }, [selectedCursor]);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label="Select cursor style"
      >
        <MousePointer className="w-4 h-4 text-blue-500" />
        <span className="capitalize">{selectedCursor}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Cursor Styles
          </div>
          {CURSOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setSelectedCursor(option.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${
                selectedCursor === option.id
                  ? "text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/50 dark:bg-gray-700/50"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <span>{option.label}</span>
              <span className="text-xs text-gray-400">{option.icon}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};