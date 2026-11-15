"use client";

import { useState, useCallback, useRef, useMemo, useEffect, useDeferredValue } from "react";
import Map, { Source, Layer, Popup, NavigationControl, GeolocateControl } from "react-map-gl/mapbox";
import { useTheme } from "next-themes";
import { ExternalLink, Navigation, Phone } from "lucide-react";

import type { MapRef, MapMouseEvent, LayerProps } from "react-map-gl/mapbox";
import type { GeoJSONSource } from "mapbox-gl";

import type {
  DataSource,
  LocationDetail,
  LocationFeature,
  LocationFeatureCollection,
  Region,
  SearchResult,
} from "@/types/providers";

import { MapFilter } from "./map-filter";
import { ALL_SERVICE_KEYS, REGIONS, SERVICE_GROUPS, SOURCE_CONFIG, SOURCE_ORDER } from "@/lib/constants";

interface ProviderMapProps {
  initialData: LocationFeatureCollection;
}

// Manhattan + Bronx center coordinates
// Initial view covering Staten Island through eastern Suffolk
const MAP_CENTER = {
  latitude: 40.78,
  longitude: -73.35,
  zoom: 8.6,
};

const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_GROUPS.flatMap((g) => g.types.map((t) => [t.key, t.label]))
);

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": ["step", ["get", "point_count"], "#51bbd6", 100, "#f1f075", 750, "#f28cb1"],
    "circle-radius": ["step", ["get", "point_count"], 18, 100, 26, 750, 34],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 12,
  },
  paint: {
    "text-color": "#000",
  },
};

// Unclustered points — colored by the most DD-specific source at the address
const unclusteredPointLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match",
      ["get", "primarySource"],
      ...SOURCE_ORDER.flatMap((s) => [s, SOURCE_CONFIG[s].color]),
      "#6b7280",
    ] as unknown as string,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 15, 9],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#fff",
  },
};

const formatter = new Intl.NumberFormat("en-US");

function matchesSearch(feature: LocationFeature, terms: string[], nameMatches: Set<string>): boolean {
  if (terms.length === 0) return true;
  if (nameMatches.has(feature.properties.id)) return true;
  const address = feature.properties.address.toUpperCase();
  return terms.every((t) => address.includes(t));
}

