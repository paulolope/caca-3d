// ============================================================
// WILDLIFE — bandos + rotina nas zonas fixas.
// Recebe os animais já criados (animals.js) e decide para onde cada
// um vai: comida -> água -> descanso, sempre em grupo quando a espécie
// é gregária, e sempre em bando quando algo assusta um deles.
// Não importa three: é lógica pura (testável em Node).
// ============================================================
import { herdSizeFor, nextNeed, pickZoneFrom, randomPointInZone, socialBehaviorOf } from './zones.js';

const positionOf = (animal) => animal?.group?.position ?? { x: 0, z: 0 };
const isAlive = (animal) => !!animal && !animal.dead;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const speciesKeyOf = (animal) => String(animal?.name ?? 'animal').toLowerCase().replace(/\s+/g, '-');
const spreadOf = (list) => {
    let x = 0; let z = 0; let n = 0;
    for (const animal of list) {
        if (!isAlive(animal)) continue;
        const p = positionOf(animal); x += p.x; z += p.z; n += 1;
    }
    return n ? { x: x / n, z: z / n } : null;
};

export function createWildlife({ zones, rand = Math.random, herdRadius = 520 } = {}) {
    const herds = [];
    const animals = new Set();
    let seq = 0;

    const listFor = (need) => (zones ? zones[need] : null) ?? [];
    const herdOf = (animal) => herds.find((herd) => herd.id === animal?.herd) ?? null;

    // Zona certa para a necessidade, evitando perto de uma ameaça quando pedido.
    function pickZoneFor(need, at, candidates = 3, avoid = null) {
        let list = listFor(need);
        if (avoid) {
            const safe = list.filter((zone) => distance(zone, avoid) > (avoid.radius ?? 260));
            if (safe.length) list = safe;
        }
        return pickZoneFrom(list, at.x, at.z, candidates, rand);
    }

    function assign(animal, need, zone, cycle = 0) {
        if (!animal || animal.dead || !zone || typeof animal.setNeedTarget !== 'function') return null;
        animal.routineNeed = need;
        animal.done = false;
        animal.cycle = cycle;
        animal.setNeedTarget(zone, need, randomPointInZone(zone, rand));
        return animal;
    }

    function herdCenter(herd) {
        return spreadOf(herd.members) ?? { x: herd.x, z: herd.z };
    }

    // Bando da mesma espécie, perto, com vaga. Senão cria um novo.
    function findHerd(animal, at) {
        const key = speciesKeyOf(animal);
        for (const herd of herds) {
            if (herd.key !== key) continue;
            if (herd.members.filter(isAlive).length >= herd.size) continue;
            if (distance(herdCenter(herd), at) <= herdRadius) return herd;
        }
        return null;
    }

    function createHerd(animal, at) {
        const need = ['food', 'water', 'rest'][Math.floor(rand() * 3)];
        const herd = {
            id: `herd-${seq += 1}`,
            key: speciesKeyOf(animal),
            name: animal?.name ?? 'Bando',
            size: herdSizeFor(rand),
            members: [],
            need,
            zone: pickZoneFor(need, at, 3),
            cycle: 0,
            alarm: 0,
            x: at.x,
            z: at.z,
        };
        herds.push(herd);
        return herd;
    }

    function adopt(animal) {
        if (!animal || animal._wildlifeAdopted || animal.dead) return null;
        animal._wildlifeAdopted = true;
        animal.onActivityEnd = advance;
        animal.social = socialBehaviorOf(animal.name);
        animals.add(animal);
        const at = positionOf(animal);
        if (animal.social === 'herd') {
            const herd = findHerd(animal, at) ?? createHerd(animal, at);
            herd.members.push(animal);
            animal.herd = herd.id;
            animal.followSpacing = 14 + rand() * 16;
            assign(animal, herd.need, herd.zone ?? pickZoneFor(herd.need, at), herd.cycle);
        } else {
            animal.herd = null;
            animal.follow = null;
            const need = ['food', 'water', 'rest'][Math.floor(rand() * 3)];
            assign(animal, need, pickZoneFor(need, at, 4));
        }
        return animal;
    }

    function release(animal) {
        if (!animal) return;
        animals.delete(animal);
        const herd = herdOf(animal);
        if (herd) {
            herd.members = herd.members.filter((member) => member !== animal);
            if (!herd.members.length) herds.splice(herds.indexOf(herd), 1);
        }
        animal.herd = null;
        animal.onActivityEnd = null;
        animal._wildlifeAdopted = false;
    }

    // Alarme do bando inteiro (tiro / animal assustado): todos correm juntos.
    function alarmHerd(herd, x, z, { panic = true } = {}) {
        if (!herd) return;
        herd.alarm = 18;
        for (const member of herd.members) {
            if (!isAlive(member) || typeof member.alertTo !== 'function') continue;
            if (member.state === 'FLEE' || member.state === 'TURN' || member.state === 'ALERT') continue;
            member.alertTo(x, z, { panic });
        }
    }

    // Depois do susto: o grupo larga tudo e vai para uma zona longe do perigo.
    function relocate(animal, threat) {
        const herd = herdOf(animal);
        const need = animal.routineNeed ?? nextNeed('food');
        const at = herd ? herdCenter(herd) : positionOf(animal);
        const zone = pickZoneFor(need, at, 4, { x: threat?.x ?? at.x, z: threat?.z ?? at.z, radius: 320 });
        if (!zone) return null;
        if (!herd) return assign(animal, need, zone, (animal.cycle ?? 0) + 1);
        herd.need = need;
        herd.zone = zone;
        herd.cycle += 1;
        for (const member of herd.members) assign(member, need, zone, herd.cycle);
        return zone;
    }

    // Chamado por animals.js quando termina de comer / beber / descansar.
    function advance(animal, finishedNeed) {
        if (!animal || animal.dead) return;
        const herd = herdOf(animal);
        if (!herd) {
            const need = nextNeed(finishedNeed ?? animal.routineNeed);
            assign(animal, need, pickZoneFor(need, positionOf(animal), 4));
            return;
        }
        animal.done = true;
        // O bando já partiu: só segue atrás.
        if (animal.cycle !== herd.cycle) { assign(animal, herd.need, herd.zone, herd.cycle); return; }
        herd.members = herd.members.filter(isAlive);
        const finished = herd.members.filter((member) => member.done);
        const threshold = Math.max(1, Math.ceil(herd.members.length * 0.8));
        if (finished.length < threshold) return; // espera os últimos no pasto
        herd.cycle += 1;
        herd.need = nextNeed(herd.need ?? finishedNeed);
        herd.zone = pickZoneFor(herd.need, herdCenter(herd), 3);
        for (const member of finished) assign(member, herd.need, herd.zone, herd.cycle);
    }

    function update(dt, player = null, { noise = null } = {}) {
        const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
        for (const animal of animals) {
            if (!animal || animal.dead) continue;
            const previous = animal.prevState ?? animal.state;
            if (!['FLEE', 'TURN'].includes(previous) && ['FLEE', 'TURN'].includes(animal.state)) {
                // Um assustado assusta o bando inteiro.
                alarmHerd(herdOf(animal), animal.threatX ?? positionOf(animal).x, animal.threatZ ?? positionOf(animal).z, { panic: true });
            }
            if (['FLEE', 'TURN'].includes(previous) && !['FLEE', 'TURN'].includes(animal.state)) {
                relocate(animal, { x: animal.threatX ?? player?.x ?? 0, z: animal.threatZ ?? player?.z ?? 0 });
            }
            animal.prevState = animal.state;
        }
        for (const herd of herds) {
            herd.members = herd.members.filter((member) => member._wildlifeAdopted && !member.dead);
            herd.alarm = Math.max(0, herd.alarm - safeDt);
            if (herd.members.length < 2) continue;
            const center = herdCenter(herd);
            herd.x = center.x; herd.z = center.z;
            for (const member of herd.members) {
                if (!member.target) { member.follow = null; continue; }
                const moving = member.state === 'MOVE' || member.state === 'WALK';
                member.follow = moving && distance(positionOf(member), center) > member.followSpacing ? center : null;
            }
        }
        // Ruído do passo do jogador: quem está por perto fica alerta (sem correr).
        if (noise) {
            for (const animal of animals) {
                if (!isAlive(animal) || typeof animal.alertTo !== 'function') continue;
                if (distance(positionOf(animal), noise) <= (noise.radius ?? 40)) animal.alertTo(noise.x, noise.z, { panic: false });
            }
        }
        return herds;
    }

    // Disparo: espanta num raio (substitui o laço antigo dentro de shoot()).
    function startle(x, z, radius = 120) {
        for (const animal of animals) {
            if (!isAlive(animal)) continue;
            if (distance(positionOf(animal), { x, z }) > radius) continue;
            if (typeof animal.hearShot === 'function') animal.hearShot(x, z);
        }
    }

    function callAnimals(x, z, { radius = 900, species = 'deer' } = {}) {
        const aliases = {
            deer: /deer|cervo|veado|antelope|elk|moose/,
            boar: /boar|javali|porco|pig/,
            bird: /bird|ave|pato|ganso|perdiz|faisao|falcao|aguia/,
        };
        const matcher = aliases[species] ?? aliases.deer;
        let called = 0;
        for (const animal of animals) {
            if (!isAlive(animal) || distance(positionOf(animal), { x, z }) > radius || !matcher.test(String(animal.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) continue;
            if (animal.respondToCall?.(x, z)) called += 1;
        }
        return called;
    }

    function stats() {
        const out = { herds: herds.length, animals: animals.size, moving: 0, eating: 0, drinking: 0, resting: 0, alerted: 0 };
        for (const animal of animals) {
            if (!isAlive(animal)) continue;
            if (animal.state === 'MOVE' || animal.state === 'WALK') out.moving += 1;
            else if (animal.state === 'GRAZE') out.eating += 1;
            else if (animal.state === 'DRINK') out.drinking += 1;
            else if (animal.state === 'REST') out.resting += 1;
            else if (animal.state === 'ALERT' || animal.state === 'FLEE' || animal.state === 'TURN') out.alerted += 1;
        }
        return out;
    }

    return { adopt, release, update, advance, relocate, alarmHerd, startle, callAnimals, herds, animals, stats };
}
