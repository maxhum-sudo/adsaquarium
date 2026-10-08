"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createFinMaterial, createFishMaterial, getFishAssets } from "./fishMesh";
import { addFish, createSim, dropFood, roster, updateSim, type FishAgent, type Sim } from "./sim";
import { TANK, type SpeciesId } from "./species";

export type AquariumApi = {
  feed: () => void;
  addFish: () => SpeciesId | null;
};

type Props = {
  armed: boolean;
  calibrateNonce: number;
  calm: boolean;
  onReady: (api: AquariumApi) => void;
  onRoster: (items: { id: SpeciesId; count: number; label: string; color: string }[]) => void;
};

const _dummy = new THREE.Object3D();
const _target = new THREE.Vector3();
const zee = new THREE.Vector3(0, 0, 1);
const deviceEuler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

export default function AquariumScene(props: Props) {
  const coarse =
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <Canvas
      shadows
      dpr={coarse ? [1, 1.3] : [1, 1.75]}
      camera={{
        fov: 64,
        near: 0.06,
        far: 140,
        position: [0, TANK.cameraY, TANK.cameraZ],
      }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#0c6580");
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
      }}
    >
      <Reef {...props} fancy={!coarse} />
    </Canvas>
  );
}

function Reef({
  armed,
  calibrateNonce,
  calm,
  onReady,
  onRoster,
  fancy,
}: Props & { fancy: boolean }) {
  const sim = useMemo(() => createSim(), []);
  const [ids, setIds] = useState(() => sim.fish.map((fish) => fish.id));
  const onReadyRef = useRef(onReady);
  const onRosterRef = useRef(onRoster);
  onReadyRef.current = onReady;
  onRosterRef.current = onRoster;

  useEffect(() => {
    onReadyRef.current({
      feed: () => dropFood(sim, (Math.random() - 0.5) * 2.4, -0.8 - Math.random() * 2.5, TANK.cameraY + 0.8),
      addFish: () => {
        const species = addFish(sim);
        if (!species) return null;
        setIds(sim.fish.map((fish) => fish.id));
        onRosterRef.current(roster(sim));
        return species;
      },
    });
    onRosterRef.current(roster(sim));
  }, [sim]);

  return (
    <>
      <fogExp2 attach="fog" args={["#147894", 0.016]} />
      <hemisphereLight color="#d7f3ff" groundColor="#e7c99a" intensity={0.55} />
      <directionalLight position={[8, TANK.surfaceY + 4, 8]} intensity={1.2} color="#f7fbff" />
      <Sun fancy={fancy} />
      <mesh position={[0, (TANK.sandY + TANK.surfaceY) / 2, (TANK.backZ + TANK.cameraZ) / 2]}>
        <boxGeometry args={[TANK.halfX * 2 + 30, TANK.surfaceY - TANK.sandY + 20, TANK.cameraZ - TANK.backZ + 24]} />
        <meshBasicMaterial color="#071016" side={THREE.BackSide} />
      </mesh>
      <TankShell />
      <Sand />
      <CausticSheet />
      <WaterSurface />
      <Rays />
      <Scenery anemone={sim.anemone} />
      <LookRig sim={sim} armed={armed} calibrateNonce={calibrateNonce} calm={calm} />
      {ids.map((id) => {
        const agent = sim.fish.find((fish) => fish.id === id);
        return agent ? <FishView key={id} agent={agent} /> : null;
      })}
      <Pellets sim={sim} />
      <Bubbles fancy={fancy} />
      <Motes />
    </>
  );
}

function Sun({ fancy }: { fancy: boolean }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return { canvas, tex };
  }, []);

  useLayoutEffect(() => {
    if (!light.current || !target.current) return;
    light.current.target = target.current;
  }, []);

  useFrame(({ clock }) => {
    const ctx = texture.canvas.getContext("2d");
    if (!ctx) return;
    const t = clock.elapsedTime;
    const size = texture.canvas.width;
    ctx.fillStyle = "#05080a";
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 16; i += 1) {
      const x = size * (0.5 + 0.38 * Math.sin(t * 0.65 + i * 1.7));
      const y = size * (0.5 + 0.38 * Math.cos(t * 0.5 + i * 2.2));
      const radius = size * (0.035 + (i % 4) * 0.012);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    texture.tex.needsUpdate = true;
  });

  return (
    <>
      <spotLight
        ref={light}
        position={[0.3, TANK.surfaceY + 1.5, 0.2]}
        angle={0.62}
        penumbra={0.5}
        intensity={fancy ? 140 : 90}
        color="#e7f6ff"
        map={texture.tex}
        castShadow
        shadow-mapSize-width={fancy ? 1024 : 512}
        shadow-mapSize-height={fancy ? 1024 : 512}
        shadow-bias={-0.0008}
        shadow-normalBias={0.08}
        shadow-camera-near={1}
        shadow-camera-far={48}
        distance={60}
        decay={1.15}
      />
      <object3D ref={target} position={[0, TANK.sandY + 0.4, -6]} />
      <mesh
        position={[0, TANK.surfaceY + 0.45, (TANK.backZ + TANK.cameraZ) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[TANK.halfX * 2 + 4, TANK.cameraZ - TANK.backZ + 4]} />
        <meshBasicMaterial color="#0c141c" />
      </mesh>
      <mesh position={[0.15, TANK.surfaceY + 0.42, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 2.4]} />
        <meshBasicMaterial color="#fff1c8" />
      </mesh>
    </>
  );
}

