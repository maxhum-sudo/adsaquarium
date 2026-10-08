import * as THREE from "three";
import { FISH_CAP, SPECIES, STOCK, TANK, type SpeciesId, type SwimMode } from "./species";

export type FishAgent = {
  id: number;
  species: SpeciesId;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
  wanderT: number;
  wish: THREE.Vector3;
  gulp: number;
  dartT: number;
  goal: number | null;
};

export type Pellet = {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  alive: boolean;
};

export type Sim = {
  fish: FishAgent[];
  food: Pellet[];
  time: number;
  nextId: number;
  anemone: THREE.Vector3;
};

const CHOICES = Object.keys(SPECIES) as SpeciesId[];
const _to = new THREE.Vector3();
const _away = new THREE.Vector3();

export function createSim(): Sim {
  const sim: Sim = {
    fish: [],
    food: [],
    time: 0,
    nextId: 1,
    anemone: new THREE.Vector3(-1.15, TANK.sandY + 0.08, -0.25),
  };
  for (const item of STOCK) {
    for (let i = 0; i < item.count; i += 1) spawn(sim, item.species, true);
  }
  return sim;
}

export function dropFood(sim: Sim, x: number, z: number, y?: number) {
  const startY = THREE.MathUtils.clamp(y ?? TANK.surfaceY - 0.05, TANK.sandY + 0.25, TANK.surfaceY - 0.02);
  const count = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    sim.food.push({
      id: sim.nextId++,
      pos: new THREE.Vector3(
        THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 0.28, -TANK.halfX + 0.4, TANK.halfX - 0.4),
        startY - Math.random() * 0.12,
        THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 0.28, TANK.backZ + 0.4, TANK.frontZ - 0.15),
      ),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.12, -0.28 - Math.random() * 0.16, (Math.random() - 0.5) * 0.12),
      life: 24,
      alive: true,
    });
  }
  if (sim.food.length > 36) sim.food.splice(0, sim.food.length - 36);
}

export function addFish(sim: Sim, species?: SpeciesId): SpeciesId | null {
  if (sim.fish.length >= FISH_CAP) return null;
  const id = species ?? CHOICES[Math.floor(Math.random() * CHOICES.length)]!;
  spawn(sim, id, false);
  return id;
}

export function roster(sim: Sim) {
  const counts = new Map<SpeciesId, number>();
  for (const fish of sim.fish) counts.set(fish.species, (counts.get(fish.species) ?? 0) + 1);
  return (Object.keys(SPECIES) as SpeciesId[])
    .filter((id) => (counts.get(id) ?? 0) > 0)
    .map((id) => ({
      id,
      count: counts.get(id) ?? 0,
      label: SPECIES[id].label,
      color: SPECIES[id].color,
    }));
}

export function updateSim(sim: Sim, dt: number, camera: THREE.Vector3) {
  sim.time += dt;
  for (const pellet of sim.food) {
    pellet.life -= dt;
    pellet.vel.y -= 0.9 * dt;
    pellet.vel.x *= Math.max(0, 1 - dt * 0.6);
    pellet.vel.z *= Math.max(0, 1 - dt * 0.6);
    pellet.pos.addScaledVector(pellet.vel, dt);
    const floor = TANK.sandY + 0.04;
    if (pellet.pos.y < floor) {
      pellet.pos.y = floor;
      pellet.vel.y = 0;
      pellet.vel.x = 0;
      pellet.vel.z = 0;
    }
  }

  assignGoals(sim);

  const school = computeSchool(sim);
  for (const fish of sim.fish) {
    const info = SPECIES[fish.species];
    const pellet = fish.goal == null ? undefined : sim.food.find((item) => item.id === fish.goal && item.alive);
    if (pellet) {
      approach(fish, pellet.pos, info.speed * 1.45, dt, 3.1);
      if (fish.pos.distanceTo(pellet.pos) < Math.max(0.16, info.length * 0.55)) {
        pellet.alive = false;
        fish.goal = null;
        fish.gulp = 1;
      }
    } else if (info.mode === "sand") {
      updateGoby(sim, fish, dt);
    } else if (info.mode === "anemone") {
      const slot = fish.id % 4;
      const orbit = 0.28 + slot * 0.12;
      const ang = sim.time * (0.45 + slot * 0.08) + fish.phase;
      _to.set(
        sim.anemone.x + Math.cos(ang) * orbit,
        sim.anemone.y + 0.16 + (slot % 3) * 0.06 + Math.sin(ang * 1.4) * 0.04,
        sim.anemone.z + Math.sin(ang) * orbit * 0.75,
      );
      approach(fish, _to, info.speed, dt, 1.6);
    } else if (info.mode === "school" && school) {
      steerSchool(sim, fish, dt, school);
    } else {
      wander(sim, fish, dt, info.mode);
    }

    separate(sim, fish, dt);
    avoidCamera(fish, camera, dt);
    contain(fish, dt, info.mode === "sand");

    const max = pellet ? info.speed * 1.55 : info.speed;
    const sp = fish.vel.length();
    if (sp > max) fish.vel.multiplyScalar(max / sp);

    fish.pos.addScaledVector(fish.vel, dt);
    hardClamp(fish, info.mode === "sand");
    fish.gulp = Math.max(0, fish.gulp - dt * 1.6);
    fish.phase += dt * (2.2 + Math.min(3, sp * 4));
  }

  sim.food = sim.food.filter((pellet) => pellet.alive && pellet.life > 0);
}

