import { NextResponse } from "next/server";
import { searchProviders } from "@/lib/api";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: searchProviders(q.slice(0, 100)) });
}