function TankShell() {
  const rim = (
    <meshStandardMaterial color="#1a242b" roughness={0.38} metalness={0.45} />
  );
  const frontRimZ = TANK.cameraZ + 0.5;
  const rimDepth = frontRimZ - TANK.backZ;
  const rimMidZ = (frontRimZ + TANK.backZ) / 2;
  const width = TANK.halfX * 2 + 0.8;
  const wallH = TANK.surfaceY - TANK.sandY + 0.4;
  const wallMidY = (TANK.surfaceY + TANK.sandY) / 2;
  return (
    <group>
      <mesh position={[0, TANK.surfaceY + 0.1, frontRimZ]}>
        <boxGeometry args={[width + 0.5, 0.16, 0.16]} />
        {rim}
      </mesh>
      <mesh position={[0, TANK.surfaceY + 0.1, TANK.backZ]}>
        <boxGeometry args={[width + 0.5, 0.16, 0.16]} />
        {rim}
      </mesh>
      <mesh position={[-TANK.halfX - 0.08, TANK.surfaceY + 0.1, rimMidZ]}>
        <boxGeometry args={[0.16, 0.16, rimDepth]} />
        {rim}
      </mesh>
      <mesh position={[TANK.halfX + 0.08, TANK.surfaceY + 0.1, rimMidZ]}>
        <boxGeometry args={[0.16, 0.16, rimDepth]} />
        {rim}
      </mesh>
      {(
        [
          [-TANK.halfX, wallMidY, rimMidZ],
          [TANK.halfX, wallMidY, rimMidZ],
        ] as const
      ).map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[0, index === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <planeGeometry args={[rimDepth, wallH]} />
          <meshPhysicalMaterial
            color="#c5eef8"
            transparent
            opacity={0.07}
            roughness={0.04}
            metalness={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh position={[0, wallMidY, TANK.backZ]} rotation={[0, 0, 0]}>
        <planeGeometry args={[width, wallH]} />
        <meshPhysicalMaterial
          color="#9fd8e6"
          transparent
          opacity={0.05}
          roughness={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function tankFootprint() {
  const front = TANK.cameraZ + 1.6;
  const back = TANK.backZ - 0.5;
  return {
    width: TANK.halfX * 2 + 1.4,
    depth: front - back,
    z: (front + back) / 2,
  };
}

function Sand() {
  const geo = useMemo(() => {
    const foot = tankFootprint();
    const plane = new THREE.PlaneGeometry(foot.width, foot.depth, 64, 36);
    const pos = plane.attributes.position;
    if (!pos) return plane;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(
        i,
        Math.sin(x * 0.85) * 0.045 + Math.sin(y * 1.3 + x * 0.4) * 0.028,
      );
    }
    plane.computeVertexNormals();
    return plane;
  }, []);
  const map = useMemo(() => {
    const foot = tankFootprint();
    return makeSandTexture(foot.width / 1.6, foot.depth / 1.5);
  }, []);
  const foot = tankFootprint();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TANK.sandY, foot.z]} receiveShadow geometry={geo}>
      <meshStandardMaterial map={map} bumpMap={map} bumpScale={0.04} roughness={1} metalness={0} color="#e7d3a4" />
    </mesh>
  );
}

function CausticSheet() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          float caustic(vec2 uv, float t) {
            vec2 p = uv * 42.0;
            p.x += sin(p.y * 1.5 + t * 0.8) * 0.35;
            p.y += cos(p.x * 1.3 - t * 0.65) * 0.35;
            float c = sin(p.x * 3.1 + t) * sin(p.y * 2.7 - t * 0.85);
            c += sin(p.x * 5.2 - t * 1.05 + p.y) * sin(p.y * 4.4 + t);
            return pow(max(c * 0.5 + 0.5, 0.0), 7.0);
          }
          void main() {
            float c = caustic(vUv, uTime) + 0.4 * caustic(vUv * 1.8 + 3.0, uTime * 1.2);
            gl_FragColor = vec4(vec3(0.72, 0.9, 0.82) * c * 0.55, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.elapsedTime;
  });
  const foot = tankFootprint();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TANK.sandY + 0.025, foot.z]} material={material}>
      <planeGeometry args={[foot.width - 0.2, foot.depth - 0.2]} />
    </mesh>
  );
}

