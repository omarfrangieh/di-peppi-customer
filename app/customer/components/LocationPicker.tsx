"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import type { MapLocation } from "../types";

export type { MapLocation };

interface LocationPickerProps {
  initial?: MapLocation | null;
  flyTo?: MapLocation | null;   // set this to imperatively move the map
  readOnly?: boolean;
  onChange?: (loc: MapLocation, label: string) => void;
  height?: number;
}

const MARKER_HTML = `
  <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;
              background:#1B2A5E;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
              border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)">
    <div style="width:8px;height:8px;background:white;border-radius:50%;transform:rotate(45deg)"></div>
  </div>`;

/** Load Leaflet exactly once, return a Promise<L> that resolves whenever it's ready */
function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);

  // Already loading — attach to the existing script's load event
  const existing = document.querySelector('script[src*="leaflet@1.9.4"]') as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(w.L), { once: true });
    });
  }

  // Inject CSS once
  if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(w.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function LocationPicker({
  initial,
  flyTo,
  readOnly = false,
  onChange,
  height = 260,
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pendingFlyToRef = useRef<MapLocation | null>(flyTo ?? null);
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState(
    initial
      ? `📍 ${initial.lat.toFixed(5)}, ${initial.lng.toFixed(5)}`
      : readOnly
      ? "No pin saved yet"
      : "Tap anywhere on the map to drop your pin"
  );

  // Helper: place/move marker and fly map to a location
  const applyLocation = (L: any, map: any, loc: MapLocation) => {
    const icon = L.divIcon({ className: "", html: MARKER_HTML, iconSize: [32, 32], iconAnchor: [16, 32] });
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
    map.setView([loc.lat, loc.lng], 17);
    setHint(`📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
  };

  // React to flyTo prop changes after map is initialized
  useEffect(() => {
    if (!flyTo) return;
    pendingFlyToRef.current = flyTo;
    const map = mapInstanceRef.current;
    const L = (window as any).L;
    if (map && L) applyLocation(L, map, flyTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      if ((mapRef.current as any)._leaflet_id) return;

      // Use flyTo as starting point if available, else initial, else default
      const startLoc = pendingFlyToRef.current || initial;
      const center: [number, number] = startLoc ? [startLoc.lat, startLoc.lng] : [33.8938, 35.5018];
      const map = L.map(mapRef.current, {
        zoomControl: true,
        dragging: !readOnly,
        touchZoom: !readOnly,
        doubleClickZoom: !readOnly,
        scrollWheelZoom: !readOnly,
        boxZoom: !readOnly,
        keyboard: !readOnly,
      }).setView(center, 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: MARKER_HTML,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      // Drop marker at startLoc if available
      if (startLoc) {
        markerRef.current = L.marker([startLoc.lat, startLoc.lng], { icon }).addTo(map);
        if (pendingFlyToRef.current) map.setView([startLoc.lat, startLoc.lng], 17);
      }

      if (!readOnly) {
        map.on("click", async (e: any) => {
          if (cancelled) return;
          const { lat, lng } = e.latlng;
          if (markerRef.current) markerRef.current.remove();
          markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
          setHint("Fetching address…");
          let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
              { headers: { "Accept-Language": "en" } }
            );
            const data = await res.json();
            if (data.display_name) label = data.display_name;
          } catch {}
          if (!cancelled) {
            setHint(`📍 ${label}`);
            onChange?.({ lat, lng }, label);
          }
        });
      }

      mapInstanceRef.current = map;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMyLocation = () => {
    if (!navigator.geolocation || readOnly) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const L = (window as any).L;
        const map = mapInstanceRef.current;
        if (!map || !L) { setLocating(false); return; }
        map.setView([lat, lng], 17);
        if (markerRef.current) markerRef.current.remove();
        const icon = L.divIcon({ className: "", html: MARKER_HTML, iconSize: [32, 32], iconAnchor: [16, 32] });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          if (data.display_name) label = data.display_name;
        } catch {}
        setHint(`📍 ${label}`);
        onChange?.({ lat, lng }, label);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div ref={mapRef} style={{ height, width: "100%" }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 flex-1 truncate">{hint}</p>
        {!readOnly && (
          <button
            type="button"
            onClick={handleMyLocation}
            disabled={locating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            {locating ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
            My Location
          </button>
        )}
      </div>
    </div>
  );
}
