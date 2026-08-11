import React from "react";

export interface BoundingBox {
  id: string;
  page: number;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width: number; // percentage
  height: number; // percentage
  label: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

interface BoundingBoxOverlayProps {
  boxes: BoundingBox[];
  activeBoxId?: string;
  onSelectBox?: (id: string) => void;
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
  boxes,
  activeBoxId,
  onSelectBox,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {boxes.map((box) => {
        const isActive = box.id === activeBoxId;
        const colorClass =
          box.severity === "CRITICAL"
            ? "border-red-500 bg-red-500/20 text-red-300"
            : box.severity === "WARNING"
            ? "border-amber-500 bg-amber-500/20 text-amber-300"
            : "border-indigo-500 bg-indigo-500/20 text-indigo-300";

        return (
          <div
            key={box.id}
            onClick={() => onSelectBox && onSelectBox(box.id)}
            style={{
              top: `${box.y}%`,
              left: `${box.x}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
            className={`absolute border-2 rounded pointer-events-auto cursor-pointer transition-all duration-200 ${colorClass} ${
              isActive ? "ring-4 ring-white scale-[1.02] z-20" : "opacity-80 hover:opacity-100 z-10"
            }`}
          >
            <span className="absolute -top-5 left-0 text-[9px] font-black uppercase px-1.5 py-0.5 bg-slate-950 text-white rounded border border-slate-700 shadow">
              {box.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