function spawn(sim: Sim, species: SpeciesId, stocked: boolean) {
  const info = SPECIES[species];
  const pos = new THREE.Vector3();
  if (stocked && info.mode === "anemone") {
    pos.set(sim.anemone.x + (Math.random() - 0.5) * 0.3, sim.anemone.y + 0.2, sim.anemone.z + (Math.random() - 0.5) * 0.2);
  } else if (info.mode === "sand") {
    pos.set((Math.random() - 0.5) * 6, TANK.sandY + 0.08, -0.4 + (Math.random() - 0.5) * 2.4);
  } else if (info.mode === "school") {
    pos.set((Math.random() - 0.5) * 1.6, TANK.sandY + 1.15 + (Math.random() - 0.5) * 0.3, -1.4 + (Math.random() - 0.5) * 0.8);
  } else if (info.mode === "low") {
    pos.set(0.9 + (Math.random() - 0.5) * 0.6, TANK.sandY + 0.35, -0.7);
  } else {
    pos.set((Math.random() - 0.5) * 4.5, TANK.sandY + 0.7 + Math.random() * 1.4, -0.6 - Math.random() * 2.2);
  }
  const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.15, Math.random() - 0.5).normalize();
  sim.fish.push({
    id: sim.nextId++,
    species,
    pos,
    vel: dir.multiplyScalar(info.speed * 0.65),
    phase: Math.random() * Math.PI * 2,
    wanderT: Math.random() * 2,
    wish: pos.clone(),
    gulp: 0,
    dartT: 0,
    goal: null,
  });
}

