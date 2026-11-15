"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, MapPin, Search, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REGIONS, SERVICE_GROUPS, SOURCE_CONFIG, SOURCE_ORDER } from "@/lib/constants";

import type { DataSource, Region, SearchResult } from "@/types/providers";

interface MapFilterProps {
  query: string;
  onQueryChange: (query: string) => void;
  searchResults: SearchResult[];
  searching: boolean;
  onResultSelect: (result: SearchResult) => void;
  selectedSource: DataSource | "all";
  onSourceChange: (source: DataSource | "all") => void;
  sourceCounts: Record<DataSource, number>;
  selectedRegions: Set<Region>;
  regionCounts: Record<Region, number>;
  onRegionToggle: (region: Region) => void;
  onAllRegions: () => void;
  selectedTypes: Set<string>;
  typeCounts: Map<string, number>;
  groupCounts: Map<string, number>;
  onTypeToggle: (type: string) => void;
  onGroupToggle: (types: string[], selected: boolean) => void;
  onSelectAllTypes: () => void;
  onClearTypes: () => void;
  visibleLocations: number;
  visibleProviders: number;
}

const nf = new Intl.NumberFormat("en-US");

export function MapFilter({
  query,
  onQueryChange,
  searchResults,
  searching,
  onResultSelect,
  selectedSource,
  onSourceChange,
  sourceCounts,
  selectedRegions,
  regionCounts,
  onRegionToggle,
  onAllRegions,
  selectedTypes,
  typeCounts,
  groupCounts,
  onTypeToggle,
  onGroupToggle,
  onSelectAllTypes,
  onClearTypes,
  visibleLocations,
  visibleProviders,
}: MapFilterProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(SERVICE_GROUPS.map((g) => g.id)));
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroupOpen = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="w-full md:w-80 shrink-0 md:max-h-full flex flex-col overflow-hidden py-4 gap-0">
      <CardContent className="px-4 space-y-3">
        <SearchBox
          query={query}
          onQueryChange={onQueryChange}
          results={searchResults}
          searching={searching}
          onResultSelect={onResultSelect}
        />

        <p className="text-[11px] leading-snug rounded-md bg-secondary/60 px-2 py-1.5 text-muted-foreground">
          Intellectual &amp; developmental disability (IDD) providers that accept <strong className="text-foreground">Medicaid</strong> in
          Manhattan, Brooklyn, the Bronx, Staten Island and Long Island (Nassau &amp; Suffolk).
        </p>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground">{nf.format(visibleLocations)}</span> locations ·{" "}
            <span className="font-semibold text-foreground">{nf.format(visibleProviders)}</span> providers
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
          >
            Filters
            <ChevronDown className={`size-3 transition-transform ${mobileOpen ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </CardContent>

      <CardContent
        className={`px-4 pt-3 space-y-4 overflow-y-auto min-h-0 flex-1 ${mobileOpen ? "block max-h-[45vh]" : "hidden"} md:block md:max-h-none`}
      >
        {/* Area */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-medium text-muted-foreground">Area</h2>
            {selectedRegions.size < REGIONS.length && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onAllRegions}>
                All areas
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {REGIONS.map((region) => {
              const active = selectedRegions.has(region);
              return (
                <button
                  key={region}
                  type="button"
                  onClick={() => onRegionToggle(region)}
                  aria-pressed={active}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-secondary"
                    }`}
                >
                  {region}
                  {(region === "Nassau" || region === "Suffolk") && <span className="opacity-70"> (LI)</span>}
                  <span className="ml-1 tabular-nums opacity-70">{nf.format(regionCounts[region])}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Data source */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground mb-2">Data source</h2>
          <div className="flex flex-col gap-1">
            <SourceButton
              active={selectedSource === "all"}
              onClick={() => onSourceChange("all")}
              label="All sources"
            />
            {SOURCE_ORDER.map((source) => (
              <SourceButton
                key={source}
                active={selectedSource === source}
                onClick={() => onSourceChange(source)}
                label={SOURCE_CONFIG[source].longLabel}
                color={SOURCE_CONFIG[source].color}
                count={sourceCounts[source]}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Every source lists Medicaid-enrolled or Medicaid-funded IDD services. Marker color shows the source at each address.
          </p>
        </section>

        {/* Service filters */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-medium text-muted-foreground">Services</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onSelectAllTypes}>
                All
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearTypes}>
                None
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border border rounded-md">
            {SERVICE_GROUPS.map((group) => {
              const keys = group.types.map((type) => type.key);
              const selectedCount = keys.filter((k) => selectedTypes.has(k)).length;
              const available = groupCounts.get(group.id) ?? 0;
              const isOpen = openGroups.has(group.id);

              return (
                <div key={group.id} className={available === 0 ? "opacity-60" : undefined}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <GroupCheckbox
                      checked={selectedCount === keys.length}
                      indeterminate={selectedCount > 0 && selectedCount < keys.length}
                      onChange={(checked) => onGroupToggle(keys, checked)}
                      label={`Toggle all ${group.heading}`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleGroupOpen(group.id)}
                      className="flex-1 flex items-center justify-between text-left text-xs font-medium"
                      aria-expanded={isOpen}
                    >
                      <span>{group.heading}</span>
                      <span className="flex items-center gap-1 text-muted-foreground font-normal">
                        {nf.format(available)}
                        <ChevronDown className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="flex flex-col pb-1.5">
                      {group.types.map((type) => {
                        const count = typeCounts.get(type.key) ?? 0;
                        return (
                          <label
                            key={type.key}
                            className="flex items-center gap-2 pl-7 pr-2 py-1 hover:bg-secondary/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTypes.has(type.key)}
                              onChange={() => onTypeToggle(type.key)}
                              className="rounded border-input accent-primary"
                            />
                            <span className={`text-xs flex-1 ${count === 0 ? "text-muted-foreground" : ""}`}>
                              {type.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{nf.format(count)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Counts are locations offering each service for the selected source.
          </p>
        </section>

        {/* Legend */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground mb-2">Clusters</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#51bbd6]" />&lt;100</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#f1f075]" />100+</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#f28cb1]" />750+</span>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function SourceButton({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1.5 text-xs rounded-md text-left transition-colors flex items-center gap-2 ${active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        }`}
    >
      {color && <span className="size-2.5 rounded-full shrink-0 ring-1 ring-white/70" style={{ backgroundColor: color }} />}
      <span className="flex-1">{label}</span>
      {count != null && <span className="tabular-nums opacity-70">{nf.format(count)}</span>}
    </button>
  );
}

function GroupCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="rounded border-input accent-primary"
    />
  );
}

function SearchBox({
  query,
  onQueryChange,
  results,
  searching,
  onResultSelect,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[];
  searching: boolean;
  onResultSelect: (result: SearchResult) => void;
}) {
  const showResults = query.trim().length >= 2;

  return (
    <div>
      <div className="relative">
        <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search provider, street or ZIP"
          aria-label="Search providers by name, street or ZIP code"
          className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <Loader2 className="size-4 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {showResults && (
        <div className="mt-2 border rounded-md max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">
              {searching ? "Searching…" : "No provider names match. The map still shows matching streets and ZIP codes."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((r, i) => (
                <li key={`${r.locationId}-${r.name}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onResultSelect(r)}
                    className="w-full text-left px-2 py-1.5 hover:bg-secondary/60 flex gap-2"
                  >
                    <span
                      className="size-2.5 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: SOURCE_CONFIG[r.source].color }}
                      title={SOURCE_CONFIG[r.source].label}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium truncate">{r.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{r.address}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
