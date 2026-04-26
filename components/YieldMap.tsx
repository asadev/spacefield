"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AreaYield } from "@/lib/yield-heatmap-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeoJSONFeature {
  type: "Feature";
  properties: { area_id: string; name: string; type: "yield" | "background" };
  geometry: GeoJSON.Geometry;
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yieldColor(y: number): string {
  if (y >= 7) return "#93c5fd";
  if (y >= 5) return "#94a3b8";
  return "#64748b";
}

const ABBREVS: Record<string, string> = {
  "Jumeirah Village Circle": "JVC",
  "Jumeirah Lake Towers": "JLT",
  "Jumeirah Beach Residence": "JBR",
  "Business Bay": "BB",
  "Dubai Marina": "DM",
  "Downtown Dubai": "DT",
  "Dubai Hills Estate": "DHE",
  "Palm Jumeirah": "Palm",
  "Dubai Sports City": "DSC",
  "Dubai Silicon Oasis": "DSO",
  "International City": "IC",
  "Dubai Production City (IMPZ)": "DPC",
  "Motor City": "MC",
  "Discovery Gardens": "DG",
  "Al Furjan": "AFJ",
  "Jumeirah Village Triangle": "JVT",
};

function areaAbbrev(name: string): string {
  return ABBREVS[name] || name.slice(0, 3).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface YieldMapProps {
  filteredAreas: AreaYield[];
  allAreas: AreaYield[];
  onHover: (id: string | null) => void;
  onSelect: (area: AreaYield) => void;
}

export default function YieldMap({
  filteredAreas,
  allAreas,
  onHover,
  onSelect,
}: YieldMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [geoData, setGeoData] = useState<GeoJSONCollection | null>(null);

  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  // Keep the latest handlers without triggering a map re-init.
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    fetch("/dubai-areas.geojson")
      .then((r) => r.json())
      .then((data: GeoJSONCollection) => setGeoData(data))
      .catch((err) => console.error("Failed to load GeoJSON:", err));
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [25.1, 55.24],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lg = layerGroupRef.current;
    if (!lg || !geoData) return;

    lg.clearLayers();

    const filteredIds = new Set(filteredAreas.map((a) => a.id));
    const areaLookup = new Map<string, AreaYield>();
    for (const a of allAreas) areaLookup.set(a.id, a);

    // 1) Render ALL background polygons first (full Dubai coverage)
    for (const feature of geoData.features) {
      if (feature.properties.type === "background") {
        L.geoJSON(feature as unknown as GeoJSON.GeoJsonObject, {
          style: {
            fillColor: "#1e293b",
            fillOpacity: 0.35,
            color: "#475569",
            weight: 1,
            opacity: 0.6,
          },
          interactive: false,
        }).addTo(lg);
      }
    }

    // 2) Render yield community polygons on top
    for (const feature of geoData.features) {
      if (feature.properties.type !== "yield") continue;

      const areaId = feature.properties.area_id;
      const area = areaLookup.get(areaId);
      if (!area) continue;

      const inRange = filteredIds.has(areaId);
      const color = yieldColor(area.avgYield);

      const layer = L.geoJSON(feature as unknown as GeoJSON.GeoJsonObject, {
        style: {
          fillColor: color,
          fillOpacity: inRange ? 0.45 : 0.12,
          color: inRange ? "#e2e8f0" : "#64748b",
          weight: inRange ? 1.5 : 0.8,
          opacity: inRange ? 0.7 : 0.3,
        },
      });

      layer.bindTooltip(
        `<strong>${area.name}</strong><br/>${area.avgYield}% yield`,
        { direction: "top", sticky: true, className: "yield-map-tooltip" }
      );

      layer.on("mouseover", () => {
        layer.setStyle({ fillOpacity: inRange ? 0.6 : 0.2, weight: 1.5 });
        onHoverRef.current(areaId);
      });
      layer.on("mouseout", () => {
        layer.setStyle({
          fillOpacity: inRange ? 0.4 : 0.08,
          weight: inRange ? 1 : 0.5,
        });
        onHoverRef.current(null);
      });
      layer.on("click", () => onSelectRef.current(area));

      layer.addTo(lg);
    }

    // 3) Labels on top of everything — one per yield area (deduplicated)
    const labeledAreas = new Set<string>();
    for (const area of allAreas) {
      if (labeledAreas.has(area.id)) continue;
      labeledAreas.add(area.id);

      const inRange = filteredIds.has(area.id);
      const abbrev = areaAbbrev(area.name);

      L.marker([area.coordinates.lat, area.coordinates.lng], {
        icon: L.divIcon({
          className: "yield-map-label",
          html: `<span style="
            color: ${inRange ? "rgba(226,232,240,0.9)" : "rgba(148,163,184,0.3)"};
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            pointer-events: none;
            text-shadow: 0 0 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8);
          ">${abbrev}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-2, 6],
        }),
        interactive: false,
      }).addTo(lg);
    }
  }, [filteredAreas, allAreas, geoData]);

  return (
    <>
      <style jsx global>{`
        .yield-map-tooltip {
          background: rgba(10, 10, 10, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          color: #f5f5f5 !important;
          font-family: inherit !important;
          font-size: 12px !important;
          padding: 6px 10px !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
        }
        .yield-map-tooltip .leaflet-tooltip-tip {
          display: none !important;
        }
        .yield-map-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .leaflet-container {
          background: #0a0a0a !important;
          z-index: 0 !important;
        }
        .leaflet-pane,
        .leaflet-top,
        .leaflet-bottom {
          z-index: 0 !important;
        }
      `}</style>
      <div
        ref={mapRef}
        className="w-full rounded-lg"
        style={{ height: "clamp(350px, 50vw, 550px)" }}
      />
    </>
  );
}
