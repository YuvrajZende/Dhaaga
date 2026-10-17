"use client";

import React, { useState } from "react";
import { MapPin, Navigation, X, AlertCircle } from "lucide-react";
import { LocationContext } from "@/lib/places/types";

interface LocationSelectorProps {
  currentLocation: LocationContext | null;
  onLocationChange: (loc: LocationContext | null) => void;
  needsPrompt?: boolean;
}

const PRESET_CITIES: Array<{ city: string; label: string; lat: number; lng: number }> = [
  { city: "Vadodara", label: "Vadodara", lat: 22.3072, lng: 73.1812 },
  { city: "Mumbai", label: "Mumbai", lat: 19.076, lng: 72.8777 },
  { city: "New York", label: "SoHo, NY", lat: 40.7233, lng: -74.003 },
];

export default function LocationSelector({
  currentLocation,
  onLocationChange,
  needsPrompt = false,
}: LocationSelectorProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCity, setManualCity] = useState("");

  function handleRequestBrowserLocation() {
    if (!navigator.geolocation) {
      setErrorMsg("Location is not supported by your browser. Please select a city manually.");
      return;
    }

    setIsLocating(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        // Ephemeral in-memory location for search request only
        onLocationChange({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          city: "Near me",
          label: "📍 Near me",
        });
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMsg("Location permission was not granted. You can select a city below.");
        } else {
          setErrorMsg("Could not detect location. Please select a city manually.");
        }
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }

  function handleSelectPreset(preset: (typeof PRESET_CITIES)[0]) {
    setErrorMsg(null);
    onLocationChange({
      latitude: preset.lat,
      longitude: preset.lng,
      city: preset.city,
      label: preset.label,
    });
  }

  function handleManualSubmit(e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) {
    if (e) e.preventDefault();
    if (!manualCity.trim()) return;

    // Check if matching preset
    const match = PRESET_CITIES.find(
      (p) => p.city.toLowerCase() === manualCity.trim().toLowerCase()
    );

    if (match) {
      handleSelectPreset(match);
    } else {
      // Coarse manual city search without raw coordinates
      onLocationChange({
        city: manualCity.trim(),
        label: manualCity.trim(),
      });
    }
    setShowManualInput(false);
    setManualCity("");
  }

  return (
    <div className="space-y-2">
      {/* Contextual location prompt when searching places without coordinates */}
      {needsPrompt && !currentLocation && (
        <div className="material-thin flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent-find)]/30 bg-[var(--accent-find)]/5 p-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--accent-find)]" />
            <span>
              Happensten needs your location to find recommended places near you.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestBrowserLocation}
              disabled={isLocating}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-find)] px-3 py-1.5 font-medium text-[var(--accent-on-find)] transition-transform hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Navigation className="h-3 w-3" />
              <span>{isLocating ? "Detecting..." : "Allow location"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="material-thin material-interactive rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Choose manually
            </button>
          </div>
        </div>
      )}

      {/* Active location indicator and selection chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="mono-voice text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          LOCATION:
        </span>

        {/* Current Active Location Tag */}
        {currentLocation ? (
          <div className="material-thin flex items-center gap-1.5 rounded-full border border-[var(--accent-find)]/40 bg-[var(--accent-find)]/10 px-3 py-1 text-[var(--text-primary)]">
            <span className="font-medium">{currentLocation.label || currentLocation.city || "Selected location"}</span>
            <button
              type="button"
              onClick={() => onLocationChange(null)}
              className="ml-1 text-[var(--text-tertiary)] hover:text-white transition-colors"
              title="Clear location"
              aria-label="Clear location"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRequestBrowserLocation}
            disabled={isLocating}
            className="material-thin material-interactive flex items-center gap-1 rounded-full px-2.5 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Navigation className="h-3 w-3 text-[var(--accent-find)]" />
            <span>{isLocating ? "Detecting..." : "Near me"}</span>
          </button>
        )}

        {/* Preset City Chips */}
        {PRESET_CITIES.map((preset) => {
          const isSelected = currentLocation?.city?.toLowerCase() === preset.city.toLowerCase();
          return (
            <button
              type="button"
              key={preset.city}
              onClick={() => handleSelectPreset(preset)}
              className={`material-thin material-interactive rounded-full px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? "border-[var(--accent-find)]/50 bg-[var(--accent-find)]/15 text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}

        {/* Enter Custom City */}
        {!showManualInput ? (
          <button
            type="button"
            onClick={() => setShowManualInput(true)}
            className="material-thin material-interactive rounded-full px-2.5 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            Enter city...
          </button>
        ) : (
          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleManualSubmit(e);
                } else if (e.key === "Escape") {
                  setShowManualInput(false);
                }
              }}
              placeholder="e.g. Pune, Delhi"
              autoFocus
              className="h-6 w-28 rounded-md bg-black/40 px-2 text-xs text-white border border-white/10 focus:border-[var(--accent-find)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleManualSubmit}
              className="rounded bg-[var(--accent-find)] px-2 py-0.5 text-[10px] text-[var(--accent-on-find)] hover:brightness-110"
            >
              Set
            </button>
            <button
              type="button"
              onClick={() => setShowManualInput(false)}
              className="text-[var(--text-tertiary)] hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Error banner if permission denied */}
      {errorMsg && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 pl-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