export function ProviderMap({ initialData }: ProviderMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { resolvedTheme } = useTheme();
  const [selectedSource, setSelectedSource] = useState<DataSource | "all">("all");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set(ALL_SERVICE_KEYS));
  const [selectedRegions, setSelectedRegions] = useState<Set<Region>>(() => new Set(REGIONS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewState, setViewState] = useState(MAP_CENTER);

  // Search state
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapStyle = resolvedTheme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

  const featuresById = useMemo(
    () => new globalThis.Map(initialData.features.map((f) => [f.properties.id, f])),
    [initialData.features]
  );

  // Debounced provider-name search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data: { results: SearchResult[] } = await res.json();
        setSearchResults(data.results);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const searchTerms = useMemo(
    () => deferredQuery.trim().toUpperCase().split(/\s+/).filter((t) => t.length > 0 && deferredQuery.trim().length >= 2),
    [deferredQuery]
  );
  const nameMatchIds = useMemo(() => new Set(searchResults.map((r) => r.locationId)), [searchResults]);

  // Does a location offer this service (for the selected source)?
  const offers = useCallback(
    (feature: LocationFeature, type: string) =>
      selectedSource === "all"
        ? feature.properties.services.some((s) => s.type === type)
        : feature.properties.sourceServices.includes(`${selectedSource}|${type}`),
    [selectedSource]
  );

  // Locations matching source + search (before service filters) — used for the counts in the sidebar
  const sourceAndSearchMatches = useMemo(
    () =>
      initialData.features.filter(
        (f) =>
          selectedRegions.has(f.properties.region) &&
          (selectedSource === "all" || f.properties.sources.includes(selectedSource)) &&
          matchesSearch(f, searchTerms, nameMatchIds)
      ),
    [initialData.features, selectedRegions, selectedSource, searchTerms, nameMatchIds]
  );

  // Location counts per service type and per group (a location counts once per group)
  const { typeCounts, groupCounts } = useMemo(() => {
    const typeCounts = new globalThis.Map<string, number>();
    const groupCounts = new globalThis.Map<string, number>();
    for (const f of sourceAndSearchMatches) {
      for (const group of SERVICE_GROUPS) {
        let inGroup = false;
        for (const { key } of group.types) {
          if (!offers(f, key)) continue;
          typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
          inGroup = true;
        }
        if (inGroup) groupCounts.set(group.id, (groupCounts.get(group.id) ?? 0) + 1);
      }
    }
    return { typeCounts, groupCounts };
  }, [sourceAndSearchMatches, offers]);

  const regionCounts = useMemo(() => {
    const counts = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
    for (const f of initialData.features) counts[f.properties.region]++;
    return counts;
  }, [initialData.features]);

  const handleRegionToggle = useCallback((region: Region) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  }, []);

  const sourceCounts = useMemo(() => {
    const counts = Object.fromEntries(SOURCE_ORDER.map((s) => [s, 0])) as Record<DataSource, number>;
    for (const f of initialData.features) for (const s of f.properties.sources) counts[s]++;
    return counts;
  }, [initialData.features]);

  const filteredData = useMemo<LocationFeatureCollection>(() => {
    const types = Array.from(selectedTypes);
    return {
      type: "FeatureCollection",
      features: sourceAndSearchMatches.filter((f) => types.some((t) => offers(f, t))),
    };
  }, [sourceAndSearchMatches, selectedTypes, offers]);

  const visibleProviders = useMemo(
    () => filteredData.features.reduce(
      (sum, f) =>
        sum + (selectedSource === "all" ? f.properties.totalProviders : f.properties.providerCounts[selectedSource] ?? 0),
      0
    ),
    [filteredData, selectedSource]
  );

  const selectedFeature = selectedId ? featuresById.get(selectedId) ?? null : null;

  const selectLocation = useCallback((id: string, fly: boolean) => {
    setSelectedId(id);
    const feature = featuresById.get(id);
    if (fly && feature) {
      mapRef.current?.flyTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(mapRef.current.getZoom(), 15.5),
        duration: 900,
      });
    }
  }, [featuresById]);

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const clusterFeatures = map.queryRenderedFeatures(event.point, { layers: ["clusters"] });
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties?.cluster_id;
        const source = map.getSource("locations") as GeoJSONSource | undefined;
        source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const geometry = clusterFeatures[0].geometry;
          if (geometry.type === "Point") {
            map.easeTo({ center: geometry.coordinates as [number, number], zoom });
          }
        });
        return;
      }

      const pointFeatures = map.queryRenderedFeatures(event.point, { layers: ["unclustered-point"] });
      const id = pointFeatures[0]?.properties?.id as string | undefined;
      if (id) {
        selectLocation(id, false);
        return;
      }

      setSelectedId(null);
    },
    [selectLocation]
  );

  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "pointer";
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
  }, []);

  const handleTypeToggle = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleGroupToggle = useCallback((types: string[], selected: boolean) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      for (const t of types) {
        if (selected) next.add(t);
        else next.delete(t);
      }
      return next;
    });
  }, []);

  const selectedLayer = useMemo<LayerProps>(() => ({
    id: "selected-point",
    type: "circle",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], selectedId ?? ""]],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-radius": 14,
      "circle-stroke-width": 3,
      "circle-stroke-color": resolvedTheme === "dark" ? "#fff" : "#111827",
    },
  }), [selectedId, resolvedTheme]);

  if (!mapboxToken) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-muted/30 rounded-lg border">
        <div className="text-center p-8">
          <h2 className="text-lg font-semibold mb-2">Mapbox Token Required</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Add <code className="bg-muted px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your{" "}
            <code className="bg-muted px-1 rounded">.env.local</code> file to enable the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      <MapFilter
        query={query}
        onQueryChange={setQuery}
        searchResults={searchResults}
        searching={searching}
        onResultSelect={(r) => selectLocation(r.locationId, true)}
        selectedSource={selectedSource}
        onSourceChange={setSelectedSource}
        sourceCounts={sourceCounts}
        selectedRegions={selectedRegions}
        regionCounts={regionCounts}
        onRegionToggle={handleRegionToggle}
        onAllRegions={() => setSelectedRegions(new Set(REGIONS))}
        selectedTypes={selectedTypes}
        typeCounts={typeCounts}
        groupCounts={groupCounts}
        onTypeToggle={handleTypeToggle}
        onGroupToggle={handleGroupToggle}
        onSelectAllTypes={() => setSelectedTypes(new Set(ALL_SERVICE_KEYS))}
        onClearTypes={() => setSelectedTypes(new Set())}
        visibleLocations={filteredData.features.length}
        visibleProviders={visibleProviders}
      />

      <div className="flex-1 min-h-[60vh] md:min-h-0 rounded-lg overflow-hidden border">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onClick={handleMapClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          interactiveLayerIds={["clusters", "unclustered-point"]}
          style={{ width: "100%", height: "100%" }}
          mapStyle={mapStyle}
          mapboxAccessToken={mapboxToken}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <GeolocateControl position="top-right" />

          <Source
            id="locations"
            type="geojson"
            data={filteredData}
            cluster={true}
            clusterRadius={50}
            clusterMaxZoom={14}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
            <Layer {...selectedLayer} />
          </Source>

          {selectedFeature && (
            <Popup
              key={selectedFeature.properties.id}
              longitude={selectedFeature.geometry.coordinates[0]}
              latitude={selectedFeature.geometry.coordinates[1]}
              anchor="top"
              onClose={() => setSelectedId(null)}
              closeButton
              closeOnClick={false}
              maxWidth="360px"
            >
              <LocationPopup feature={selectedFeature} sourceFilter={selectedSource} />
            </Popup>
          )}
        </Map>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;
const detailCache = new globalThis.Map<string, LocationDetail>();

function LocationPopup({ feature, sourceFilter }: { feature: LocationFeature; sourceFilter: DataSource | "all" }) {
  const { id, address, sources, services, totalProviders } = feature.properties;
  const [detail, setDetail] = useState<LocationDetail | null>(() => detailCache.get(id) ?? null);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    if (detailCache.has(id)) return;
    const controller = new AbortController();
    fetch(`/api/locations/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<LocationDetail>;
      })
      .then((data) => {
        detailCache.set(id, data);
        setDetail(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [id]);

  const providers = useMemo(
    () => (detail?.providers ?? []).filter((p) => sourceFilter === "all" || p.source === sourceFilter),
    [detail, sourceFilter]
  );

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

  return (
    <div className="w-[300px] p-1 text-foreground">
      <h3 className="font-semibold text-sm leading-tight pr-5">{address}</h3>

      <div className="flex flex-wrap items-center gap-1 mt-2">
        {sources.map((source) => (
          <span key={source} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${SOURCE_CONFIG[source].className}`}>
            {SOURCE_CONFIG[source].label}
          </span>
        ))}
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Navigation className="size-3" />
          Directions
        </a>
      </div>

      <div className="border-t border-border mt-2 pt-2">
        <p className="text-[11px] font-medium text-muted-foreground mb-1">Services at this address</p>
        <div className="flex flex-wrap gap-1">
          {services.map((s) => (
            <span key={s.type} className="px-1.5 py-0.5 rounded bg-secondary text-[11px]">
              {SERVICE_LABELS[s.type] ?? s.type} <span className="text-muted-foreground">{s.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border mt-2 pt-2">
        <p className="text-[11px] font-medium text-muted-foreground mb-1">
          Providers ({formatter.format(sourceFilter === "all" || !detail ? totalProviders : providers.length)}
          {sourceFilter !== "all" && detail ? ` ${SOURCE_CONFIG[sourceFilter].label}` : ""})
        </p>

        {error ? (
          <p className="text-xs text-destructive">Could not load provider details.</p>
        ) : !detail ? (
          <div className="space-y-2 py-1" aria-label="Loading providers">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <ul className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {providers.slice(0, limit).map((provider, i) => (
                <li key={`${provider.name}-${i}`} className="text-xs">
                  <div className="flex items-start gap-1.5">
                    <span
                      className="size-2 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: SOURCE_CONFIG[provider.source].color }}
                      title={SOURCE_CONFIG[provider.source].label}
                    />
                    <div className="min-w-0">
                      {provider.website ? (
                        <a
                          href={provider.website.startsWith("http") ? provider.website : `https://${provider.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium leading-tight text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          {provider.name}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="font-medium leading-tight">{provider.name}</span>
                      )}
                      <p className="text-muted-foreground leading-snug">
                        {provider.type.split(", ").map((t) => SERVICE_LABELS[t] ?? t).join(", ")}
                      </p>
                      {provider.detail && <p className="text-muted-foreground leading-snug">{provider.detail}</p>}
                      {provider.phone && (
                        <a
                          href={`tel:${provider.phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Phone className="size-3" />
                          {provider.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {providers.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE * 4)}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Show more ({formatter.format(providers.length - limit)} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
