"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { AquariumApi } from "@/components/scene/AquariumScene";
import { FISH_CAP, SPECIES, STOCK, type SpeciesId } from "@/components/scene/species";

const Scene = dynamic(() => import("@/components/scene/AquariumScene"), {
  ssr: false,
});

type RosterItem = { id: SpeciesId; count: number; label: string; color: string };

const openingRoster: RosterItem[] = STOCK.map((item) => ({
  id: item.species,
  count: item.count,
  label: SPECIES[item.species].label,
  color: SPECIES[item.species].color,
}));

export function Aquarium() {
  const apiRef = useRef<AquariumApi | null>(null);
  const [rosterItems, setRosterItems] = useState(openingRoster);
  const [notice, setNotice] = useState("Drag to look around. Tap the water to feed.");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [armed, setArmed] = useState(false);
  const [gyroLive, setGyroLive] = useState(false);
  const [calibrateNonce, setCalibrateNonce] = useState(0);
  const [calm, setCalm] = useState(false);
  const count = rosterItems.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    const orientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    const gesture = typeof orientation.requestPermission === "function";
    setNeedsGesture(gesture);
    setArmed(!gesture);
    setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null) return;
      setGyroLive(true);
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [armed]);

  useEffect(() => {
    if (gyroLive) setNotice("Move your phone to look around the reef.");
  }, [gyroLive]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        apiRef.current?.feed();
        setNotice("Food is drifting down.");
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        welcome();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function enableMotion() {
    const orientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof orientation.requestPermission === "function") {
      const result = await orientation.requestPermission();
      if (result !== "granted") {
        setNotice("Motion access was denied. Drag to look around instead.");
        return;
      }
    }
    setArmed(true);
    setCalibrateNonce((value) => value + 1);
  }

  function welcome() {
    const species = apiRef.current?.addFish();
    if (!species) {
      setNotice("The tank is full.");
      return;
    }
    const label = SPECIES[species].label;
    const article = /^[aeiou]/.test(label) ? "An" : "A";
    setNotice(`${article} ${label} swims in.`);
  }

  const hint = needsGesture && !armed ? "This tank can follow your phone." : notice;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#041820] text-[#e7f6f8]">
      <Scene
        armed={armed}
        calibrateNonce={calibrateNonce}
        calm={calm}
        onReady={(api) => {
          apiRef.current = api;
        }}
        onRoster={setRosterItems}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,8,16,0.45)]"
        style={{
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.14), transparent 22%, transparent 70%, rgba(255,255,255,0.05))",
        }}
      />
      <header className="pointer-events-none absolute left-3 top-3 max-w-sm sm:left-5 sm:top-5">
        <div className="rounded-2xl bg-[#041820]/50 px-3.5 py-2.5 backdrop-blur-md">
          <h1 className="font-display text-2xl leading-none text-white sm:text-3xl">The Aquarium</h1>
          <p className="mt-1.5 text-sm text-[#d7eef2]">{hint}</p>
          <p className="mt-1 text-xs text-[#9ec9d1]">
            {count} fish · F to feed · N for a new fish
          </p>
        </div>
      </header>
      <footer className="absolute bottom-3 left-16 right-3 flex flex-wrap items-center gap-2 sm:bottom-5 sm:left-16">
        {needsGesture && !armed ? (
          <button
            type="button"
            onClick={() => void enableMotion()}
            className="rounded-full bg-[#e7f7f4] px-4 py-2 text-sm font-semibold text-[#08323a]"
          >
            Look around with motion
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            apiRef.current?.feed();
            setNotice("Food is drifting down.");
          }}
          className="rounded-full bg-[#e7f7f4] px-4 py-2 text-sm font-semibold text-[#08323a]"
        >
          Feed
        </button>
        <button
          type="button"
          onClick={welcome}
          disabled={count >= FISH_CAP}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          New fish
        </button>
        {gyroLive ? (
          <button
            type="button"
            onClick={() => setCalibrateNonce((value) => value + 1)}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white"
          >
            Reset view
          </button>
        ) : null}
      </footer>
    </div>
  );
}
