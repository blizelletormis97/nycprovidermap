import { ProviderMap } from "@/components/provider-map";
import { getProvidersGeoJSON } from "@/lib/api";

export default function Home() {
  // Call directly - no HTTP fetch needed
  const geojsonData = getProvidersGeoJSON({ source: "all" });

  return (
    <main className="h-[calc(100vh-54px)] p-4">
      <ProviderMap initialData={geojsonData} />
    </main>
  );
}
