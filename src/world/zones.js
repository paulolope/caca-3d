// ============================================================
// ZONAS FIXAS DO MAPA — sistema FECHADO e AUTOMÁTICO.
// Não há admin/config: as zonas nascem do próprio relevo/rio.
// - Comida: clareiras de pasto/arbusto espalhadas pela reserva.
// - Água: lagos distribuídos por toda a reserva.
// - Descanso: bosques altos/sombreados perto das árvores.
// Os animais circulam COMIDA -> ÁGUA -> DESCANSO sozinhos.
// ============================================================

export const ZONE_COLORS = { food: 0x7dc95a, water: 0x3fa7d6, rest: 0xb98a4a };

function hash01(n) {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
}

// Posições fixas (determinísticas) — espalhadas pela reserva 8x8km.
// Escolhidas longe do spawn do jogador (0,18) e perto de água/vegetação.
const FOOD_SPOTS = [
    { x: -420, z: -260, r: 55, food: 'Capim-andropogon' },
    { x: 380, z: -480, r: 60, food: 'Arbusto-de-frutos' },
    { x: -950, z: 320, r: 65, food: 'Capim-jaraguá' },
    { x: 760, z: 180, r: 55, food: 'Moita-de-amora' },
    { x: -200, z: 900, r: 70, food: 'Pastagem-alta' },
    { x: 1250, z: -700, r: 60, food: 'Capim-colonião' },
    { x: -1400, z: -900, r: 70, food: 'Broto-de-cerrado' },
    { x: 300, z: 1500, r: 55, food: 'Ervas-do-brejo' },
    { x: -300, z: -1400, r: 60, food: 'Gramínea-nativa' },
    { x: 1900, z: 900, r: 65, food: 'Frutos-de-arbusto' },
    { x: -3300, z: -3000, r: 75, food: 'Campo de altitude' },
    { x: -1400, z: -3300, r: 65, food: 'Capim-colonião' },
    { x: 500, z: -3400, r: 70, food: 'Gramínea nativa' },
    { x: 2500, z: -3200, r: 75, food: 'Arbusto de frutos' },
    { x: 3400, z: -1500, r: 65, food: 'Capim-andropogon' },
    { x: 3100, z: 300, r: 60, food: 'Moita de amora' },
    { x: 3300, z: 1900, r: 70, food: 'Pastagem alta' },
    { x: 2500, z: 3350, r: 75, food: 'Broto de cerrado' },
    { x: 1100, z: 3200, r: 65, food: 'Capim-jaraguá' },
    { x: -500, z: 3500, r: 65, food: 'Ervas do campo' },
    { x: -2100, z: 3200, r: 75, food: 'Arbusto de frutos' },
    { x: -3400, z: 1700, r: 70, food: 'Gramínea nativa' },
    { x: -3200, z: 100, r: 65, food: 'Capim-andropogon' },
    { x: -2800, z: -1800, r: 70, food: 'Pastagem alta' },
    { x: -1100, z: 2600, r: 65, food: 'Capim-colonião' },
    { x: 0, z: -2500, r: 60, food: 'Broto de cerrado' },
];

const REST_SPOTS = [
    { x: -560, z: -80, r: 60 },
    { x: 520, z: -260, r: 55 },
    { x: -1100, z: 520, r: 65 },
    { x: 900, z: 420, r: 60 },
    { x: -350, z: 1150, r: 70 },
    { x: 1500, z: -450, r: 60 },
    { x: -1600, z: -700, r: 65 },
    { x: 100, z: -1100, r: 55 },
    { x: -3300, z: -2600, r: 70 },
    { x: -2000, z: -3200, r: 65 },
    { x: 1000, z: -3300, r: 65 },
    { x: 3100, z: -2800, r: 70 },
    { x: 3400, z: -700, r: 60 },
    { x: 3000, z: 1400, r: 70 },
    { x: 2000, z: 3300, r: 70 },
    { x: 0, z: 3300, r: 65 },
    { x: -1500, z: 3300, r: 70 },
    { x: -3200, z: 2300, r: 70 },
    { x: -3500, z: 300, r: 65 },
    { x: 2600, z: 2500, r: 70 },
];

const LAKE_SPOTS = [
    { x: -690, z: -520, r: 130 },
    { x: 930, z: 740, r: 100 },
    { x: 2700, z: -1800, r: 260 },
    { x: -2900, z: -2600, r: 190 },
    { x: 3100, z: 2700, r: 180 },
    { x: -3000, z: 2200, r: 190 },
    { x: 1500, z: -3300, r: 160 },
];

