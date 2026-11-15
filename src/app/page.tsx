import { ProviderMap } from "@/components/provider-map";
import { getProvidersGeoJSON } from "@/lib/api";

export default function Home() {
  // Read the cached data directly at build time — provider details are fetched per location on click
  const geojsonData = getProvidersGeoJSON();

  return (
    <main className="h-auto md:h-[calc(100vh-54px)] p-4">
      <ProviderMap initialData={geojsonData} />
    </main>
  );
}
