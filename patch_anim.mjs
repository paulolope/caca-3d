import fs from 'node:fs';
const p = 'c:/xampp/htdocs/CAÇA-3D/src/world/animals.js';
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('    animal.playState');
const end = t.indexOf('    // Pose de');
if (start < 0 || end < 0) { console.error('BLOCO NAO ACHADO'); process.exit(1); }
const block = `    animal.playState = (state) => {
        if (animal.dead) state = 'DEAD';
        const lower = (name) => String(name ?? '').toLowerCase();
        const aliases = { IDLE: ['idle', 'rest', 'graze', 'eat'], WALK: ['walk', 'gait', 'move'], RUN: ['run', 'gallop', 'trot', 'flee'], FLEE: ['run', 'gallop', 'trot', 'flee', 'walk'], ALERT: ['alert', 'look', 'idle'], DEAD: ['death', 'dead', 'die', 'fall', 'shot', 'hit'] };
        if (!animal.actions?.size) { animal.currentAction = null; return; }
        const wants = aliases[state] ?? [String(state).toLowerCase()];
        let entry = [...animal.actions.entries()].find(([name]) => wants.some((alias) => lower(name).includes(alias)));
        const moveRe = /(walk|run|gallop|trot|move|gait|flee)/;
        if (!entry && (state === 'WALK' || state === 'FLEE' || state === 'RUN')) entry = [...animal.actions.entries()].find(([name]) => moveRe.test(lower(name)));
        // Sem clip de morte no GLB: nao usa [0] — a queda de lado e feita via applyDeathPose().
        if (!entry) return;
        if (entry[1] === animal.currentAction) return;
        const previous = animal.currentAction;
        if (previous && previous !== entry[1]) previous.fadeOut(0.25);
        entry[1].reset();
        entry[1].setLoop(state === 'DEAD' ? THREE.LoopOnce : THREE.LoopRepeat, state === 'DEAD' ? 1 : Infinity);
        entry[1].clampWhenFinished = state === 'DEAD';
        entry[1].fadeIn(0.25).play();
        animal.currentAction = entry[1];
    };
`;
t = t.slice(0, start) + block + t.slice(end);
fs.writeFileSync(p, t);
console.log('PATCH_OK');
