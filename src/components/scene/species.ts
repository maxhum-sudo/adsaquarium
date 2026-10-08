export type SpeciesId =
  | "clownfish"
  | "tang"
  | "angelfish"
  | "chromis"
  | "goby"
  | "butterfly"
  | "gramma";

export type SwimMode = "anemone" | "sand" | "school" | "mid" | "low";

export type SpeciesInfo = {
  label: string;
  color: string;
  length: number;
  height: number;
  width: number;
  tailHeight: number;
  tailLength: number;
  dorsal: number;
  speed: number;
  mode: SwimMode;
};

export const SPECIES: Record<SpeciesId, SpeciesInfo> = {
  clownfish: {
    label: "clownfish",
    color: "#ff7a2f",
  length: 0.32,
  height: 0.1,
  width: 0.062,
  tailHeight: 0.1,
  tailLength: 0.09,
  dorsal: 0.04,
    speed: 0.36,
    mode: "anemone",
  },
  tang: {
    label: "blue tang",
    color: "#3b82f6",
  length: 0.28,
  height: 0.18,
  width: 0.04,
  tailHeight: 0.1,
  tailLength: 0.08,
  dorsal: 0.015,
    speed: 0.9,
    mode: "mid",
  },
  angelfish: {
    label: "emperor angelfish",
    color: "#f5d76e",
  length: 0.26,
  height: 0.22,
  width: 0.038,
  tailHeight: 0.09,
  tailLength: 0.07,
  dorsal: 0.05,
    speed: 0.5,
    mode: "mid",
  },
  chromis: {
    label: "blue chromis",
    color: "#67e8f9",
  length: 0.16,
  height: 0.05,
  width: 0.03,
  tailHeight: 0.05,
  tailLength: 0.05,
  dorsal: 0.015,
    speed: 0.85,
    mode: "school",
  },
  goby: {
    label: "watchman goby",
    color: "#d6b483",
  length: 0.24,
  height: 0.055,
  width: 0.04,
  tailHeight: 0.045,
  tailLength: 0.05,
  dorsal: 0.018,
    speed: 0.5,
    mode: "sand",
  },
  butterfly: {
    label: "raccoon butterflyfish",
    color: "#f8fafc",
  length: 0.24,
  height: 0.15,
  width: 0.038,
  tailHeight: 0.08,
  tailLength: 0.07,
  dorsal: 0.02,
    speed: 0.62,
    mode: "mid",
  },
  gramma: {
    label: "royal gramma",
    color: "#c084fc",
  length: 0.2,
  height: 0.055,
  width: 0.034,
  tailHeight: 0.05,
  tailLength: 0.05,
  dorsal: 0.02,
    speed: 0.55,
    mode: "low",
  },
};

export const STOCK: { species: SpeciesId; count: number }[] = [
  { species: "clownfish", count: 2 },
  { species: "tang", count: 1 },
  { species: "angelfish", count: 1 },
  { species: "chromis", count: 6 },
  { species: "goby", count: 2 },
  { species: "butterfly", count: 1 },
  { species: "gramma", count: 1 },
];

export const FISH_CAP = 24;

// 10× the original exhibit on each axis. The camera stays just above the near sand
// so the extra width, height, and depth read as open water instead of a bigger box.
export const TANK = {
  halfX: 29,
  sandY: -14,
  surfaceY: 11.6,
  backZ: -26.15,
  frontZ: 0.35,
  cameraY: -12.38,
  cameraZ: 1.28,
};