export function buildFixedZones() {
    const withUse = (zone) => ({
        ...zone,
        // Raio em que o JOGADOR consegue aproveitar a zona (beber/descansar).
        useRadius: zone.kind === 'water'
            ? (zone.source === 'Lago' ? Math.round(zone.r * 0.85) : 42)
            : Math.round(zone.r * 0.7),
    });
    const food = FOOD_SPOTS.map((s, i) => withUse({ id: `food-${i}`, kind: 'food', ...s, animals: 'todos' }));
    const rest = [...REST_SPOTS, { x: -60, z: -120, r: 40 }].map((s, i) => withUse({ id: `rest-${i}`, kind: 'rest', ...s, shade: 'Bosque sombreado' }));
    const water = [
        ...LAKE_SPOTS.map((s, i) => withUse({ id: `water-lake-${i}`, kind: 'water', ...s, source: 'Lago' })),
    ];
    return { food, water, rest, all: [...food, ...water, ...rest] };
}

export const ZONE_LABELS = { food: 'COMIDA', water: 'ÁGUA', rest: 'DESCANSO' };

export function nearestZone(list, x, z) {
    let best = null; let bestD = Infinity;
    for (const zone of list) {
        const d = Math.hypot(zone.x - x, zone.z - z);
        if (d < bestD) { bestD = d; best = zone; }
    }
    return best ? { zone: best, dist: bestD } : null;
}

// Ponto aleatório dentro do raio da zona (p/ não alinhar o bando).
export function randomPointInZone(zone, rand = Math.random) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * (zone.r * 0.7);
    return { x: zone.x + Math.sin(angle) * dist, z: zone.z + Math.cos(angle) * dist };
}

// Espécies que andam em bando (nome contém um destes radicais).
const HERD_HINTS = ['veado', 'veada', 'cervo', 'javali', 'porco', 'capivara', 'anta', 'cateto', 'queixada', 'ema', 'paca', 'cutia'];
const SOLITARY_HINTS = ['onça', 'onca', 'puma', 'suçuarana', 'sucuarana', 'jaguar', 'lobo', 'tamanduá', 'tamandua'];

export function socialBehaviorOf(name = '') {
    const n = String(name).toLowerCase();
    if (SOLITARY_HINTS.some((h) => n.includes(h))) return 'solitary';
    if (HERD_HINTS.some((h) => n.includes(h))) return 'herd';
    // Padrão: maioria anda em bando pequeno (mais vida no mapa).
    return hash01(n.length * 31 + n.charCodeAt(0)) < 0.7 ? 'herd' : 'solitary';
}

export function herdSizeFor(rand = Math.random) {
    // 3 a 7 por bando, variando automaticamente.
    return 3 + Math.floor(rand() * 5);
}

// Próxima necessidade na rotina COMIDA -> ÁGUA -> DESCANSO -> COMIDA...
export function nextNeed(need) {
    if (need === 'food') return 'water';
    if (need === 'water') return 'rest';
    return 'food';
}

// Duração base (s) de cada atividade + variação.
export function activityDuration(kind, rand = Math.random) {
    const base = kind === 'food' ? 26 : kind === 'water' ? 14 : 30;
    return base * (0.7 + rand() * 0.6);
}

// Escolhe uma zona entre as mais próximas, com variação (bandos não lotam o mesmo ponto).
export function pickZoneFrom(list, x, z, candidates = 3, rand = Math.random) {
    if (!list?.length) return null;
    const sorted = list
        .map((zone) => ({ zone, dist: Math.hypot(zone.x - x, zone.z - z) }))
        .sort((a, b) => a.dist - b.dist);
    const pool = sorted.slice(0, Math.max(1, Math.min(candidates, sorted.length)));
    return pool[Math.floor(rand() * pool.length) % pool.length].zone;
}

// Zona que o JOGADOR pode usar agora (beber / descansar) a partir da posição dele.
export function nearestUsableZone(zones, x, z, kind = null) {
    const list = kind ? (zones[kind] ?? []) : (zones.all ?? []);
    let best = null;
    for (const zone of list) {
        if (kind === null && zone.kind === 'food') continue; // comida é do animal
        const dist = Math.hypot(zone.x - x, zone.z - z);
        if (dist <= (zone.useRadius ?? 40) && (!best || dist < best.dist)) best = { zone, dist };
    }
    return best;
}
