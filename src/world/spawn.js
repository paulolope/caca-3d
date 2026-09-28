// Lógica pura do sistema de spawn / respawn.
// Fica fora do game.js para ser testável em Node (sem THREE/DOM).
// Regra central: o mapa NUNCA pode ficar sem animais vivos.

export const MIN_ALIVE_ANIMALS = 12;
export const RESPAWN_DELAY_SECONDS = 8;
export const RESPAWN_MIN_DISTANCE = 80;
export const RESPAWN_MAX_DISTANCE = 350;
export const MAX_DEAD_AGE_SECONDS = 120;
export const GLOBAL_RESPAWN_THROTTLE = 2;
export const MAX_ANIMALS_TOTAL = 60;

export function aliveCount(animals = []) {
    let n = 0;
    for (const a of animals) if (a && !a.dead) n += 1;
    return n;
}

export function deadCount(animals = []) {
    let n = 0;
    for (const a of animals) if (a && a.dead) n += 1;
    return n;
}

export function desiredForSpawn(spawn) {
    const raw = Number(spawn?.count ?? 1);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(Math.floor(raw), 20));
}

export function aliveForSpawn(spawn) {
    return (spawn?._animals ?? []).filter((a) => a && !a.dead).length;
}

// Prefere um ponto da mesma espécie longe do abate e do jogador.
export function pickAlternateSpawnSite(spawns = [], { originId = null, animalId = null, fromX = 0, fromZ = 0, playerX = 0, playerZ = 0, rand = Math.random } = {}) {
    const sameSpecies = spawns.filter((spawn) => Number(spawn?.animal_id) === Number(animalId) && aliveForSpawn(spawn) < desiredForSpawn(spawn));
    const alternatives = sameSpecies.filter((spawn) => String(spawn.id) !== String(originId));
    const farFromDeath = alternatives.filter((spawn) => Math.hypot(Number(spawn.x) - fromX, Number(spawn.z) - fromZ) >= 650);
    // Respawn must move away from the carcass without selecting a distant map zone.
    const candidates = farFromDeath.length ? farFromDeath : alternatives.length ? alternatives : sameSpecies;
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        const playerDistance = Math.hypot(Number(a.x) - playerX, Number(a.z) - playerZ) - Math.hypot(Number(b.x) - playerX, Number(b.z) - playerZ);
        if (Math.abs(playerDistance) > 1) return playerDistance;
        return Math.hypot(Number(b.x) - fromX, Number(b.z) - fromZ) - Math.hypot(Number(a.x) - fromX, Number(a.z) - fromZ);
    });
    const varied = candidates.slice(0, Math.min(3, candidates.length));
    return varied[Math.min(varied.length - 1, Math.floor(rand() * varied.length))];
}

// Quantos animais faltam para este ponto de spawn ficar cheio.
export function missingForSpawn(spawn) {
    return Math.max(0, desiredForSpawn(spawn) - aliveForSpawn(spawn));
}

// Quantos animais faltam para o mapa atingir o mínimo global de vivos.
export function missingGlobal(animals = [], minAlive = MIN_ALIVE_ANIMALS) {
    return Math.max(0, minAlive - aliveCount(animals));
}

// Escolhe posição de respawn: tenta ficar longe do jogador para evitar pop-in
// visível (mínimo RESPAWN_MIN_DISTANCE), mas dentro do raio do spawn.
// `rand` injetável para testes (default Math.random).
export function pickRespawnPosition({ spawnX = 0, spawnZ = 0, radius = 120, playerX = 0, playerZ = 0, minDist = RESPAWN_MIN_DISTANCE, rand = Math.random } = {}) {
    const r = Math.max(10, Number(radius) || 120);
    let fallback = null;
    for (let i = 0; i < 10; i += 1) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * r;
        const x = spawnX + Math.sin(angle) * dist;
        const z = spawnZ + Math.cos(angle) * dist;
        if (!fallback) fallback = { x, z };
        const dPlayer = Math.hypot(x - playerX, z - playerZ);
        if (dPlayer >= minDist) return { x, z };
    }
    return fallback ?? { x: spawnX, z: spawnZ };
}

// Posição para reposição global (sem spawn por perto): anel ao redor do jogador.
export function pickGlobalRespawnPosition({ playerX = 0, playerZ = 0, minD = 120, maxD = 320, rand = Math.random } = {}) {
    const angle = rand() * Math.PI * 2;
    const dist = minD + rand() * Math.max(10, maxD - minD);
    return { x: playerX + Math.sin(angle) * dist, z: playerZ + Math.cos(angle) * dist };
}

// Fila de respawns vencidos até `now`.
export function dueRespawns(queue = [], now = 0) {
    return queue.filter((item) => Number(item?.dueAt ?? Infinity) <= now);
}

export function removeDueRespawns(queue = [], now = 0) {
    return queue.filter((item) => Number(item?.dueAt ?? Infinity) > now);
}