function WaterSurface() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          uniform float uTime;
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vec3 pos = position;
            float wave = sin(pos.x * 2.4 + uTime * 1.3) * 0.025 + sin(pos.y * 3.1 - uTime * 1.05) * 0.018;
            pos.z += wave;
            vec4 world = modelMatrix * vec4(pos, 1.0);
            vWorld = world.xyz;
            vNormal = normalize(mat3(modelMatrix) * vec3(-cos(pos.x * 2.4 + uTime * 1.3) * 0.06, -cos(pos.y * 3.1 - uTime) * 0.05, 1.0));
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.2);
            vec3 deep = vec3(0.45, 0.78, 0.82);
            vec3 shine = vec3(0.92, 0.98, 0.96);
            vec3 color = mix(deep, shine, fresnel);
            gl_FragColor = vec4(color, 0.42 + fresnel * 0.45);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.elapsedTime;
  });
  const foot = tankFootprint();
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, TANK.surfaceY, foot.z]}
      material={material}
    >
      <planeGeometry args={[foot.width + 0.2, foot.depth + 0.2, 48, 32]} />
    </mesh>
  );
}

function Rays() {
  const group = useRef<THREE.Group>(null);
  const bases = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        x: -20 + index * 5,
        z: -1.5 - (index % 3) * 7,
      })),
    [],
  );
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const vertical = ctx.createLinearGradient(0, 0, 0, 256);
    vertical.addColorStop(0, "rgba(255,255,255,0.95)");
    vertical.addColorStop(0.7, "rgba(255,255,255,0.25)");
    vertical.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, 64, 256);
    const horizontal = ctx.createLinearGradient(0, 0, 64, 0);
    horizontal.addColorStop(0, "rgba(255,255,255,0)");
    horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
    horizontal.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    group.current?.children.forEach((child, index) => {
      const base = bases[index];
      if (!base) return;
      child.position.x = base.x + Math.sin(time * 0.18 + index) * 0.45;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.14 + Math.sin(time * 0.7 + index * 1.3) * 0.035;
    });
  });
  if (!map) return null;
  return (
    <group ref={group}>
      {bases.map((base, index) => (
        <mesh
          key={index}
          position={[base.x, TANK.sandY + 7.2, base.z]}
          rotation={[0.04, 0, (index - 4) * 0.03]}
        >
          <planeGeometry args={[1.8, 14]} />
          <meshBasicMaterial
            map={map}
            color="#e7fbff"
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function Scenery({ anemone }: { anemone: THREE.Vector3 }) {
  const rocks = useMemo(
    () => [
      { position: [-2.15, TANK.sandY + 0.08, 0.15] as [number, number, number], radius: 0.42, seed: 1.2, color: "#5c6b73" },
      { position: [1.7, TANK.sandY + 0.02, -1.15] as [number, number, number], radius: 0.55, seed: 2.4, color: "#46555d" },
      { position: [0.15, TANK.sandY - 0.02, -1.7] as [number, number, number], radius: 0.48, seed: 3.1, color: "#6a787f" },
      { position: [-0.4, TANK.sandY + 0.05, 0.55] as [number, number, number], radius: 0.28, seed: 4.2, color: "#3e4c54" },
    ],
    [],
  );
  return (
    <group>
      {rocks.map((rock) => (
        <Rock key={rock.seed} {...rock} />
      ))}
      <Kelp position={[-2.45, TANK.sandY, 0.72]} height={1.55} color="#1f8a62" phase={0.2} />
      <Kelp position={[-1.7, TANK.sandY, -0.85]} height={1.15} color="#176b4c" phase={1.4} />
      <Kelp position={[0.35, TANK.sandY, -1.35]} height={0.95} color="#21815d" phase={2.1} />
      <Kelp position={[2.35, TANK.sandY, -0.2]} height={1.45} color="#24966c" phase={0.8} />
      <Kelp position={[1.15, TANK.sandY, 0.85]} height={1.05} color="#146b48" phase={2.6} />
      <Tubes position={[0.15, TANK.sandY, -0.55]} color="#e48ab8" />
      <Tubes position={[-1.85, TANK.sandY, -0.35]} color="#d46aa4" scale={0.7} />
      <Fan position={[2.05, TANK.sandY, -0.85]} />
      <Anemone position={anemone} />
      <Arch />
      <Starfish />
      <Crab />
      <Jelly position={[-0.8, TANK.sandY + 1.95, -1.1]} radius={0.16} phase={0.4} tint="#d7f6fb" />
      <Jelly position={[1.35, TANK.sandY + 2.12, -0.7]} radius={0.22} phase={1.8} tint="#ffe0ea" />
      <ReefField />
    </group>
  );
}

function ReefField() {
  const field = useMemo(() => buildReefField(), []);
  return (
    <group>
      {field.rocks.map((rock) => (
        <Rock key={rock.seed} {...rock} />
      ))}
      {field.kelp.map((plant, index) => (
        <Kelp key={index} {...plant} />
      ))}
      {field.tubes.map((cluster) => (
        <Tubes key={`${cluster.position[0]}-${cluster.position[2]}`} {...cluster} />
      ))}
      {field.fans.map((fan) => (
        <group key={`${fan.position[0]}-${fan.position[2]}`} position={fan.position} scale={fan.scale}>
          <Fan position={[0, 0, 0]} />
        </group>
      ))}
      {field.jellies.map((jelly, index) => (
        <Jelly key={index} {...jelly} />
      ))}
    </group>
  );
}

function Rock({
  position,
  radius,
  seed,
  color,
}: {
  position: [number, number, number];
  radius: number;
  seed: number;
  color: string;
}) {
  const geo = useMemo(() => {
    const shape = new THREE.SphereGeometry(radius, 28, 20);
    const pos = shape.attributes.position;
    if (!pos) return shape;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n =
        Math.sin(x * 2.1 + seed) * 0.5 +
        Math.sin(y * 2.7 + z * 1.9 + seed) * 0.28 +
        Math.sin((x + z) * 5.2) * 0.12;
      const scale = 1 + n * 0.16;
      pos.setXYZ(i, x * scale, y * scale * 0.78, z * scale);
    }
    shape.computeVertexNormals();
    return shape;
  }, [radius, seed]);
  return (
    <mesh geometry={geo} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.94} metalness={0.02} />
    </mesh>
  );
}

function Kelp({
  position,
  height,
  color,
  phase,
  width = 0.16,
}: {
  position: [number, number, number];
  height: number;
  color: string;
  phase: number;
  width?: number;
}) {
  const geo = useMemo(() => {
    const plane = new THREE.PlaneGeometry(width, height, 1, 12);
    plane.translate(0, height / 2, 0);
    plane.userData.base = Float32Array.from(plane.attributes.position?.array ?? []);
    return plane;
  }, [height, width]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position;
    const base = geo.userData.base as Float32Array | undefined;
    if (!pos || !base) return;
    const time = clock.elapsedTime;
    for (let i = 0; i < pos.count; i += 1) {
      const y = base[i * 3 + 1] ?? 0;
      const sway = Math.sin(time * 1.15 + phase + y * 2.1) * (y / height) ** 2 * (0.2 + height * 0.06);
      pos.setX(i, (base[i * 3] ?? 0) + sway);
    }
    pos.needsUpdate = true;
  });
  return (
    <group position={position}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo} rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Tubes({
  position,
  color,
  scale = 1,
}: {
  position: [number, number, number];
  color: string;
  scale?: number;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.z = Math.sin(clock.elapsedTime * 0.7 + position[0]) * 0.04;
  });
  return (
    <group ref={group} position={position}>
      {Array.from({ length: 6 }, (_, index) => {
        const height = (0.28 + (index % 3) * 0.1) * scale;
        return (
          <mesh
            key={index}
            position={[(index - 2.5) * 0.07 * scale, height / 2, (index % 2) * 0.04]}
            castShadow
          >
            <capsuleGeometry args={[0.032 * scale, Math.max(0.05, height - 0.06), 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.48} />
          </mesh>
        );
      })}
    </group>
  );
}

function Fan({ position }: { position: [number, number, number] }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = "#f0a36a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i += 1) {
      const angle = Math.PI + (i / 17) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(128, 230);
      ctx.quadraticCurveTo(
        128 + Math.cos(angle) * 70,
        230 + Math.sin(angle) * 40,
        128 + Math.cos(angle) * 110,
        230 + Math.sin(angle) * 150,
      );
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.z = Math.sin(clock.elapsedTime * 0.6) * 0.05;
  });
  if (!map) return null;
  return (
    <group ref={group} position={position}>
      <mesh position={[0, 0.42, 0]}>
        <planeGeometry args={[0.95, 0.85]} />
        <meshStandardMaterial map={map} transparent roughness={0.6} side={THREE.DoubleSide} alphaTest={0.05} />
      </mesh>
    </group>
  );
}

