import * as THREE from "three";
import { SPECIES, type SpeciesId } from "./species";

export type FishAssets = {
  body: THREE.BufferGeometry;
  dorsal: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  pectoral: THREE.BufferGeometry;
  map: THREE.Texture;
  normal: THREE.Texture;
  length: number;
  height: number;
  width: number;
};

const geometries = new Map<string, { body: THREE.BufferGeometry; dorsal: THREE.BufferGeometry; tail: THREE.BufferGeometry }>();
const colorMaps = new Map<SpeciesId, THREE.Texture>();
let scaleNormal: THREE.Texture | null = null;
const pectorals = new Map<number, THREE.BufferGeometry>();

export function getFishAssets(species: SpeciesId): FishAssets {
  const info = SPECIES[species];
  const key = `${info.length}:${info.height}:${info.width}:${info.tailHeight}:${info.tailLength}:${info.dorsal}`;
  let geos = geometries.get(key);
  if (!geos) {
    geos = {
      body: buildBody(info.length, info.height, info.width),
      dorsal: buildDorsal(info.length, info.height, info.dorsal),
      tail: buildTail(info.length, info.tailHeight, info.tailLength),
    };
    geometries.set(key, geos);
  }
  return {
    ...geos,
    pectoral: getPectoral(info.length),
    map: getColorMap(species),
    normal: getScaleNormal(),
    length: info.length,
    height: info.height,
    width: info.width,
  };
}

export type SwimUniforms = {
  uTime: { value: number };
  uPhase: { value: number };
  uAmp: { value: number };
  uRate: { value: number };
};

export function createFishMaterial(species: SpeciesId, phase: number, amp: number): {
  material: THREE.MeshPhysicalMaterial;
  uniforms: SwimUniforms;
} {
  const assets = getFishAssets(species);
  const uniforms: SwimUniforms = {
    uTime: { value: 0 },
    uPhase: { value: phase },
    uAmp: { value: amp },
    uRate: { value: 6 },
  };
  const material = new THREE.MeshPhysicalMaterial({
    map: assets.map,
    normalMap: assets.normal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.28,
    metalness: 0.02,
    clearcoat: 0.72,
    clearcoatRoughness: 0.22,
    sheen: 0.45,
    sheenColor: new THREE.Color("#fff4e8"),
    sheenRoughness: 0.55,
    side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () => `swim-${species}-${phase.toFixed(3)}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPhase = uniforms.uPhase;
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.uniforms.uRate = uniforms.uRate;
    shader.vertexShader =
      "uniform float uTime;\nuniform float uPhase;\nuniform float uAmp;\nuniform float uRate;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         float tail = smoothstep(-0.02, 0.28, position.z);
         float wave = sin(uTime * uRate + uPhase + position.z * 11.0) * uAmp * tail;
         transformed.x += wave;
         transformed.y += wave * 0.12;`,
      );
    material.userData.shader = shader;
  };
  return { material, uniforms };
}