function assignGoals(sim: Sim) {
  for (const fish of sim.fish) fish.goal = null;
  const pairs: { d: number; fish: FishAgent; pellet: Pellet }[] = [];
  for (const pellet of sim.food) {
    if (!pellet.alive) continue;
    for (const fish of sim.fish) {
      if (SPECIES[fish.species].mode === "sand" && pellet.pos.y > TANK.sandY + 2.2) continue;
      const d = fish.pos.distanceTo(pellet.pos);
      if (d < 8) pairs.push({ d, fish, pellet });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const usedFish = new Set<number>();
  const usedFood = new Set<number>();
  for (const pair of pairs) {
    if (usedFish.has(pair.fish.id) || usedFood.has(pair.pellet.id)) continue;
    pair.fish.goal = pair.pellet.id;
    usedFish.add(pair.fish.id);
    usedFood.add(pair.pellet.id);
  }
}

function computeSchool(sim: Sim) {
  const mates = sim.fish.filter((fish) => fish.species === "chromis");
  if (mates.length === 0) return null;
  const center = new THREE.Vector3();
  const vel = new THREE.Vector3();
  for (const mate of mates) {
    center.add(mate.pos);
    vel.add(mate.vel);
  }
  center.multiplyScalar(1 / mates.length);
  vel.multiplyScalar(1 / mates.length);
  return { center, vel, mates };
}

function steerSchool(
  sim: Sim,
  fish: FishAgent,
  dt: number,
  school: { center: THREE.Vector3; vel: THREE.Vector3; mates: FishAgent[] },
) {
  _to.copy(school.center);
  for (const other of school.mates) {
    if (other.id === fish.id) continue;
    const dist = fish.pos.distanceTo(other.pos);
    if (dist > 0 && dist < 0.22) {
      _away.copy(fish.pos).sub(other.pos).multiplyScalar(0.18 / dist);
      _to.add(_away);
    }
  }
  _to.x = THREE.MathUtils.lerp(_to.x, Math.sin(sim.time * 0.15) * 2.4, 0.4);
  _to.z = THREE.MathUtils.lerp(_to.z, -1.8 + Math.cos(sim.time * 0.11) * 1.2, 0.4);
  _to.y = TANK.sandY + 1.2 + Math.sin(sim.time * 0.22) * 0.28;
  _to.x += Math.sin(sim.time * 0.35 + fish.phase) * 0.2;
  approach(fish, _to, SPECIES.chromis.speed, dt, 1.7);
  fish.vel.lerp(school.vel, Math.min(1, dt * 0.8));
}

function wander(sim: Sim, fish: FishAgent, dt: number, mode: SwimMode) {
  fish.wanderT -= dt;
  if (fish.wanderT <= 0 || fish.pos.distanceTo(fish.wish) < 0.35) {
    const home = mode === "low" || Math.random() < 0.7;
    if (home) {
      fish.wish.set(
        (Math.random() - 0.5) * 14,
        mode === "low" ? TANK.sandY + 0.3 + Math.random() * 1.1 : TANK.sandY + 0.45 + Math.random() * 3.4,
        -0.3 - Math.random() * 7.5,
      );
    } else {
      const spanZ = TANK.frontZ - TANK.backZ;
      fish.wish.set(
        (Math.random() - 0.5) * TANK.halfX * 1.7,
        TANK.sandY + 0.6 + Math.random() * (TANK.surfaceY - TANK.sandY - 1.4),
        TANK.frontZ - 0.5 - Math.random() * (spanZ - 1.2),
      );
    }
    fish.wanderT = 3 + Math.random() * 5;
  }
  approach(fish, fish.wish, SPECIES[fish.species].speed, dt, 0.9);
}

function updateGoby(sim: Sim, fish: FishAgent, dt: number) {
  const ground = TANK.sandY + 0.07;
  fish.pos.y += (ground - fish.pos.y) * Math.min(1, 5 * dt);
  fish.vel.y = 0;
  if (fish.dartT > 0) {
    fish.dartT -= dt;
    return;
  }
  fish.vel.x *= Math.max(0, 1 - 2.2 * dt);
  fish.vel.z *= Math.max(0, 1 - 2.2 * dt);
  fish.wanderT -= dt;
  if (fish.wanderT <= 0) {
    const ang = Math.random() * Math.PI * 2;
    fish.vel.x = Math.cos(ang) * SPECIES.goby.speed;
    fish.vel.z = Math.sin(ang) * SPECIES.goby.speed;
    fish.dartT = 0.35 + Math.random() * 0.45;
    fish.wanderT = 1.3 + Math.random() * 2.6;
  }
  if (fish.pos.z < -7) fish.vel.z += 0.55 * dt;
  if (fish.pos.z > TANK.frontZ - 0.2) fish.vel.z -= 0.55 * dt;
  if (fish.pos.x < -7) fish.vel.x += 0.45 * dt;
  if (fish.pos.x > 7) fish.vel.x -= 0.45 * dt;
  void sim;
}

function separate(sim: Sim, fish: FishAgent, dt: number) {
  if (fish.species === "chromis") return;
  const reach = SPECIES[fish.species].length * 0.85;
  for (const other of sim.fish) {
    if (other.id === fish.id) continue;
    const dist = fish.pos.distanceTo(other.pos);
    if (dist > 0 && dist < reach) {
      _away.copy(fish.pos).sub(other.pos).multiplyScalar((0.25 * dt) / dist);
      fish.vel.add(_away);
    }
  }
}

function avoidCamera(fish: FishAgent, camera: THREE.Vector3, dt: number) {
  const dist = fish.pos.distanceTo(camera);
  if (dist < 1.05 && dist > 0.001) {
    _away.copy(fish.pos).sub(camera).multiplyScalar((1.4 * dt) / dist);
    fish.vel.add(_away);
  }
}

function contain(fish: FishAgent, dt: number, sand: boolean) {
  const pad = 0.22;
  if (fish.pos.x < -TANK.halfX + pad) fish.vel.x += 0.8 * dt;
  if (fish.pos.x > TANK.halfX - pad) fish.vel.x -= 0.8 * dt;
  if (fish.pos.z < TANK.backZ + pad) fish.vel.z += 0.8 * dt;
  if (fish.pos.z > TANK.frontZ - 0.08) fish.vel.z -= 0.8 * dt;
  if (!sand) {
    if (fish.pos.y < TANK.sandY + 0.16) fish.vel.y += 0.7 * dt;
    if (fish.pos.y > TANK.surfaceY - 0.22) fish.vel.y -= 0.7 * dt;
  }
}

function hardClamp(fish: FishAgent, sand: boolean) {
  fish.pos.x = THREE.MathUtils.clamp(fish.pos.x, -TANK.halfX + 0.08, TANK.halfX - 0.08);
  fish.pos.z = THREE.MathUtils.clamp(fish.pos.z, TANK.backZ + 0.1, TANK.frontZ);
  if (sand) {
    fish.pos.y = TANK.sandY + 0.07;
    return;
  }
  fish.pos.y = THREE.MathUtils.clamp(fish.pos.y, TANK.sandY + 0.1, TANK.surfaceY - 0.16);
}

function approach(fish: FishAgent, target: THREE.Vector3, speed: number, dt: number, turn: number) {
  _to.copy(target).sub(fish.pos);
  const dist = _to.length() || 1;
  const ease = dist < 0.22 ? dist / 0.22 : 1;
  _to.multiplyScalar((speed * ease) / dist);
  fish.vel.lerp(_to, Math.min(1, turn * dt));
}