function Anemone({ position }: { position: THREE.Vector3 }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    refs.current.forEach((group, index) => {
      if (!group) return;
      group.rotation.x = 0.45 + Math.sin(time * 1.2 + index * 0.6) * 0.2;
      group.rotation.z = Math.sin(time * 1.5 + index) * 0.22;
    });
  });
  return (
    <group position={position}>
      {Array.from({ length: 14 }, (_, index) => {
        const len = 0.2 + (index % 4) * 0.045;
        return (
          <group
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            rotation={[0.4, (index / 14) * Math.PI * 2, 0]}
          >
            <mesh position={[0, len / 2, 0]}>
              <capsuleGeometry args={[0.016, len, 3, 6]} />
              <meshStandardMaterial color={index % 2 ? "#f3a0c0" : "#e36b98"} roughness={0.42} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.03, 0]}>
        <sphereGeometry args={[0.11, 18, 12]} />
        <meshStandardMaterial color="#c44770" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Arch() {
  return (
    <mesh position={[0.85, TANK.sandY, -0.7]} rotation={[0, 0.5, 0]} castShadow receiveShadow>
      <torusGeometry args={[0.42, 0.11, 12, 28, Math.PI]} />
      <meshStandardMaterial color="#7d736c" roughness={0.82} metalness={0.04} />
    </mesh>
  );
}

function Starfish() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? 0.12 : 0.048;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return new THREE.ShapeGeometry(shape);
  }, []);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0.4]} position={[0.15, TANK.sandY + 0.03, 0.15]}>
      <meshStandardMaterial color="#e07a45" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Crab() {
  const group = useRef<THREE.Group>(null);
  const leg = useRef(0);
  const facing = useRef(1);
  const pause = useRef(0.4);
  useFrame((_, dt) => {
    const crab = group.current;
    if (!crab) return;
    if (pause.current > 0) {
      pause.current -= dt;
    } else {
      leg.current += dt * 8;
      crab.position.x += facing.current * 0.12 * dt;
      if (crab.position.x > 1.6 || crab.position.x < -1.8) {
        facing.current *= -1;
        pause.current = 0.6;
      } else if (Math.random() < dt * 0.15) {
        pause.current = 0.4 + Math.random();
      }
    }
    crab.scale.x = facing.current;
    crab.children.forEach((child, index) => {
      if (index < 3) child.rotation.z = Math.sin(leg.current + index) * 0.35;
    });
  });
  return (
    <group ref={group} position={[-1.4, TANK.sandY + 0.06, 0.35]}>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh key={index} position={[-0.02 + index * 0.03, 0, 0.04]} rotation={[0, 0, 0.4]}>
          <capsuleGeometry args={[0.008, 0.06, 2, 4]} />
          <meshStandardMaterial color="#e0a06a" />
        </mesh>
      ))}
      <mesh position={[-0.02, 0.02, 0]} rotation={[0.4, 0, -0.3]}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshStandardMaterial color="#e7b27a" roughness={0.55} />
      </mesh>
      <mesh position={[0.05, 0.015, 0.02]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshStandardMaterial color="#efc09a" />
      </mesh>
    </group>
  );
}

