"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HEALTHCARE_SERVICE_TYPES, OPWDD_SERVICE_TYPES, ARTICLE16_SERVICE_TYPES, TYPE_LABELS } from "@/lib/constants";

import type { DataSource } from "@/types/providers";

const FILTER_GROUPS = [
  { heading: "Healthcare Services", types: HEALTHCARE_SERVICE_TYPES, showControls: true },
  { heading: "OPWDD Agencies", types: OPWDD_SERVICE_TYPES },
  { heading: "Article 16 Clinics", types: ARTICLE16_SERVICE_TYPES },
] as const;

const SOURCE_LABELS: Record<DataSource | "all", string> = {
  all: "All Sources",
  medicaid: "Medicaid",
  medicare: "Medicare",
  opwdd: "OPWDD Agencies",
  article16: "Article 16 Clinics",
};

interface MapFilterProps {
  selectedSource: DataSource | "all";
  onSourceChange: (source: DataSource | "all") => void;
  selectedTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  onSelectAllTypes: () => void;
  onClearTypes: () => void;
}

export function MapFilter({
  selectedSource,
  onSourceChange,
  selectedTypes,
  onTypeToggle,
  onSelectAllTypes,
  onClearTypes,
}: MapFilterProps) {
  return (
    <Card className="w-64 shrink-0 overflow-y-auto max-h-full">
      <CardContent className="space-y-4">
        {/* Data Source Filter */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Data Source
          </label>
          <div className="flex flex-col gap-1">
            {(["all", "medicaid", "medicare", "opwdd", "article16"] as const).map((source) => (
              <button
                key={source}
                onClick={() => onSourceChange(source)}
                className={`px-3 py-1.5 text-xs rounded-md text-left transition-colors ${selectedSource === source
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
              >
                {SOURCE_LABELS[source]}
              </button>
            ))}
          </div>
        </div>

        {/* Service Type Filters */}
        {FILTER_GROUPS.map((group) => (
          <div key={group.heading}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">
                {group.heading}
              </label>
              {"showControls" in group && group.showControls && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onSelectAllTypes}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearTypes}>
                    None
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {group.types.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(type)}
                    onChange={() => onTypeToggle(type)}
                    className="rounded border-input"
                  />
                  <span className="text-xs">{TYPE_LABELS[type] ?? type}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Legend
          </label>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              <span className="text-xs">Service Location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400" />
              <span className="text-xs">Location Cluster</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
