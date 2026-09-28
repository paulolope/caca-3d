import * as THREE from 'three';

export function minimumDamageForThreeShotKill(health, configuredDamage = 0) {
    const maxHealth = Math.max(1, Number(health) || 100);
    return Math.max(Number(configuredDamage) || 0, Math.ceil(maxHealth / 3));
}
import { activityDuration } from './zones.js';

function normalizeClipName(value) {
    return String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function inferAnimationRoles(animations = []) {
    const rules = {
        idle: /(^| )(idle|stand|standing|rest|graze|eat)( |$)/,
        walk: /walk|walking|move|movement|locomotion|gait|trot/,
        run: /run|running|sprint|gallop/,
        flee: /flee|escape|runaway/,
        fly: /fly|flying|flight/,
        attack: /attack|bite|strike/,
        turn: /turn|pivot/,
    };
    const result = {};
    for (const [role, pattern] of Object.entries(rules)) {
        const clip = animations.find((entry) => pattern.test(normalizeClipName(entry.name)));
        if (clip) result[role] = clip.name;
    }
    return result;
}

export function inferModelFrontAxis(root) {
    if (!root) return null;
    root.updateMatrixWorld(true);
    const heads = [];
    const tails = [];
    root.traverse((object) => {
        const name = String(object.name ?? '').toLowerCase();
        const point = object.getWorldPosition(new THREE.Vector3());
        if (/(nose|snout|muzzle)/i.test(name)) heads.push({ point, score: 4 });
        else if (/(head|skull)/i.test(name)) heads.push({ point, score: 2 });
        if (/(tail|cauda)/i.test(name)) tails.push({ point, score: /tail\s*(1|base)|tail_root|cauda\s*(1|base)/i.test(name) ? 3 : 1 });
    });
    if (!heads.length || !tails.length) return null;
    heads.sort((a, b) => b.score - a.score);
    tails.sort((a, b) => b.score - a.score);
    const forward = heads[0].point.sub(tails[0].point);
    if (Math.hypot(forward.x, forward.z) < 0.001) return null;
    return Math.abs(forward.x) > Math.abs(forward.z) ? (forward.x >= 0 ? '+X' : '-X') : (forward.z >= 0 ? '+Z' : '-Z');
}

function getAnimationTimeScale(animal, state, action) {
    const cfg = animal.animationConfig ?? {};
    const role = state === 'FLEE' ? 'flee' : state === 'RUN' ? 'run' : (state === 'WALK' || state === 'MOVE' ? (animal.isBird ? 'fly' : 'walk') : '');
    if (!role) return Number(cfg.animationSpeed) || 1;
    const actualSpeed = role === 'flee' ? animal.fleeSpeed : role === 'run' ? animal.runSpeed : role === 'fly' ? Number(cfg.flightSpeed) || animal.runSpeed : animal.walkSpeed;
    const reference = role === 'walk' ? 1.35 : 5.5;
    const durationFactor = action?.getClip?.()?.duration ? THREE.MathUtils.clamp(1.3 / action.getClip().duration, 0.55, 2) : 1;
    return THREE.MathUtils.clamp((actualSpeed / reference) * durationFactor * (Number(cfg.animationSpeed) || 1), 0.35, 3.5);
}

export function createAnimal(scene, { id, name = 'Veado-vermelho', position, seed = 1, settings = {} }) {
    const group = new THREE.Group(); group.position.copy(position); group.userData.animalId = id;
    const brown = new THREE.MeshStandardMaterial({ color: 0x765034, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x392f27, roughness: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xd2bd94, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.49, 0.85, 4, 8), brown); body.rotation.z = Math.PI / 2; body.position.y = 1.35; body.name = 'Corpo'; group.add(body);
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.46, 4, 7), brown); neck.position.set(0, 1.75, 0.56); neck.rotation.x = 0.35; group.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), brown); head.position.set(0, 2.04, 0.73); head.name = 'Cabeça'; group.add(head);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.31, 8, 7), cream); belly.scale.set(1.35, 0.5, 0.84); belly.position.set(0, 1.07, -0.03); group.add(belly);
    const legPivots = [];
    for (const side of [-1, 1]) {
        for (const [z, x] of [[0.32, 0.32], [-0.42, 0.32]]) {
            const pivot = new THREE.Group(); pivot.position.set(side * x, 0.92, z); pivot.name = 'PernaPivot'; group.add(pivot);
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.77, 6), dark); leg.position.set(0, -0.39, 0); leg.name = 'Perna'; pivot.add(leg);
            legPivots.push(pivot);
        }
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.27, 5), dark); ear.position.set(side * 0.17, 2.22, 0.75); ear.rotation.z = side * -0.35; group.add(ear);
        const antler = new THREE.Group(); antler.position.set(side * 0.14, 2.2, 0.65);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.62, 5), dark); stem.position.y = 0.29; stem.rotation.z = side * -0.16; antler.add(stem);
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.028, 0.33, 5), dark); tine.position.set(side * 0.13, 0.43, 0); tine.rotation.z = side * 0.78; antler.add(tine); group.add(antler);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0x17120d })); eye.position.set(0.15, 2.06, 0.88); group.add(eye);
    group.scale.setScalar(Number(settings.scale) || 0.92 + Math.abs(Math.sin(seed)) * 0.08);
    group.rotation.order = 'YXZ';
    group.rotation.y = Number(settings.rotationY) || 0;
    group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.userData.animalId = id; } });
    scene.add(group);
    const maxHealth = Math.max(1, Number(settings.health) || 100);
    const animal = { id, name, group, dead: false, health: maxHealth, maxHealth, state: 'IDLE', behavior: settings.behavior || 'Fugir do jogador', weight: Number(settings.weight) || 68 + Math.abs(seed % 80), hitDistance: 0, hitRegion: 'Corpo', direction: seed * 0.73, nextChoice: 0, speed: 0, walkSpeed: Number(settings.speed) || 1.25, runSpeed: Number(settings.runSpeed) || 7.6, detectionDistance: Number(settings.detectionDistance) || 80, fleeDistance: Number(settings.fleeDistance) || 35, grazeTime: 0, grazeDuration: 3 + Math.random() * 4, walkDuration: 0, walkDurationMax: 2 + Math.random() * 5, idleDuration: 1 + Math.random() * 3, idleTime: 0, alertTime: 0, alertDuration: 1.6, fleeDirection: new THREE.Vector3(), turnRate: 3.5, bobPhase: 0, seedOffset: seed * 1.37, mixer: null, actions: new Map(), currentAction: null, walkPhase: 0, deathLift: 0.5 * (Number(settings.scale) || 1), groundY: position.y, deathTime: 0 };
    animal.animationConfig = settings.animationConfig ?? {};
    animal.isBird = String(animal.animationConfig.type ?? settings.animalType ?? '').toUpperCase() === 'AVE';
    animal.fleeSpeed = Number(settings.fleeSpeed ?? animal.animationConfig.fleeSpeed) || animal.runSpeed;
    // ---- ROTINA NAS ZONAS FIXAS (comida -> água -> descanso) ----
    // Preenchidos pelo sistema de wildlife (wildlife.js). Sem eles, o animal
    // mantém exatamente o comportamento antigo (vagar aleatório), então nada
    // do que já existia é perdido.
    animal.social = 'solitary';
    animal.herd = null;
    animal.need = null;              // 'food' | 'water' | 'rest'
    animal.target = null;            // ponto-alvo dentro da zona
    animal.routineZone = null;
    animal.arrivalRadius = 10;
    animal.activity = null;
    animal.activityTime = 0;
    animal.activityDuration = 0;
    animal.follow = null;            // centro do bando (coesão, sem alinhar)
    animal.followSpacing = 16 + Math.abs(Math.sin(seed * 2.3)) * 12;
    animal.restAmount = 0;
    animal.hasRestClip = false;
    animal.prevState = 'IDLE';
    animal.onActivityEnd = null;
    animal.parts = { body, head, neck, legPivots };
    animal.modelRoot = null;
    animal.modelBaseY = 0;
    animal.pickClip = (names) => {
        if (!animal.actions || !animal.actions.size) return null;
        const lowered = names.map((n) => String(n).toLowerCase());
        for (const entry of animal.actions) {
            const k = String(entry[0]).toLowerCase();
            if (lowered.some((w) => w && k.includes(w))) return { key: entry[0], action: entry[1] };
        }
        return null;
    };
    animal.setModel = (gltf, targetHeight = 2.1) => {
        group.clear();
        if (animal.parts) animal.parts.legPivots = [];
        if (animal.mixer) { try { animal.mixer.stopAllAction(); } catch { } }
        animal.mixer = null; animal.actions = new Map(); animal.currentAction = null; animal.hasDeathClip = false;
        const model = gltf.scene;
        // Ordem certa: escala + yaw PRIMEIRO, depois mede a caixa já girada.
        // (Antes media antes do giro e o bicho ficava descentrado/enterrado.)
        const rawBounds = new THREE.Box3().setFromObject(model);
        const rawSize = rawBounds.getSize(new THREE.Vector3());
        const modelScale = Number(animal.animationConfig.modelScale) || 1;
        const scale = Math.max(0.1, targetHeight * modelScale) / Math.max(rawSize.y, 0.001);
        model.scale.setScalar(scale);
        // O esqueleto do veado chega com a espinha no eixo X (nariz +X, rabo -X).
        // Gira -90° em Y p/ olhar p/ +Z (frente do jogo).
        const frontOffsets = { '+Z': 0, '-Z': Math.PI, '+X': -Math.PI / 2, '-X': Math.PI / 2 };
        animal.detectedFrontAxis = inferModelFrontAxis(model);
        const frontAxis = String(animal.animationConfig.frontAxis ?? animal.detectedFrontAxis ?? '+X').toUpperCase();
        model.rotation.set(0, (frontOffsets[frontAxis] ?? -Math.PI / 2) + (Number(animal.animationConfig.rotationY) || 0), 0);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        model.position.set(-((bounds.min.x + bounds.max.x) / 2), -bounds.min.y + (Number(animal.animationConfig.footOffset) || 0), -((bounds.min.z + bounds.max.z) / 2));
        model.traverse((object) => {
            if (object.isMesh || object.isSkinnedMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                object.userData.animalId = id;
            }
        });
        group.add(model);
        animal.modelRoot = model;
        animal.modelBaseY = model.position.y;
        // Apos o yaw, a espinha esta ao longo de Z no mundo: morte rola em Z. Nunca em Y.
        animal.modelYawOffset = model.rotation.y;
        animal.proceduralLegBones = [];
        model.traverse((object) => {
            if (!object.isBone || !/(leg|thigh|shin|foot|paw|ankle|fore|hind|front|back)/i.test(object.name)) return;
            animal.proceduralLegBones.push({ bone: object, rotation: object.rotation.clone(), phase: /(left|_l\b|\.l\b)/i.test(object.name) ? 0 : Math.PI });
        });
        animal.detectedClips = inferAnimationRoles(gltf.animations ?? []);
        const birdFlightClip = animal.isBird && (animal.animationConfig.clips?.fly || animal.detectedClips.fly);
        animal.hasWalkClip = !!(animal.animationConfig.clips?.walk || animal.detectedClips.walk || animal.detectedClips.run || birdFlightClip);
        animal.hasRunClip = !!(animal.animationConfig.clips?.run || animal.animationConfig.clips?.flee || animal.detectedClips.run || animal.detectedClips.flee || birdFlightClip);
        animal.modelSpineAxis = 'Z';
        animal.deathAxis = 'Z';
        animal.deathLift = Math.max(0.25, Math.min(size.x, size.z) * 0.5);
        if (gltf.animations?.length) {
            animal.mixer = new THREE.AnimationMixer(model);
            animal.animations = gltf.animations;
            for (const [index, clip] of gltf.animations.entries()) {
                // Some exporters leave the clip unnamed; keep it playable too.
                const actionName = String(clip.name || `animation ${index + 1}`).toLowerCase();
                animal.actions.set(actionName, animal.mixer.clipAction(clip));
            }
        } else {
            // GLB estatico (ex.: 0 animacoes): sem mixer — o procedural cuida de andar/correr/morrer.
            animal.mixer = null; animal.animations = []; animal.actions = new Map();
        }
        animal.walkPhase = 0;
        animal.deathTime = 0;
        // Descanso: se o GLB tiver clip deitado/dormindo, ele manda; senão usa a pose procedural.
        animal.hasRestClip = [...animal.actions.keys()].some((name) => /(sleep|lying|deitar|dormir|lay[- ]?down|sit[- ]?down|kneel)/i.test(String(name)));
        // Se o animal trocou de modelo no meio da morte, reaplica a pose deitado.
        if (animal.dead) { animal.applyDeathPose(1); }
        else { model.rotation.x = 0; model.rotation.z = 0; animal.playState(animal.state); }
    };
    animal.playState = (state) => {
        if (animal.dead) state = 'DEAD';
        if (animal._playedAnimationState === state
            && animal._playedAnimationModel === animal.modelRoot
            && animal._playedAnimationConfig === animal.animationConfig) return;
        animal._playedAnimationState = state;
        animal._playedAnimationModel = animal.modelRoot;
        animal._playedAnimationConfig = animal.animationConfig;
        animal.currentState = state;
        const lower = normalizeClipName;
        const aliases = { IDLE: ['idle', 'rest', 'graze', 'eat'], WALK: ['walk', 'gait', 'move'], MOVE: ['walk', 'move', 'gait'], RUN: ['run', 'gallop', 'trot', 'flee'], FLEE: ['run', 'gallop', 'trot', 'flee', 'walk'], ALERT: ['alert', 'look', 'idle'], DRINK: ['drink', 'water', 'graze', 'eat', 'idle'], REST: ['sleep', 'lying', 'lie', 'rest', 'sit', 'idle'], DEAD: ['death', 'dead', 'die', 'fall', 'shot', 'hit'] };
        if (!animal.actions?.size || !animal.mixer) { animal.currentAction = null; animal.currentActionMoves = false; return; }
        const cfg = animal.animationConfig ?? {};
        const role = state === 'IDLE' || state === 'GRAZE' ? 'idle' : state === 'TURN' ? 'turn' : (state === 'WALK' || state === 'MOVE' ? (animal.isBird ? 'fly' : 'walk') : state === 'RUN' ? (animal.isBird ? 'fly' : 'run') : state === 'FLEE' ? (animal.isBird ? 'fly' : 'flee') : '');
        const configured = cfg.clips?.[role] ?? cfg[role];
        const byConfiguredName = configured ? [...animal.actions.entries()].find(([name]) => lower(name) === lower(configured) || lower(name).includes(lower(configured))) : null;
        const roleWords = {
            idle: ['idle', 'stand', 'standing'], walk: ['walk', 'walking', 'move', 'movement', 'locomotion', 'gait'],
            run: ['run', 'running', 'sprint', 'gallop'], flee: ['flee', 'escape', 'runaway'], fly: ['fly', 'flying', 'flight'],
            attack: ['attack', 'bite', 'strike'],
            turn: ['turn', 'pivot'],
        };
        const words = roleWords[role] ?? aliases[state] ?? [state.toLowerCase()];
        let entry = byConfiguredName ?? [...animal.actions.entries()].find(([name]) => words.some((alias) => lower(name).includes(alias)));
        if (!entry && (state === 'RUN' || state === 'FLEE')) entry = [...animal.actions.entries()].find(([name]) => /(run|gallop|trot|sprint)/i.test(String(name)));
        if (!entry && state === 'FLEE') entry = [...animal.actions.entries()].find(([name]) => /(walk|move|gait)/i.test(String(name)));
        if (!entry && role === 'walk') entry = [...animal.actions.entries()].find(([name]) => /(run|gallop|trot|sprint)/i.test(String(name)));
        // GLBs often contain a single clip named "Take 001", "ArmatureAction"
        // or "mixamo.com". Reuse that real clip for locomotion so these models
        // don't remain rigid when their exported animation has no state label.
        if (!entry && ['WALK', 'MOVE', 'RUN', 'FLEE'].includes(state)) {
            entry = [...animal.actions.entries()].find(([name]) => !/(death|dead|die|fall|shot|hit)/i.test(normalizeClipName(name)));
        }
        // Morte só aceita um clip de morte real. Reaproveitar Idle aqui marcava
        // hasDeathClip e impedia a queda procedural, deixando o animal em pé.
        if (!entry && state !== 'DEAD' && !['WALK', 'MOVE', 'RUN', 'FLEE'].includes(state)) entry = [...animal.actions.entries()].find(([name]) => /(walk|run|gallop|trot|move|gait|flee|idle|graze|eat|alert|look|drink|sleep|lie|rest|fly)/i.test(String(name)));
        // MORTE sem clip proprio: NAO usa clip [0] — fica parado e cai de lado via applyDeathPose().
        if (!entry && state !== 'DEAD' && !['WALK', 'MOVE', 'RUN', 'FLEE'].includes(state)) entry = [...animal.actions.entries()][0];
        if (!entry) {
            if (animal.currentAction) animal.currentAction.fadeOut(0.2);
            animal.currentAction = null;
            animal.currentActionMoves = false;
            return;
        }
        const activeClipName = String(entry[1].getClip?.()?.name ?? entry[0]);
        const isMovingRole = ['walk', 'run', 'flee', 'fly'].includes(role);
        animal.currentActionMoves = isMovingRole && (entry === byConfiguredName || /(walk|run|gallop|trot|move|gait|flee|fly|flight|locomotion|sprint)/i.test(activeClipName));
        const previous = animal.currentAction;
        if (entry[1] === previous) {
            const wantSpeed = getAnimationTimeScale(animal, state, entry[1]);
            try { entry[1].setEffectiveTimeScale(wantSpeed); } catch { }
            return;
        }
        entry[1].reset();
        const cfgLoop = cfg.loop?.[role];
        const once = state === 'DEAD' || (cfgLoop === false && state !== 'DEAD');
        entry[1].setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        entry[1].clampWhenFinished = once;
        // GLB com 1 clip so (ex.: Deer_Idle): andar reaproveita o clip acelerado + balanco procedural.
        try { entry[1].setEffectiveTimeScale(getAnimationTimeScale(animal, state, entry[1])); } catch { }
        try { entry[1].fadeIn(0.25).play(); } catch { try { entry[1].play(); } catch { } }
        if (previous && previous !== entry[1]) previous.fadeOut(0.25);
        animal.currentAction = entry[1];
        animal.hasDeathClip = state === 'DEAD';
    };
    // MORTE: deita de lado rolando no eixo do corpo (eixo do GROUP onde fica a espinha).
    // Veado importado tem espinha em X (apos o yaw, corpo ao longo de Z no mundo) -> rola em Z.
    // Procedural e outros GLBs com espinha em Z -> rolam em X. Nunca mexe em Y (direcao).
    animal.applyDeathPose = (t = 1) => {
        const clamped = THREE.MathUtils.clamp(t, 0, 1);
        const eased = clamped * clamped * (3 - 2 * clamped);
        const axis = animal.deathAxis || (animal.modelRoot ? 'Z' : 'X');
        if (axis === 'Z') { group.rotation.x = 0; group.rotation.z = (Math.PI / 2) * eased; }
        else { group.rotation.z = 0; group.rotation.x = (Math.PI / 2) * eased; }
        group.position.y = (animal.groundY ?? group.position.y) + (animal.deathLift ?? 0.4) * eased;
        if (animal.modelRoot) {
            animal.modelRoot.rotation.x = 0;
            animal.modelRoot.rotation.z = 0;
            animal.modelRoot.rotation.y = animal.modelYawOffset ?? animal.modelRoot.rotation.y;
            animal.modelRoot.position.y = animal.modelBaseY ?? animal.modelRoot.position.y;
        }
        if (animal.parts?.legPivots?.length) for (const pivot of animal.parts.legPivots) pivot.rotation.set(0, 0, 0);
    };
    animal.resetDeathPose = () => {
        group.rotation.x = 0; group.rotation.z = 0;
        if (animal.groundY !== undefined) group.position.y = animal.groundY;
    };
    // Balanço corporal SEMPRE ativo andando/correndo no GLB importado:
    // o clip Idle sozinho nao desloca o bicho (GLB do veado so tem Deer_Idle),
    // então o deslocamento + balanço vertical simulam o passo visível no mapa.
    // Espinha ao longo de Z: balanço de passo eh pitch (rotation.x). Nunca yaw.
    animal.applyLocomotionBob = (fleeing, dt = 1 / 60) => {
        if (!animal.modelRoot) return;
        animal.bobPhase = (animal.bobPhase || 0) + dt * (fleeing ? 9 : 6.5);
        const amp = (animal.modelRoot.scale.y || 1) * (fleeing ? 0.085 : 0.06);
        animal.modelRoot.position.y = (animal.modelBaseY || 0) + Math.abs(Math.sin(animal.bobPhase)) * amp;
        animal.modelRoot.rotation.x = Math.sin(animal.bobPhase * 0.5) * (fleeing ? 0.065 : 0.04);
        animal.modelRoot.rotation.z = Math.sin(animal.bobPhase) * (fleeing ? 0.035 : 0.022);
        animal.modelRoot.rotation.y = animal.modelYawOffset ?? animal.modelRoot.rotation.y;
    };
    animal.resetLocomotionBob = () => {
        if (!animal.modelRoot) return;
        animal.modelRoot.position.y = animal.modelBaseY ?? animal.modelRoot.position.y;
        animal.modelRoot.rotation.x = 0;
        animal.modelRoot.rotation.z = 0;
        animal.modelRoot.rotation.y = animal.modelYawOffset ?? animal.modelRoot.rotation.y;
    };
    animal.proceduralStride = (phase, intensity = 1, isFlee = false) => {
        const pivots = animal.parts?.legPivots?.length ? animal.parts.legPivots : group.children.filter((c) => c.name === 'PernaPivot');
        if (pivots.length) {
            pivots.forEach((pivot, index) => {
                const diagonal = (index === 0 || index === 3) ? 0 : Math.PI;
                pivot.rotation.x = Math.sin(phase + diagonal) * (isFlee ? 0.65 : 0.45) * intensity;
            });
        } else if (animal.modelRoot && !animal.currentAction) {
            animal.modelRoot.position.y = (animal.modelBaseY || 0) + Math.abs(Math.sin(phase)) * (isFlee ? 0.06 : 0.035);
        }
    };
    animal.hit = (point, shotDistance, damage = 65, hitMesh = null) => {
        if (animal.dead) return;
        const meshName = String(hitMesh?.name ?? '').toLowerCase();
        group.updateMatrixWorld(true);
        const localPoint = group.worldToLocal(point.clone());
        const headHit = /head|brain|cerebr|cabe[c\u00e7]/i.test(meshName) || localPoint.y > 1.85;
        const chestHit = localPoint.y >= 1.25 && localPoint.y <= 1.8;
        const heartHit = !headHit && (/heart|corac|cora[c\u00e7]/i.test(meshName)
            || (chestHit && Math.abs(localPoint.x) < 0.24 && localPoint.z > 0.12 && localPoint.z < 0.5));
        const lungHit = !headHit && !heartHit && (/lung|pulm/i.test(meshName) || chestHit);
        const bodyDamage = minimumDamageForThreeShotKill(animal.maxHealth, damage || 65);
        const lungDamage = Math.max(bodyDamage, Math.ceil(animal.maxHealth * 0.6));
        const dealt = headHit || heartHit ? animal.maxHealth : lungHit ? lungDamage : bodyDamage;
        animal.health -= dealt;
        animal.lastDamage = dealt;
        animal.hitDistance = shotDistance ?? point.distanceTo(group.position);
        animal.hitRegion = headHit ? 'Cabe\u00e7a' : heartHit ? 'Cora\u00e7\u00e3o' : lungHit ? 'Pulm\u00e3o' : 'Corpo';
        if (animal.health <= 0) {
            animal.dead = true; animal.state = 'DEAD'; animal.deathTime = 0;
            animal.groundY = group.position.y;
            if (animal.currentAction) { try { animal.currentAction.fadeOut(0.2); } catch { } animal.currentAction = null; }
            animal.playState('DEAD');
            animal.applyDeathPose(0);
        }
        else { animal.state = 'FLEE'; animal.playState('FLEE'); }
    };
    animal.hearShot = (x, z) => { animal.threatX = x; animal.threatZ = z; animal.heardShotFlag = true; };
    animal.respondToCall = (x, z) => {
        if (animal.dead || animal.state === 'FLEE' || animal.state === 'TURN') return false;
        animal.callTarget = { x, z };
        animal.callTime = 24;
        animal.callCalmTime = 0;
        animal.activity = null; animal.need = null; animal.follow = null;
        animal.target = animal.callTarget;
        animal.arrivalRadius = 13 + Math.random() * 5;
        animal.state = 'MOVE';
        animal.playState('MOVE');
        return true;
    };
    // ---- ROTINA / ZONAS FIXAS -------------------------------------------------
    // Alvo da necessidade atual (definido por wildlife.js, que conhece as zonas).
    animal.setNeedTarget = (zone, need, point) => {
        animal.need = need ?? zone?.kind ?? 'food';
        animal.routineZone = zone ?? null;
        animal.target = point ?? (zone ? { x: zone.x, z: zone.z } : null);
        animal.arrivalRadius = zone ? THREE.MathUtils.clamp(zone.r * 0.45, 6, 20) : 8;
        if (!animal.dead && animal.state !== 'FLEE' && animal.state !== 'ALERT') animal.state = 'MOVE';
        return animal;
    };
    // Começa a atividade dentro da zona (comer / beber / descansar).
    animal.beginActivity = () => {
        const need = animal.need ?? 'food';
        animal.activity = need;
        animal.activityTime = 0;
        animal.grazeTime = 0;
        animal.activityDuration = activityDuration(need, Math.random);
        animal.state = need === 'food' ? 'GRAZE' : need === 'water' ? 'DRINK' : 'REST';
        animal.idleTime = 0;
        animal.playState(animal.state);
    };
    animal.finishActivity = () => {
        const need = animal.activity ?? animal.need;
        animal.activity = null; animal.need = null; animal.target = null; animal.routineZone = null;
        animal.activityTime = 0; animal.activityDuration = 0;
        animal.state = 'IDLE'; animal.idleTime = 0; animal.idleDuration = 1.5 + Math.random() * 3;
        animal.playState('IDLE');
        animal.onActivityEnd?.(animal, need);
    };
    // Depois do susto: volta para a zona (se houver alvo) ou retoma o pastejo.
    animal.resumeRoutine = () => {
        if (animal.target) { animal.state = 'MOVE'; return; }
        animal.state = 'GRAZE'; animal.grazeTime = 0; animal.grazeDuration = 2.5 + Math.random() * 4;
    };
    // Alarme vindo de fora (tiro, grito do bando, jogador muito perto).
    animal.alertTo = (x, z, { panic = false } = {}) => {
        if (animal.dead) return;
        animal.threatX = x; animal.threatZ = z;
        if (panic && animal.state !== 'FLEE' && animal.state !== 'TURN') {
            animal.state = 'TURN'; animal.turnTime = 0; animal.fleeTime = 0; animal.fleeDuration = 3 + Math.random() * 3;
            const away = new THREE.Vector3(group.position.x - x, 0, group.position.z - z);
            if (away.lengthSq() < 0.01) away.set(Math.sin(animal.direction), 0, Math.cos(animal.direction));
            away.normalize(); away.x += (Math.random() - 0.5) * 0.6; away.z += (Math.random() - 0.5) * 0.6; away.normalize();
            animal.fleeDirection.copy(away);
            animal.alertTime = 0; animal.activity = null; animal.target = null; animal.need = null; animal.follow = null;
        } else if (animal.state !== 'FLEE' && animal.state !== 'ALERT') {
            animal.state = 'ALERT'; animal.alertTime = 0; animal.alertDuration = 1 + Math.random() * 1.6;
        }
    };
    // DESCANSO: deita o corpo (usado quando o GLB não tem clip deitado/dormindo).
    animal.applyRestPose = (t = 1) => {
        const clamped = THREE.MathUtils.clamp(t, 0, 1);
        const eased = clamped * clamped * (3 - 2 * clamped);
        const axis = animal.deathAxis || (animal.modelRoot ? 'Z' : 'X');
        const angle = (Math.PI / 2.35) * eased;
        if (axis === 'Z') { group.rotation.x = 0; group.rotation.z = angle; }
        else { group.rotation.z = 0; group.rotation.x = angle; }
        group.position.y = (animal.groundY ?? group.position.y) + (animal.deathLift ?? 0.4) * 0.55 * eased;
        if (animal.parts?.legPivots?.length) for (const pivot of animal.parts.legPivots) pivot.rotation.x = 0.55 * eased;
        if (animal.modelRoot) animal.modelRoot.position.y = (animal.modelBaseY ?? 0) * (1 - 0.12 * eased);
    };
    animal.think = (safeDt, distance, heardShot) => {
        animal.idleTime += safeDt;
        if (animal.callTime > 0 && animal.callTarget) {
            animal.callTime = Math.max(0, animal.callTime - safeDt);
            const dx = animal.callTarget.x - group.position.x;
            const dz = animal.callTarget.z - group.position.z;
            if (Math.hypot(dx, dz) <= animal.arrivalRadius || animal.callTime <= 0) {
                animal.callTime = 0; animal.callTarget = null; animal.target = null;
                animal.callCalmTime = 6; animal.state = 'ALERT'; animal.alertTime = 0; animal.alertDuration = 6;
                return;
            }
            animal.target = animal.callTarget;
            animal.direction = Math.atan2(dx, dz);
            animal.state = 'MOVE';
            return;
        }
        if (animal.callCalmTime > 0) {
            animal.callCalmTime = Math.max(0, animal.callCalmTime - safeDt);
            animal.state = 'ALERT';
            return;
        }
        const wantsFlee = (distance < animal.detectionDistance && animal.behavior === 'Fugir do jogador') || heardShot;
        if (wantsFlee && animal.state !== 'FLEE' && animal.state !== 'TURN') {
            animal.state = 'TURN'; animal.turnTime = 0; animal.fleeTime = 0; animal.fleeDuration = 3 + Math.random() * 3;
            const away = new THREE.Vector3(group.position.x - (animal.threatX ?? group.position.x), 0, group.position.z - (animal.threatZ ?? group.position.z));
            if (away.lengthSq() < 0.01) away.set(Math.sin(animal.direction), 0, Math.cos(animal.direction));
            away.normalize(); away.x += (Math.random() - 0.5) * 0.6; away.z += (Math.random() - 0.5) * 0.6; away.normalize();
            animal.fleeDirection.copy(away); animal.alertTime = 0; return;
        }
        if (animal.state === 'FLEE') {
            animal.fleeTime += safeDt;
            const escaped = distance > Math.max(animal.detectionDistance, animal.fleeDistance);
            if ((escaped && animal.fleeTime > 1.2) || animal.fleeTime > 18) { animal.state = 'ALERT'; animal.alertTime = 0; animal.alertDuration = 1 + Math.random() * 1.5; animal.idleTime = 0; }
            return;
        }
        if (animal.state === 'TURN') {
            animal.turnTime += safeDt;
            const angle = Math.atan2(animal.fleeDirection.x, animal.fleeDirection.z);
            const delta = ((angle - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            if (Math.abs(delta) < 0.22 || animal.turnTime >= (animal.animationConfig.clips?.turn || animal.detectedClips?.turn ? 0.9 : 0.38)) animal.state = 'FLEE';
            return;
        }
        if (animal.state === 'ALERT') {
            animal.alertTime += safeDt;
            if (animal.alertTime >= animal.alertDuration) { animal.idleTime = 0; animal.resumeRoutine(); }
            return;
        }
        if (distance < animal.detectionDistance && animal.behavior !== 'Fugir do jogador') {
            if (animal.state !== 'ALERT') { animal.state = 'ALERT'; animal.alertTime = 0; animal.alertDuration = 1.2 + Math.random(); }
            return;
        }
        // ---------- ROTINA NAS ZONAS FIXAS: comida -> água -> descanso ----------
        if (animal.state === 'DRINK' || animal.state === 'REST') {
            animal.activityTime += safeDt;
            if (animal.activityTime >= animal.activityDuration) animal.finishActivity();
            return;
        }
        if (animal.target) {
            const tx = animal.target.x - group.position.x;
            const tz = animal.target.z - group.position.z;
            const dist = Math.hypot(tx, tz);
            let angle = Math.atan2(tx, tz);
            // Coesão do bando: quem fica para trás caminha na direção do centro,
            // mas cada indivíduo tem seu próprio ponto na zona (nunca alinha).
            if (animal.follow) {
                const fx = animal.follow.x - group.position.x;
                const fz = animal.follow.z - group.position.z;
                const followDistance = Math.hypot(fx, fz);
                if (followDistance > animal.followSpacing) {
                    // Blend toward the herd center so followers do not form a rigid queue.
                    const blend = THREE.MathUtils.clamp((followDistance - animal.followSpacing) / 28, 0, 0.68);
                    const followAngle = Math.atan2(fx, fz);
                    const diff = ((followAngle - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                    angle += diff * blend;
                }
            }
            animal.direction = angle;
            if (dist <= animal.arrivalRadius) animal.beginActivity();
            else if (animal.state !== 'MOVE') { animal.state = 'MOVE'; animal.playState('MOVE'); }
            return;
        }
        if (animal.state === 'MOVE') { animal.state = 'IDLE'; animal.idleTime = 0; return; }
        // ---------- Fim da rotina (comportamento antigo de vagueio) ------------
        if (animal.state === 'GRAZE') {
            animal.grazeTime += safeDt;
            if (animal.need === 'food') {
                // Comida de verdade: pasta na zona até o tempo da atividade acabar.
                if (animal.grazeTime >= animal.activityDuration) animal.finishActivity();
                return;
            }
            if (animal.grazeTime >= animal.grazeDuration) { animal.state = 'WALK'; animal.walkDuration = 0; animal.walkDurationMax = 2.5 + Math.random() * 5; animal.direction += (Math.random() - 0.5) * 2.6; animal.idleTime = 0; }
            return;
        }
        if (animal.state === 'WALK') {
            animal.walkDuration += safeDt;
            if (animal.walkDuration >= animal.walkDurationMax) {
                if (Math.random() < 0.55) { animal.state = 'GRAZE'; animal.grazeTime = 0; animal.grazeDuration = 2.5 + Math.random() * 4; }
                else { animal.state = 'IDLE'; animal.idleTime = 0; animal.idleDuration = 1 + Math.random() * 3; }
            }
            return;
        }
        if (animal.idleTime >= animal.idleDuration) {
            if (Math.random() < 0.45) { animal.state = 'WALK'; animal.walkDuration = 0; animal.walkDurationMax = 2.5 + Math.random() * 5; animal.direction += (Math.random() - 0.5) * 2.6; }
            else { animal.state = 'GRAZE'; animal.grazeTime = 0; animal.grazeDuration = 2.5 + Math.random() * 4; }
            animal.idleTime = 0;
        }
    };
    animal.update = (dt, playerPosition, context = {}) => {
        const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
        // O mixer PRECISA atualizar mesmo morto, senão a animação de morte congela no 1º frame.
        try { animal.mixer?.update(safeDt); } catch { }
        if (animal.dead) {
            animal.deathTime = (animal.deathTime ?? 0) + safeDt;
            // Se o GLB tem clip de morte, deixa o clip tocar e só garante deitado no final.
            // Se NÃO tem, faz a queda de lado procedural (0.7s).
            if (animal.hasDeathClip && animal.currentAction) return;
            animal.applyDeathPose(Math.min(animal.deathTime / 0.7, 1));
            return;
        }
        const heardShot = !!animal.heardShotFlag;
        if (heardShot && context.shotX !== undefined) { animal.threatX = context.shotX; animal.threatZ = context.shotZ; }
        animal.heardShotFlag = false;
        const distance = Math.hypot(group.position.x - playerPosition.x, group.position.z - playerPosition.z);
        if (distance < animal.detectionDistance) { animal.threatX = playerPosition.x; animal.threatZ = playerPosition.z; }
        else if (animal.threatX === undefined) { animal.threatX = playerPosition.x; animal.threatZ = playerPosition.z; }
        if ((animal.state === 'FLEE' || animal.state === 'TURN') && animal.fleeDirection.lengthSq() < 0.01) {
            animal.fleeDirection.set(group.position.x - playerPosition.x, 0, group.position.z - playerPosition.z);
            if (animal.fleeDirection.lengthSq() < 0.01) animal.fleeDirection.set(Math.sin(animal.direction), 0, Math.cos(animal.direction));
            animal.fleeDirection.normalize();
        }
        animal.think(safeDt, distance, heardShot);
        animal.playState(animal.state === 'GRAZE' ? 'IDLE' : animal.state);
        const moving = animal.state === 'WALK' || animal.state === 'MOVE' || animal.state === 'FLEE';
        // Garante que saiu da pose de morte (ex.: respawn / troca de modelo).
        if (group.rotation.z !== 0) group.rotation.z = 0;
        if (group.rotation.x !== 0) group.rotation.x = 0;
        // DESCANSO: deita e levanta suavemente (usa clip próprio quando existir).
        animal.restAmount += ((animal.state === 'REST' ? 1 : 0) - animal.restAmount) * Math.min(1, safeDt * 1.8);
        if (!animal.hasRestClip && animal.restAmount > 0.01) animal.applyRestPose(animal.restAmount);
        if (moving) {
            const fleeing = animal.state === 'FLEE';
            animal.speed = fleeing ? animal.fleeSpeed : animal.walkSpeed;
            if (animal.isBird) animal.speed = fleeing ? (Number(animal.animationConfig.flightSpeed) || animal.fleeSpeed) : (Number(animal.animationConfig.flightSpeed) || animal.walkSpeed);
            const desiredAngle = fleeing ? Math.atan2(animal.fleeDirection.x, animal.fleeDirection.z) : animal.direction;
            let targetAngle = Number.isFinite(animal.navigationDetourAngle) ? animal.navigationDetourAngle : desiredAngle;
            // Navigation changes much more slowly than animation. Replan four times
            // per second instead of rescanning terrain and trees on every render frame.
            animal.navigationCheckIn = Math.max(0, (animal.navigationCheckIn ?? 0) - safeDt);
            const shouldReplan = animal.navigationCheckIn <= 0 || animal.stuckTime > 0.7;
            let nearbyObstacles = [];
            const groundAt = (x, z) => {
                try {
                    const hit = context.groundRaycast?.(x, z);
                    if (Number.isFinite(hit)) return hit;
                    const value = Number(context.groundHeight?.(x, z));
                    return Number.isFinite(value) ? value : group.position.y;
                } catch { return group.position.y; }
            };
            const isNavigable = (angle) => {
                const stride = Math.max(2.5, (fleeing ? animal.runSpeed : animal.walkSpeed) * 0.55);
                const x1 = group.position.x + Math.sin(angle) * stride;
                const z1 = group.position.z + Math.cos(angle) * stride;
                const y0 = groundAt(group.position.x, group.position.z);
                for (const t of [0.45, 0.9, 1.35]) {
                    const x = group.position.x + Math.sin(angle) * stride * t;
                    const z = group.position.z + Math.cos(angle) * stride * t;
                    const y = groundAt(x, z);
                    if (!animal.isBird && Math.abs(y - y0) / Math.max(stride * t, 0.1) > 0.72) return false;
                    for (const obstacle of nearbyObstacles) {
                        if (animal.isBird && group.position.y - y0 > (obstacle.height ?? 8) + 2) continue;
                        const safeRadius = (obstacle.radius ?? 2) + Math.max(0.65, (animal.colliderRadius ?? 0.65) * (Number(group.scale.x) || 1));
                        if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < safeRadius ** 2) return false;
                    }
                }
                return animal.isBird || Math.abs(groundAt(x1, z1) - y0) / stride <= 0.72;
            };
            if (shouldReplan) {
                animal.navigationCheckIn = 0.25;
                nearbyObstacles = context.obstaclesNear?.(group.position.x, group.position.z) ?? context.obstacles ?? [];
                const directOpen = isNavigable(desiredAngle);
                if (directOpen && animal.stuckTime <= 0.7) {
                    // Retome o alvo assim que a linha direta ficar livre.
                    animal.navigationDetourAngle = null;
                    targetAngle = desiredAngle;
                    animal.stuckTime = Math.max(0, (animal.stuckTime ?? 0) - safeDt * 2);
                } else if (Number.isFinite(animal.navigationDetourAngle)
                    && animal.stuckTime <= 0.7 && isNavigable(animal.navigationDetourAngle)) {
                    // Preserve a rota lateral entre quadros; o alvo da rotina pode
                    // apontar para dentro da mesma árvore durante vários segundos.
                    targetAngle = animal.navigationDetourAngle;
                } else {
                    // Busca arcos em volta do rumo desejado. A ordem muda a cada
                    // tentativa para não repetir sempre a mesma saída bloqueada.
                    const offsets = [0.48, -0.48, 0.9, -0.9, 1.4, -1.4, 2.05, -2.05, Math.PI, 2.65, -2.65];
                    const start = (animal.navigationAttempt ?? 0) % offsets.length;
                    let route;
                    for (let stepIndex = 0; stepIndex < offsets.length; stepIndex += 1) {
                        const candidate = desiredAngle + offsets[(start + stepIndex) % offsets.length];
                        if (isNavigable(candidate)) { route = candidate; break; }
                    }
                    if (route !== undefined) {
                        targetAngle = route;
                        animal.navigationDetourAngle = route;
                        animal.navigationAttempt = (start + 1) % offsets.length;
                        animal.stuckTime = 0;
                        if (fleeing) animal.fleeDirection.set(Math.sin(route), 0, Math.cos(route)).normalize();
                        else animal.direction = route;
                    } else {
                        animal.speed = 0;
                        animal.stuckTime = (animal.stuckTime ?? 0) + safeDt;
                        animal.navigationAttempt = (start + 1) % offsets.length;
                        // Keep turning to expose a new escape angle next replan.
                        targetAngle = desiredAngle + (animal.navigationAttempt % 2 ? 1 : -1) * Math.PI / 2;
                        animal.navigationDetourAngle = targetAngle;
                    }
                }
            }
            let delta = ((targetAngle - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const maxTurn = (fleeing ? 4.2 : 2.2) * safeDt;
            group.rotation.y += THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
            const step = animal.speed * safeDt;
            const prevX = group.position.x; const prevZ = group.position.z;
            group.position.x += Math.sin(group.rotation.y) * step;
            group.position.z += Math.cos(group.rotation.y) * step;
            if (animal.isBird) {
                const floorY = groundAt(group.position.x, group.position.z);
                const minHeight = Math.max(4, Number(animal.animationConfig.minFlightHeight) || 10);
                const maxHeight = Math.max(minHeight, Number(animal.animationConfig.maxFlightHeight) || 24);
                animal.flyHeight ??= minHeight + (Math.abs(Math.sin(animal.seedOffset)) * (maxHeight - minHeight));
                const targetY = floorY + animal.flyHeight;
                group.position.y += (targetY - group.position.y) * Math.min(1, safeDt * 1.8);
            } else if (typeof context.groundHeight === 'function') {
                try {
                    const rayY = context.groundRaycast?.(group.position.x, group.position.z);
                    const g = Number.isFinite(rayY) ? rayY : Number(context.groundHeight(group.position.x, group.position.z));
                    if (Number.isFinite(g)) group.position.y = g;
                } catch { }
            }
            animal.groundY = group.position.y;
            const moved = Math.hypot(group.position.x - prevX, group.position.z - prevZ);
            if (moved < step * 0.15) animal.stuckTime = (animal.stuckTime ?? 0) + safeDt;
            else { animal.stuckTime = Math.max(0, (animal.stuckTime ?? 0) - safeDt * 2); animal.recoveryTurn = 0; }
            // Clip GLB (idle acelerado) + balanco SEMPRE: antes o GLB com clip nao balançava nada.
            animal.walkPhase = (animal.walkPhase || 0) + safeDt * (fleeing ? 11 : 6);
            const clipMovesLegs = !!animal.currentAction && !!animal.currentActionMoves;
            if (!clipMovesLegs) {
                animal.proceduralStride(animal.walkPhase, 1, fleeing);
                for (const leg of animal.proceduralLegBones ?? []) {
                    leg.bone.rotation.x = leg.rotation.x + Math.sin(animal.walkPhase + leg.phase) * (fleeing ? 0.25 : 0.16);
                }
            }
            if (animal.modelRoot && !clipMovesLegs) animal.applyLocomotionBob(fleeing, safeDt);
            else if (animal.parts && animal.parts.body) {
                animal.parts.body.position.y = 1.35 + Math.abs(Math.sin(animal.walkPhase)) * (fleeing ? 0.07 : 0.045);
                if (animal.parts.head) animal.parts.head.position.y = 2.04 + Math.sin(animal.walkPhase * 2) * 0.02;
            }
        } else {
            if (animal.modelRoot) animal.resetLocomotionBob();
            else if (animal.parts?.legPivots?.length) for (const pivot of animal.parts.legPivots) pivot.rotation.x *= 0.85;
            if (!animal.modelRoot && animal.parts?.head) animal.parts.head.position.y = animal.state === 'GRAZE' ? 1.69 : animal.state === 'DRINK' ? 1.58 : 2.04;
            // BEBER: baixa a cabeça/focinho (procedural ou inclinação leve no GLB sem clip de beber).
            if (animal.state === 'DRINK' && !/(drink|beber|water)/i.test(String(animal.currentAction?.clip?.name ?? ''))) {
                if (animal.modelRoot) animal.modelRoot.rotation.x = 0.24;
                if (animal.parts?.neck) animal.parts.neck.rotation.x = -0.5;
            } else if (animal.parts?.neck) animal.parts.neck.rotation.x *= 0.85;
            if (animal.state === 'ALERT') {
                const look = Math.atan2(playerPosition.x - group.position.x, playerPosition.z - group.position.z);
                const d = ((look - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                group.rotation.y += THREE.MathUtils.clamp(d, -2.5 * safeDt, 2.5 * safeDt);
            }
            if (animal.state === 'TURN') {
                const turn = Math.atan2(animal.fleeDirection.x, animal.fleeDirection.z);
                const d = ((turn - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                group.rotation.y += THREE.MathUtils.clamp(d, -2.8 * safeDt, 2.8 * safeDt);
            }
        }
    };
    return animal;
}