function Jelly({
  position,
  radius,
  phase,
  tint,
}: {
  position: [number, number, number];
  radius: number;
  phase: number;
  tint: string;
}) {
  const group = useRef<THREE.Group>(null);
  const home = useRef(new THREE.Vector3(...position));
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16;
      const y = (1 - t) * radius * 0.72;
      const flare = t > 0.82 ? 1 + (t - 0.82) * 1.4 : 1;
      const r = Math.sin(t * Math.PI * 0.5) * radius * flare;
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    return new THREE.LatheGeometry(pts, 18);
  }, [radius]);
  useFrame(({ clock }) => {
    const jelly = group.current;
    if (!jelly) return;
    const time = clock.elapsedTime;
    const pulse = Math.sin(time * 2 + phase);
    jelly.position.set(
      home.current.x + Math.sin(time * 0.3 + phase) * 0.18,
      home.current.y + Math.cos(time * 0.22 + phase) * 0.06,
      home.current.z + Math.sin(time * 0.18 + phase * 2) * 0.1,
    );
    jelly.scale.set(1 + pulse * 0.06, 1 - pulse * 0.08, 1 + pulse * 0.06);
  });
  return (
    <group ref={group} position={position}>
      <mesh geometry={geo}>
        <meshPhysicalMaterial
          color={tint}
          transparent
          opacity={0.38}
          roughness={0.08}
          metalness={0}
          transmission={0.65}
          thickness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <Tentacle key={index} index={index} radius={radius} phase={phase} />
      ))}
    </group>
  );
}

