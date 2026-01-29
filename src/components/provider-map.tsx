"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Map, { Source, Layer, Popup } from "react-map-gl/mapbox";
import { useTheme } from "next-themes";

import type { MapRef, MapMouseEvent, LayerProps } from "react-map-gl/mapbox";

import type { LocationFeatureCollection, LocationFeatureProperties, DataSource } from "@/types/providers";

import { MapFilter } from "./map-filter";
import { PROVIDER_TYPES, SOURCE_CONFIG } from "@/lib/constants";

interface ProviderMapProps {
  initialData: LocationFeatureCollection;
}

// Manhattan + Bronx center coordinates
const MAP_CENTER = {
  latitude: 40.8,
  longitude: -73.92,
  zoom: 11,
};

// Cluster layer style
const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#51bbd6",
      100,
      "#f1f075",
      750,
      "#f28cb1",
    ] as unknown as string,
    "circle-radius": [
      "step",
      ["get", "point_count"],
      20,
      100,
      30,
      750,
      40,
    ] as unknown as number,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
};

// Cluster count text layer
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
    "text-halo-color": "#fff",
    "text-halo-width": 1,
  },
};

// Unclustered point layer - color based on sources
const unclusteredPointLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": "#8b5cf6", // Purple for locations (neutral)
    "circle-radius": 8,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
};

export function ProviderMap({ initialData }: ProviderMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { resolvedTheme } = useTheme();
  const [selectedSource, setSelectedSource] = useState<DataSource | "all">("all");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(PROVIDER_TYPES));
  const [popupInfo, setPopupInfo] = useState<{
    longitude: number;
    latitude: number;
    location: LocationFeatureProperties;
  } | null>(null);
  const [viewState, setViewState] = useState(MAP_CENTER);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapStyle = resolvedTheme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

  // Filter the GeoJSON data based on selected filters
  const filteredData = useMemo<LocationFeatureCollection>(() => ({
    type: "FeatureCollection",
    features: initialData.features.filter((feature) => {
      // Filter by source
      if (selectedSource !== "all") {
        if (!feature.properties.sources.includes(selectedSource)) {
          return false;
        }
      }
      // Filter by service type - location must have at least one matching service
      const hasMatchingService = feature.properties.services.some((service) => {
        const serviceType = service.type.toUpperCase();
        return Array.from(selectedTypes).some((type) => serviceType.includes(type));
      });
      return hasMatchingService;
    }),
  }), [initialData.features, selectedSource, selectedTypes]);

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      // Check cluster click
      const clusterFeatures = map.queryRenderedFeatures(event.point, { layers: ["clusters"] });
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties?.cluster_id;
        const source = map.getSource("locations");
        if (source && "getClusterExpansionZoom" in source) {
          (source as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            const geometry = clusterFeatures[0].geometry;
            if (geometry.type === "Point") {
              map.easeTo({ center: geometry.coordinates as [number, number], zoom });
            }
          });
        }
        return;
      }

      // Check point click
      const pointFeatures = map.queryRenderedFeatures(event.point, { layers: ["unclustered-point"] });
      if (pointFeatures.length > 0) {
        const geometry = pointFeatures[0].geometry;
        if (geometry.type === "Point") {
          const [lng, lat] = geometry.coordinates;
          const location = filteredData.features.find((f) => {
            const [fLng, fLat] = f.geometry.coordinates;
            return Math.abs(fLng - lng) < 0.00001 && Math.abs(fLat - lat) < 0.00001;
          });
          if (location) {
            setPopupInfo({ longitude: lng, latitude: lat, location: location.properties });
          }
        }
        return;
      }

      setPopupInfo(null);
    },
    [filteredData]
  );

  // Change cursor on hover
  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "pointer";
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
  }, []);

  // Filter handlers
  const handleTypeToggle = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllTypes = useCallback(() => {
    setSelectedTypes(new Set(PROVIDER_TYPES));
  }, []);

  const handleClearTypes = useCallback(() => {
    setSelectedTypes(new Set());
  }, []);

  if (!mapboxToken) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border">
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
    <div className="flex gap-4 h-full">
      <MapFilter
        selectedSource={selectedSource}
        onSourceChange={setSelectedSource}
        selectedTypes={selectedTypes}
        onTypeToggle={handleTypeToggle}
        onSelectAllTypes={handleSelectAllTypes}
        onClearTypes={handleClearTypes}
      />

      <div className="flex-1 rounded-lg overflow-hidden border">
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
          <Source
            id="locations"
            type="geojson"
            data={filteredData}
            cluster={true}
            clusterRadius={50}
            clusterMaxZoom={14}
            key={`${selectedSource}-${Array.from(selectedTypes).sort().join(",")}`}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
          </Source>

          {popupInfo && (
            <Popup
              longitude={popupInfo.longitude}
              latitude={popupInfo.latitude}
              anchor="top"
              onClose={() => setPopupInfo(null)}
              closeButton
              closeOnClick={false}
              maxWidth="320px"
            >
              <div className="min-w-[250px] max-w-[300px] p-2">
                {/* Address */}
                <h3 className="font-semibold text-foreground text-sm mb-2 leading-tight">
                  {popupInfo.location.address}
                </h3>

                {/* Coverage badges */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {popupInfo.location.sources.map((source) => {
                    const config = SOURCE_CONFIG[source];
                    return config ? (
                      <span key={source} className={`px-2 py-0.5 rounded text-xs ${config.className}`}>
                        {config.label}
                      </span>
                    ) : null;
                  })}
                </div>

                {/* Services */}
                <div className="border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Services available:
                  </p>
                  <ul className="space-y-0.5">
                    {popupInfo.location.services.map((service) => (
                      <li key={service.type} className="text-sm text-foreground flex justify-between">
                        <span>{service.type}</span>
                        <span className="text-muted-foreground">({service.count})</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Provider names */}
                {popupInfo.location.providers.length > 0 && (
                  <div className="border-t border-border mt-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Providers ({popupInfo.location.totalProviders}):
                    </p>
                    <ul className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {popupInfo.location.providers.slice(0, 10).map((provider, i) => (
                        <li key={`${provider.name}-${i}`} className="text-sm text-foreground">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium leading-tight">
                              {provider.website ? (
                                <a
                                  href={provider.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {provider.name}
                                </a>
                              ) : (
                                provider.name
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{provider.type}</p>
                          {provider.phone && (
                            <p className="text-xs text-muted-foreground">{provider.phone}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {popupInfo.location.providers.length > 10 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        and {popupInfo.location.providers.length - 10} more...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </div>
  );
}
