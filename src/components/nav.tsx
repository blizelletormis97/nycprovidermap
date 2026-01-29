"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Nav() {
  return (
    <header className="border-b">
      <div className="mx-auto px-4 py-2 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          Service Provider Finder
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