function Tentacle({ index, radius, phase }: { index: number; radius: number; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const plane = new THREE.PlaneGeometry(0.012, radius * 1.8, 1, 8);
    plane.translate(0, -radius * 0.9, 0);
    plane.userData.base = Float32Array.from(plane.attributes.position?.array ?? []);
    return plane;
  }, [radius]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position;
    const base = geo.userData.base as Float32Array | undefined;
    if (!pos || !base) return;
    const time = clock.elapsedTime;
    for (let i = 0; i < pos.count; i += 1) {
      const y = base[i * 3 + 1] ?? 0;
      const sway = Math.sin(time * 2 + phase + index + y * 6) * (Math.abs(y) / (radius * 2)) * 0.05;
      pos.setX(i, (base[i * 3] ?? 0) + sway);
    }
    pos.needsUpdate = true;
    if (ref.current) {
      ref.current.position.x = Math.cos((index / 7) * Math.PI * 2) * radius * 0.35;
      ref.current.position.z = Math.sin((index / 7) * Math.PI * 2) * radius * 0.35;
    }
  });
  return (
    <mesh ref={ref} geometry={geo}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function FishView({ agent }: { agent: FishAgent }) {
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const aligned = useRef(false);
  const assets = useMemo(() => getFishAssets(agent.species), [agent.species]);
  const built = useMemo(
    () => createFishMaterial(agent.species, agent.phase, assets.length * 0.18),
    [agent.phase, agent.species, assets.length],
  );
  const fins = useMemo(() => createFinMaterial(agent.species), [agent.species]);
  useEffect(
    () => () => {
      built.material.dispose();
      fins.dispose();
    },
    [built.material, fins],
  );

  useFrame(({ clock }, dt) => {
    const fish = group.current;
    if (!fish) return;
    built.uniforms.uTime.value = clock.elapsedTime;
    built.uniforms.uRate.value = 5.5 + Math.min(6, agent.vel.length() * 10);
    built.uniforms.uAmp.value = assets.length * (0.16 + Math.min(0.2, agent.vel.length()));
    fish.position.copy(agent.pos);
    if (agent.vel.lengthSq() > 0.0006) {
      _target.copy(agent.pos).add(agent.vel);
      _dummy.position.copy(agent.pos);
      _dummy.up.set(0, 1, 0);
      _dummy.lookAt(_target);
      if (!aligned.current) {
        fish.quaternion.copy(_dummy.quaternion);
        aligned.current = true;
      } else {
        fish.quaternion.slerp(_dummy.quaternion, 1 - Math.exp(-7 * dt));
      }
    }
    fish.scale.setScalar(1 + agent.gulp * 0.07);
    const flap = Math.sin(clock.elapsedTime * 8 + agent.phase) * 0.55;
    if (left.current) left.current.rotation.z = 0.45 + flap;
    if (right.current) right.current.rotation.z = -0.45 - flap;
  });

  const eyeR = Math.max(0.012, assets.length * 0.048);
  const eyeX = assets.width * 0.95;
  const eyeY = assets.height * 0.22;
  const eyeZ = -assets.length * 0.26;

  return (
    <group ref={group}>
      <mesh geometry={assets.body} material={built.material} castShadow receiveShadow />
      <mesh geometry={assets.dorsal} material={built.material} />
      <mesh geometry={assets.tail} material={built.material} />
      <mesh
        ref={left}
        geometry={assets.pectoral}
        material={fins}
        position={[eyeX * 0.8, -assets.height * 0.05, -assets.length * 0.02]}
        rotation={[0.2, 0.5, 0.45]}
      />
      <mesh
        ref={right}
        geometry={assets.pectoral}
        material={fins}
        position={[-eyeX * 0.8, -assets.height * 0.05, -assets.length * 0.02]}
        rotation={[0.2, -0.5, -0.45]}
      />
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * eyeX, eyeY, eyeZ]} castShadow>
          <sphereGeometry args={[eyeR, 14, 14]} />
          <meshStandardMaterial color="#f6f2ea" roughness={0.12} />
          <mesh position={[side * eyeR * 0.25, eyeR * 0.05, -eyeR * 0.48]}>
            <sphereGeometry args={[eyeR * 0.46, 10, 10]} />
            <meshStandardMaterial color="#140e0a" roughness={0.25} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}

