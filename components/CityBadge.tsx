"use client";

// Small pill that shows the current city selection for the active region.
// Sits next to PageHeader on city-aware tool pages.

import { useEffect, useState } from "react";
import { getCity, subscribeCity } from "@/lib/city";
import type { Region } from "@/lib/region";

export default function CityBadge({ region }: { region: Region }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const c = getCity(region);
    setName(c.name);
    const unsub = subscribeCity((r, city) => {
      if (r === region) setName(city.name);
    });
    return unsub;
  }, [region]);

  if (!name) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-purple-200">
      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
      City: {name}
    </span>
  );
}
