import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { FileText, Eye, AlertCircle, ZoomIn, ZoomOut } from "lucide-react";
import { BoundingBoxOverlay, BoundingBox } from "./BoundingBoxOverlay";

export const PdfAnomalyViewer: React.FC = () => {
  const [activeBoxId, setActiveBoxId] = useState<string>("box-1");
  const [zoom, setZoom] = useState<number>(100);

  const mockBoxes: BoundingBox[] = [
    { id: "box-1", page: 1, x: 15, y: 35, width: 70, height: 12, label: "Irregular Spike +340%", severity: "CRITICAL" },
    { id: "box-2", page: 1, x: 20, y: 65, width: 60, height: 10, label: "Unclassified Off-Balance", severity: "WARNING" },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800 text-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Eye size={22} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Document Anomaly Visual Heatmap</CardTitle>
            <p className="text-xs text-slate-400">Coordinate-mapped bounding box overlay on parsed PDF canvas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(80, z - 10))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-bold text-slate-400">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PDF Canvas Mock */}
        <div className="lg:col-span-2 relative min-h-[450px] bg-slate-950 rounded-2xl border border-slate-800 p-8 overflow-hidden flex flex-col items-center justify-center">
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
            className="relative w-full max-w-lg h-[400px] bg-slate-900 border border-slate-700 rounded-lg p-6 shadow-2xl space-y-4 transition-transform duration-200"
          >
            <div className="h-4 w-1/3 bg-slate-700 rounded" />
            <div className="h-3 w-full bg-slate-800 rounded" />
            <div className="h-3 w-5/6 bg-slate-800 rounded" />

            <div className="my-6 p-4 bg-slate-800/80 rounded border border-red-500/40">
              <span className="text-xs font-mono text-red-300 font-bold block mb-1">AUDIT LINE ITEM #402</span>
              <div className="h-4 w-2/3 bg-slate-700 rounded" />
            </div>

            <div className="h-3 w-full bg-slate-800 rounded" />
            <div className="h-3 w-4/5 bg-slate-800 rounded" />

            <BoundingBoxOverlay
              boxes={mockBoxes}
              activeBoxId={activeBoxId}
              onSelectBox={(id) => setActiveBoxId(id)}
            />
          </div>
        </div>

        {/* Anomaly Sidebar */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detected Anomaly Coordinates</h4>
          {mockBoxes.map((b) => (
            <div
              key={b.id}
              onClick={() => setActiveBoxId(b.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                b.id === activeBoxId
                  ? "bg-slate-800 border-indigo-500 shadow-lg"
                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{b.label}</span>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                    b.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {b.severity}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Page {b.page} • Bounds: [{b.x}%, {b.y}%, {b.width}%, {b.height}%]
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