function Pellets({ sim }: { sim: Sim }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pelletGeo = useMemo(() => new THREE.SphereGeometry(0.045, 12, 12), []);
  const pelletMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffb703",
        roughness: 0.4,
        emissive: "#ff8c00",
        emissiveIntensity: 0.65,
      }),
    [],
  );
  useFrame(() => {
    const inst = mesh.current;
    if (!inst) return;
    for (let i = 0; i < 36; i += 1) {
      const pellet = sim.food[i];
      if (!pellet || !pellet.alive) {
        dummy.position.set(0, TANK.sandY - 6, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        dummy.position.copy(pellet.pos);
        dummy.scale.setScalar(pellet.life < 1.5 ? Math.max(0.2, pellet.life / 1.5) : 1);
        dummy.rotation.set(pellet.life, pellet.pos.x, 0);
      }
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[pelletGeo, pelletMat, 36]} frustumCulled={false} />;
}

function Bubbles({ fancy }: { fancy: boolean }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: fancy ? 22 : 12 }, (_, index) => {
        const near = index < (fancy ? 12 : 7);
        return {
          y: TANK.sandY + Math.random() * (near ? 3.4 : TANK.surfaceY - TANK.sandY - 0.4),
          r: 0.015 + Math.random() * 0.028,
          speed: (near ? 0.45 : 0.85) + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          homeX: near ? -2.4 + (index % 6) * 0.85 : (Math.random() - 0.5) * TANK.halfX * 1.5,
          homeZ: near ? 0.15 - (index % 4) * 0.7 : TANK.backZ + 1 + Math.random() * (TANK.frontZ - TANK.backZ - 2),
        };
      }),
    [fancy],
  );
  useFrame(({ clock }, dt) => {
    const time = clock.elapsedTime;
    group.current?.children.forEach((child, index) => {
      const seed = seeds[index];
      if (!seed) return;
      seed.y += seed.speed * dt;
      if (seed.y > TANK.surfaceY - 0.08) {
        seed.y = TANK.sandY + 0.08;
        seed.homeX = (Math.random() - 0.5) * (index < 8 ? 8 : TANK.halfX * 1.5);
        seed.homeZ = index < 8 ? -Math.random() * 4 : TANK.backZ + Math.random() * (TANK.frontZ - TANK.backZ);
      }
      child.position.set(
        seed.homeX + Math.sin(time * 1.6 + seed.phase) * 0.04,
        seed.y,
        seed.homeZ,
      );
    });
  });
  return (
    <group ref={group}>
      {seeds.map((seed, index) => (
        <mesh key={index} scale={seed.r}>
          {fancy ? (
            <meshPhysicalMaterial
              color="#e7fbff"
              transmission={1}
              thickness={0.15}
              roughness={0}
              metalness={0}
              ior={1.15}
              transparent
              opacity={0.45}
            />
          ) : (
            <meshStandardMaterial color="#e7fbff" transparent opacity={0.28} roughness={0.05} />
          )}
          <sphereGeometry args={[1, 12, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function Motes() {
  const positions = useMemo(() => {
    const count = 180;
    const array = new Float32Array(count * 3);
    const column = TANK.surfaceY - TANK.sandY;
    for (let i = 0; i < count; i += 1) {
      const near = i < 90;
      array[i * 3] = near ? (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * TANK.halfX * 1.8;
      array[i * 3 + 1] = TANK.sandY + 0.2 + Math.random() * (near ? 4.2 : column - 0.5);
      array[i * 3 + 2] = near ? 0.2 - Math.random() * 7 : TANK.backZ + Math.random() * (TANK.frontZ - TANK.backZ);
    }
    return array;
  }, []);
  const geo = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [positions]);
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const points = useRef<THREE.Points>(null);
  useFrame((_, dt) => {
    const attr = geo.attributes.position;
    if (!attr) return;
    for (let i = 0; i < attr.count; i += 1) {
      let y = attr.getY(i) + dt * 0.03;
      if (y > TANK.surfaceY) y = TANK.sandY + 0.2;
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
    if (points.current) points.current.rotation.y += dt * 0.01;
  });
  if (!sprite) return null;
  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial
        map={sprite}
        color="#f4fbff"
        size={0.035}
        transparent
        opacity={0.55}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function LookRig({
  sim,
  armed,
  calibrateNonce,
  calm,
}: {
  sim: Sim;
  armed: boolean;
  calibrateNonce: number;
  calm: boolean;
}) {
  const { camera, gl } = useThree();
  const qBase = useRef<THREE.Quaternion | null>(null);
  const qDevice = useRef(new THREE.Quaternion());
  const qDelta = useRef(new THREE.Quaternion());
  const qDrag = useRef(new THREE.Quaternion());
  const qTarget = useRef(new THREE.Quaternion());
  const yaw = useRef(0);
  const pitch = useRef(-0.16);
  const dragging = useRef({ on: false, x: 0, y: 0, moved: false });
  const needsCalibrate = useRef(true);

  useEffect(() => {
    needsCalibrate.current = true;
    qBase.current = null;
  }, [calibrateNonce, armed]);

  useEffect(() => {
    if (!armed) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      const alpha = event.alpha ?? 0;
      const orient = screenAngle();
      setObjectQuaternion(
        qDevice.current,
        THREE.MathUtils.degToRad(alpha),
        THREE.MathUtils.degToRad(event.beta),
        THREE.MathUtils.degToRad(event.gamma),
        orient,
      );
      if (!qBase.current || needsCalibrate.current) {
        qBase.current = qDevice.current.clone();
        needsCalibrate.current = false;
      }
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [armed]);

  useEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      dragging.current = { on: true, x: event.clientX, y: event.clientY, moved: false };
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current.on) return;
      const dx = event.clientX - dragging.current.x;
      const dy = event.clientY - dragging.current.y;
      if (dx * dx + dy * dy > 36) dragging.current.moved = true;
      yaw.current -= dx * 0.005;
      pitch.current -= dy * 0.004;
      yaw.current = THREE.MathUtils.clamp(yaw.current, -1.5, 1.5);
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.05, 1.15);
      dragging.current.x = event.clientX;
      dragging.current.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!dragging.current.on) return;
      const moved = dragging.current.moved;
      dragging.current.on = false;
      if (!moved) feedAt(event.clientX, event.clientY);
    };
    const onKey = (event: KeyboardEvent) => {
      const step = 0.06;
      if (event.key === "ArrowLeft") yaw.current += step;
      if (event.key === "ArrowRight") yaw.current -= step;
      if (event.key === "ArrowUp") pitch.current += step;
      if (event.key === "ArrowDown") pitch.current -= step;
      yaw.current = THREE.MathUtils.clamp(yaw.current, -1.5, 1.5);
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.05, 1.15);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    window.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
    };
  }, [camera, gl, sim]);

  useFrame((_, dt) => {
    const step = Math.min(0.033, calm ? dt * 0.45 : dt);
    updateSim(sim, step, camera.position);
    qDrag.current.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
    if (qBase.current) {
      qDelta.current.copy(qBase.current).invert().multiply(qDevice.current);
      qTarget.current.copy(qDelta.current).multiply(qDrag.current);
    } else {
      const idle = dragging.current.on ? 0 : Math.sin(sim.time * 0.18) * 0.03;
      qTarget.current.setFromEuler(new THREE.Euler(pitch.current + idle * 0.4, yaw.current + idle, 0, "YXZ"));
    }
    const k = 1 - Math.exp(-8 * dt);
    camera.quaternion.slerp(qTarget.current, k);
  });

  function feedAt(clientX: number, clientY: number) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TANK.surfaceY);
    if (raycaster.ray.direction.y > 0.2 && raycaster.ray.intersectPlane(surface, hit)) {
      dropFood(sim, hit.x, hit.z);
      return;
    }
    raycaster.ray.at(4.5, hit);
    dropFood(sim, hit.x, hit.z, hit.y);
  }

  return null;
}