export function createFinMaterial(species: SpeciesId) {
  const info = SPECIES[species];
  return new THREE.MeshPhysicalMaterial({
    color: info.color,
    map: getColorMap(species),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function getPectoral(length: number) {
  const cached = pectorals.get(length);
  if (cached) return cached;
  const geo = new THREE.CircleGeometry(1, 14);
  geo.scale(length * 0.2, length * 0.13, 1);
  pectorals.set(length, geo);
  return geo;
}

function getScaleNormal() {
  if (scaleNormal) return scaleNormal;
  const size = 128;
  const height = new Float32Array(size * size);
  const cell = size / 10;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / (cell * 0.78));
      const shift = (row % 2) * cell * 0.5;
      const cx = Math.round((x - shift) / cell) * cell + cell * 0.5 + shift;
      const cy = row * cell * 0.78 + cell * 0.4;
      const dx = x - cx;
      const dy = (y - cy) / 0.72;
      const dist = Math.hypot(dx, dy) / (cell * 0.48);
      height[y * size + x] = dist < 1 ? Math.sqrt(1 - dist * dist) : 0;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw scale normals");
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sample = (sx: number, sy: number) =>
        height[((sy + size) % size) * size + ((sx + size) % size)] ?? 0;
      const nx = (sample(x - 1, y) - sample(x + 1, y)) * 1.6;
      const ny = (sample(x, y - 1) - sample(x, y + 1)) * 1.6;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const p = (y * size + x) * 4;
      image.data[p] = (nx / len) * 127 + 128;
      image.data[p + 1] = (ny / len) * 127 + 128;
      image.data[p + 2] = (nz / len) * 127 + 128;
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.NoColorSpace;
  scaleNormal = tex;
  return tex;
}

function getColorMap(species: SpeciesId) {
  const cached = colorMaps.get(species);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw fish colors");
  paintSpecies(ctx, species, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  colorMaps.set(species, tex);
  return tex;
}

function paintSpecies(ctx: CanvasRenderingContext2D, species: SpeciesId, w: number, h: number) {
  const paint = (dorsal: string, mid: string, belly: string) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, dorsal);
    gradient.addColorStop(0.32, mid);
    gradient.addColorStop(0.5, belly);
    gradient.addColorStop(0.68, mid);
    gradient.addColorStop(1, dorsal);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  };

  if (species === "clownfish") {
    paint("#c2410c", "#ff6a1a", "#ffc48a");
    for (const u of [0.22, 0.48, 0.7]) {
      ctx.fillStyle = "#1c140f";
      ctx.fillRect(u * w - 16, 0, 32, h);
      ctx.fillStyle = "#fff6ee";
      ctx.fillRect(u * w - 9, 0, 18, h);
    }
  } else if (species === "tang") {
    paint("#1e3a8a", "#2563eb", "#60a5fa");
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(0, 0, w * 0.16, h);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.32, 46, 0.4, 2.4);
    ctx.stroke();
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(0, 0, w, 10);
  } else if (species === "angelfish") {
    paint("#172554", "#1e3a8a", "#1d4ed8");
    ctx.strokeStyle = "#ffe14a";
    ctx.lineWidth = 7;
    for (let i = 1; i < 7; i += 1) {
      const y = (i / 7) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w * 0.82, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(w * 0.78, 0, w * 0.22, h);
    ctx.fillStyle = "#ffe14a";
    ctx.fillRect(0, 0, w * 0.12, h);
  } else if (species === "chromis") {
    paint("#0e7490", "#22d3ee", "#cffafe");
  } else if (species === "goby") {
    paint("#a16207", "#d6b07a", "#f3e0bf");
    ctx.fillStyle = "rgba(30, 90, 120, 0.35)";
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(w * (0.3 + i * 0.1), h * 0.48, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (species === "butterfly") {
    paint("#e7e5e4", "#fafaf9", "#fff");
    ctx.fillStyle = "#f6c531";
    ctx.fillRect(0, 0, w * 0.28, h);
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(w * 0.62, 0, w * 0.08, h);
    ctx.beginPath();
    ctx.arc(w * 0.18, h * 0.5, 14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    paint("#6b21a8", "#9333ea", "#d8b4fe");
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(0, 0, w * 0.46, h);
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.22, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2, 1, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildBody(length: number, height: number, width: number) {
  const lengthSegs = 28;
  const radialSegs = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const ringStart: number[] = [];
  for (let i = 0; i <= lengthSegs; i += 1) {
    const t = i / lengthSegs;
    const z = (0.5 - t) * length;
    const radius = profile(t);
    ringStart.push(positions.length / 3);
    for (let j = 0; j <= radialSegs; j += 1) {
      const angle = (j / radialSegs) * Math.PI * 2;
      positions.push(Math.sin(angle) * radius * width, Math.cos(angle) * radius * height, z);
      uvs.push(t, j / radialSegs);
    }
  }

  for (let i = 0; i < lengthSegs; i += 1) {
    for (let j = 0; j < radialSegs; j += 1) {
      const a = ringStart[i]! + j;
      const b = ringStart[i + 1]! + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return finalize(positions, uvs, indices);
}

function buildDorsal(length: number, height: number, dorsal: number) {
  const steps = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = 0.28 + (i / steps) * 0.42;
    const z = (0.5 - t) * length;
    const base = profile(t) * height * 0.92;
    const tip = base + dorsal * Math.sin((i / steps) * Math.PI);
    positions.push(0, base, z, 0, tip, z);
    uvs.push(t, 0.15, t, 0.02);
  }
  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return finalize(positions, uvs, indices);
}

function buildTail(length: number, tailHeight: number, tailLength: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const z0 = length * 0.46;
  const fork = z0 + tailLength;
  const notch = z0 + tailLength * 0.42;
  const pts: [number, number, number][] = [
    [0, 0, z0],
    [0, tailHeight, fork],
    [0, tailHeight * 0.18, notch],
    [0, 0, z0 + tailLength * 0.2],
    [0, -tailHeight * 0.18, notch],
    [0, -tailHeight, fork],
  ];
  for (const [x, y, z] of pts) {
    positions.push(x, y, z);
    uvs.push(0.04, 0.5 + y / (tailHeight * 2 + 0.001));
  }
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
  return finalize(positions, uvs, indices);
}

function finalize(positions: number[], uvs: number[], indices: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function profile(t: number) {
  const peduncle = smoothstep(0.02, 0.16, t);
  const nose = 1 - smoothstep(0.8, 1, t) * 0.5;
  const body = Math.sin(Math.min(t, 0.92) * Math.PI) ** 0.7;
  return Math.max(0.07, body * Math.max(0.2, peduncle) * nose);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