function setObjectQuaternion(
  quaternion: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  orient: number,
) {
  deviceEuler.set(beta, alpha, -gamma, "YXZ");
  quaternion.setFromEuler(deviceEuler);
  quaternion.multiply(q1);
  quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
}

function screenAngle() {
  const angle =
    screen.orientation?.angle ??
    (window as unknown as { orientation?: number }).orientation ??
    0;
  return (angle * Math.PI) / 180;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildReefField() {
  const rand = mulberry32(11);
  const rockColors = ["#5c6b73", "#46555d", "#6a787f", "#3e4c54", "#5a5048", "#6e6258"];
  const kelpColors = ["#1f8a62", "#176b4c", "#21815d", "#24966c", "#146b48", "#1b7a55"];
  const tints = ["#d7f6fb", "#ffe0ea", "#e7f0ff", "#f3fff6"];
  const landmarks = [
    { x: -1.2, z: -6, radius: 0.9, seed: 11.1, color: "#5c6b73" },
    { x: 2.4, z: -9, radius: 1.3, seed: 12.4, color: "#46555d" },
    { x: -3.5, z: -14, radius: 1.6, seed: 13.2, color: "#6a787f" },
    { x: 1.1, z: -20, radius: 1.8, seed: 14.6, color: "#5a5048" },
  ];
  const rocks = landmarks.map((rock) => ({
    position: [rock.x, TANK.sandY + rock.radius * 0.32, rock.z] as [number, number, number],
    radius: rock.radius,
    seed: rock.seed,
    color: rock.color,
  }));
  for (let i = 0; i < 16; i += 1) {
    const x = (rand() - 0.5) * TANK.halfX * 1.72;
    const z = TANK.backZ + 1.5 + rand() * (TANK.frontZ - TANK.backZ - 4);
    if (z > -2.2 && Math.abs(x) < 3.2) continue;
    const radius = 0.4 + rand() * 1.35;
    rocks.push({
      position: [x, TANK.sandY + radius * 0.28, z],
      radius,
      seed: 30 + i * 1.37,
      color: rockColors[i % rockColors.length] ?? "#5c6b73",
    });
  }
  const kelp: { position: [number, number, number]; height: number; color: string; phase: number; width: number }[] = [];
  for (let i = 0; i < 18; i += 1) {
    const x = (rand() - 0.5) * TANK.halfX * 1.65;
    const z = TANK.backZ + 1.2 + rand() * (TANK.frontZ - TANK.backZ - 3.5);
    if (z > -1.6 && Math.abs(x) < 2.8) continue;
    kelp.push({
      position: [x, TANK.sandY, z],
      height: 1.3 + rand() * 4.2,
      color: kelpColors[i % kelpColors.length] ?? "#1f8a62",
      phase: 10 + i * 0.73,
      width: 0.16 + rand() * 0.22,
    });
  }
  const tubes: { position: [number, number, number]; color: string; scale: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    tubes.push({
      position: [(rand() - 0.5) * TANK.halfX * 1.4, TANK.sandY, -3 - rand() * 18],
      color: i % 2 ? "#e48ab8" : "#d46aa4",
      scale: 0.9 + rand() * 1.4,
    });
  }
  const fans: { position: [number, number, number]; scale: number }[] = [];
  for (let i = 0; i < 4; i += 1) {
    fans.push({
      position: [(rand() - 0.5) * 24, TANK.sandY, -4 - rand() * 14],
      scale: 1.3 + rand() * 0.8,
    });
  }
  const jellies: { position: [number, number, number]; radius: number; phase: number; tint: string }[] = [];
  for (let i = 0; i < 5; i += 1) {
    const high = rand() > 0.55;
    jellies.push({
      position: [
        (rand() - 0.5) * 22,
        TANK.sandY + (high ? 6 + rand() * 10 : 2 + rand() * 2.2),
        -2 - rand() * 16,
      ],
      radius: 0.16 + rand() * (high ? 0.45 : 0.18),
      phase: 20 + i,
      tint: tints[i % tints.length] ?? "#d7f6fb",
    });
  }
  return { rocks, kelp, tubes, fans, jellies };
}

function makeSandTexture(repeatX = 4, repeatY = 3) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw sand");
  ctx.fillStyle = "#e6d2a4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i += 1) {
    const shade = 180 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${shade}, ${shade - 30}, ${shade - 70}, 0.45)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
