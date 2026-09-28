import * as THREE from 'three';
import { createLandscape } from './landscape.js';
import { createAnimal } from './animals.js';
import { createWeapon, DEFAULT_WEAPON } from './weapon.js';
import { MIN_ALIVE_ANIMALS, RESPAWN_DELAY_SECONDS, RESPAWN_MIN_DISTANCE, MAX_DEAD_AGE_SECONDS, GLOBAL_RESPAWN_THROTTLE, MAX_ANIMALS_TOTAL, aliveCount, desiredForSpawn, aliveForSpawn, missingGlobal, pickRespawnPosition, pickGlobalRespawnPosition, pickAlternateSpawnSite, removeDueRespawns } from './spawn.js';
import { buildFixedZones } from './zones.js';
import { createWildlife } from './wildlife.js';
import { createZoneMarkers } from './zone-markers.js';

// Recolhimento do animal abatido (tecla E): alcance em metros e bônus por região de acerto.
export const COLLECT_RANGE = 5;
export const REGION_BONUS = { 'Cabeça': 1.5, 'Coração': 1.5, 'Pulmão': 1.2, 'Corpo': 1 };
// Ruído causado pelo passo do jogador (m): correr assusta muito mais que agachar.
export function noiseRadiusFor({ running = false, crouch = false, walking = false } = {}) {
    if (!walking) return 0;
    if (crouch) return 14;
    return running ? 82 : 38;
}
export function collectReward(animal) {
    const weight = Number(animal.weight) || 0;
    return Math.round(weight * 2 * (REGION_BONUS[animal.hitRegion] ?? 1));
}

export function raycastFromReticle(camera, raycaster, targets, range) {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = range;
    return raycaster.intersectObjects(targets, true)[0] ?? null;
}

export function animalForHit(animals, hitObject) {
    for (let object = hitObject; object; object = object.parent) {
        const owner = animals.find((animal) => animal.group === object && !animal.dead);
        if (owner) return owner;
    }
    return null;
}

export function createGame(root, { onAdmin }) {
    const scene = new THREE.Scene();
    const skyBlue = new THREE.Color(0x75c2f4);
    scene.background = skyBlue;
    scene.fog = new THREE.Fog(skyBlue, 700, 3800);
    // Explicit sky objects stay within the camera range and remain visible
    // against a reliably blue background on every graphics driver.
    const skyObjects = new THREE.Group();
    const sunDisc = new THREE.Mesh(
        new THREE.SphereGeometry(34, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffedb0, fog: true, depthWrite: false }),
    );
    sunDisc.position.set(-500, 365, -1250);
    skyObjects.add(sunDisc);
    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: true, opacity: 0.92, depthWrite: false });
    const clouds = new THREE.Group();
    for (const [x, y, z, size] of [[-250, 210, -430, 1], [120, 250, -650, 1.25], [500, 195, -350, 0.82], [-720, 270, -850, 1.1], [860, 230, -1050, 1.35], [40, 310, -1250, 0.9]]) {
        const puffCount = 5;
        for (let i = 0; i < puffCount; i += 1) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMaterial);
            puff.position.set(x + (i - 2) * 13 * size, y + Math.sin(i * 2.4) * 4 * size, z + Math.cos(i * 1.7) * 7 * size);
            puff.scale.set(20 * size, 7 * size * (i % 2 ? 1 : 0.8), 11 * size);
            clouds.add(puff);
        }
    }
    clouds.renderOrder = 1;
    skyObjects.add(clouds);
    scene.add(skyObjects);
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 4500);
    camera.position.set(0, 1.72, 18);
    scene.add(camera);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    let renderPixelRatio = Math.min(devicePixelRatio, 1.25);
    let resolutionSampleTime = 0;
    let slowFrameSamples = 0;
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = false;
    root.innerHTML = `
    <main class="game-shell">
      <canvas class="game-canvas"></canvas>
      <header class="game-topline"><a class="wordmark" href="#">TERRAS <span>ALTAS</span></a><button class="icon-button admin-open" aria-label="Abrir administrador" title="Administrador">⚙</button></header>
    <section class="hud" aria-label="Dados da caçada"><div class="hud-location"><span class="eyebrow">REGIÃO DE CAÇA</span><strong>Serra do Cedro</strong><span id="coords">X 0 · Z 0</span></div><div class="hud-money"><span class="eyebrow" id="money-label">CAIXA</span><strong id="money">R$ 0</strong></div><div class="hud-weapon"><span id="weapon-name">HUNTING RIFLE</span><strong id="ammo">5 / 25</strong><small id="status">PRONTO</small></div></section>
      <div class="crosshair"><i></i><i></i></div>
      <div class="rifle-scope-overlay" id="rifle-scope-overlay" hidden aria-label="Mira telescópica do rifle"><div class="rifle-scope-reticle"><i></i><b></b></div><small><span id="rifle-zoom-level">ZOOM 5×</span> · RODINHA DO MOUSE AJUSTA · SOLTE O BOTÃO DIREITO PARA SAIR</small></div>
      <div class="binocular-overlay" id="binocular-overlay" hidden aria-label="Visão do binóculo"><svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><mask id="binocular-lenses"><rect width="1000" height="600" fill="white"/><ellipse cx="300" cy="300" rx="195" ry="245" fill="black"/><ellipse cx="700" cy="300" rx="195" ry="245" fill="black"/></mask><radialGradient id="binocular-glass"><stop offset="0" stop-color="#b7d8a0" stop-opacity=".08"/><stop offset=".76" stop-color="#172416" stop-opacity=".04"/><stop offset="1" stop-color="#020402" stop-opacity=".55"/></radialGradient></defs><rect width="1000" height="600" fill="#020302" mask="url(#binocular-lenses)"/><ellipse cx="300" cy="300" rx="195" ry="245" fill="url(#binocular-glass)" stroke="#111710" stroke-width="10"/><ellipse cx="700" cy="300" rx="195" ry="245" fill="url(#binocular-glass)" stroke="#111710" stroke-width="10"/></svg><span class="binocular-reticle">+</span><small id="binocular-help">B GUARDAR · + / − ZOOM</small><aside class="binocular-info" id="binocular-info" hidden><span class="eyebrow">ANIMAL IDENTIFICADO</span><strong id="binocular-animal-name"></strong><div><span>ESPÉCIE</span><b id="binocular-animal-species"></b></div><div><span>DISTÂNCIA</span><b id="binocular-animal-distance"></b></div><div><span>PESO</span><b id="binocular-animal-weight"></b></div><div><span>COMPORTAMENTO</span><b id="binocular-animal-state"></b></div></aside></div>
      <div class="decoy-quickbar" id="decoy-quickbar" aria-label="Atalhos de chamariz"><button data-decoy-slot="0"><b>1</b><span>SEM ITEM</span></button><button data-decoy-slot="1"><b>2</b><span>SEM ITEM</span></button><button data-decoy-slot="2"><b>3</b><span>SEM ITEM</span></button><small>L LOJA · I INVENTÁRIO</small></div>
      <div class="toast" id="toast"></div>
    <section class="start-screen" id="start-screen"><div class="start-card"><span class="eyebrow">RESERVA NATURAL · 64 KM²</span><h1>Terras<br><em>Altas</em></h1><p>O vento muda. A mata observa.</p><label class="player-profile-code"><span>CÓDIGO DO JOGADOR · 3 DÍGITOS</span><input id="player-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="3" pattern="[0-9]{3}" placeholder="Ex.: 027"></label><small id="profile-status" class="profile-status">Use seu código para continuar ou criar um perfil.</small><button id="start-button" class="primary-button">ENTRAR NA RESERVA <span>↗</span></button><div class="menu-secondary"><button id="settings-button">CONFIGURAÇÕES</button><button id="credits-button">CRÉDITOS</button></div><div class="start-footer"><span>WASD MOVER</span><span>SHIFT CORRER</span><span>CLIQUE MIRAR</span><span>R RECARREGAR</span><span>E RECOLHER</span><span>B BINÓCULO</span><span>L LOJA</span><span>I INVENTÁRIO</span><span>1–3 CHAMAR</span></div></div></section>
    <section class="game-dialog" id="game-dialog" hidden></section>
    </main>`;
    const canvas = root.querySelector('.game-canvas');
    root.querySelector('.admin-open').addEventListener('click', onAdmin);
    try { root.querySelector('#player-code').value = localStorage.getItem('terras-altas-player-code') ?? ''; } catch { }
    root.querySelector('#start-button').addEventListener('click', () => startGame());
    renderer.domElement.className = 'game-canvas';
    root.querySelector('.game-shell').prepend(renderer.domElement);
    canvas.remove();
    root.querySelector('#settings-button').onclick = () => {
        const dialog = root.querySelector('#game-dialog');
        dialog.hidden = false;
        dialog.innerHTML = '<div class="game-dialog-panel"><button class="icon-button dialog-close" aria-label="Fechar">×</button><span class="eyebrow">PREFERÊNCIAS DE JOGO</span><h2>Configurações</h2><label>SENSIBILIDADE DO MOUSE<input id="sensitivity-setting" type="range" min="0.5" max="2.5" step="0.1" value="1"></label><label>DISTÂNCIA DE VISÃO<input id="distance-setting" type="range" min="1200" max="4500" step="100" value="3800"></label><label>VOLUME DO JOGO<input id="volume-setting" type="range" min="0" max="1" step="0.05" value="0.35"></label></div>';
        dialog.querySelector('.dialog-close').onclick = () => { dialog.hidden = true; };
        dialog.querySelector('#sensitivity-setting').oninput = (event) => { player.mouseSensitivity = Number(event.target.value); };
        dialog.querySelector('#distance-setting').oninput = (event) => { scene.fog.far = Number(event.target.value); };
        dialog.querySelector('#volume-setting').oninput = (event) => { player.volume = Number(event.target.value); };
    };
    root.querySelector('#credits-button').onclick = () => {
        const dialog = root.querySelector('#game-dialog');
        dialog.hidden = false;
        dialog.innerHTML = '<div class="game-dialog-panel"><button class="icon-button dialog-close" aria-label="Fechar">×</button><span class="eyebrow">PROCEDÊNCIA</span><h2>Créditos e licenças</h2><p>Terreno, vegetação, água e animal do protótipo são procedurais, sem assets externos.</p><p>GLBs importados são fornecidos pelo administrador. Registre autoria, licença e URL de origem antes de publicar.</p></div>';
        dialog.querySelector('.dialog-close').onclick = () => { dialog.hidden = true; };
    };

    scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x39402e, 1.8));
    const sun = new THREE.DirectionalLight(0xffe4bb, 3.3);
    sun.position.set(-220, 380, 170);
    sun.castShadow = false;
    scene.add(sun);
    const terrain = createLandscape(scene, { seed: 1427, decorativeRadius: 1250 });
    const modelAssetCache = new Map();
    let modelCloneQueue = Promise.resolve();
    function loadModelAsset(path) {
        if (!path) return Promise.reject(new Error('Caminho do modelo vazio'));
        if (!modelAssetCache.has(path)) {
            const pending = import('../admin/glb.js')
                .then(({ importModel }) => importModel(`./${path}`, renderer))
                .catch((error) => { modelAssetCache.delete(path); throw error; });
            modelAssetCache.set(path, pending);
        }
        return modelAssetCache.get(path);
    }
    async function cloneModelAsset(path) {
        const asset = await loadModelAsset(path);
        const { clone } = await import('three/addons/utils/SkeletonUtils.js');
        const task = modelCloneQueue.then(() => new Promise((resolve, reject) => {
            const create = () => { try { resolve({ ...asset, scene: clone(asset.scene) }); } catch (error) { reject(error); } };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(create, { timeout: 40 });
            else setTimeout(create, 0);
        }));
        modelCloneQueue = task.catch(() => {});
        return task;
    }
    let treeAssetSignature = null;
    let treeAssetLoadId = 0;
    function updateTreeModels(settings = {}) {
        const paths = { pine: settings.pine ?? '', oak: settings.oak ?? '' };
        const signature = `${paths.pine}|${paths.oak}`;
        if (signature === treeAssetSignature) return;
        treeAssetSignature = signature;
        const loadId = ++treeAssetLoadId;
        if (!paths.pine && !paths.oak) { terrain.resetTreeModels(); return; }
        Promise.all(Object.entries(paths).map(async ([kind, path]) => {
            if (!path) return [kind, null];
            const gltf = await loadModelAsset(path);
            return [kind, gltf.scene];
        })).then((entries) => {
            if (loadId !== treeAssetLoadId) return;
            const models = Object.fromEntries(entries);
            if (!terrain.setTreeModels(models)) throw new Error('Os modelos enviados não contêm malhas 3D.');
            console.info(`Modelos de árvores aplicados: ${terrain.treePlacementCount} posições · pinheiro ${paths.pine || '(procedural)'} · carvalho ${paths.oak || '(procedural)'}`);
        }).catch((error) => {
            if (loadId !== treeAssetLoadId) return;
            treeAssetSignature = null;
            console.error('Falha ao carregar os modelos das árvores:', error);
            toast('NÃO FOI POSSÍVEL CARREGAR O MODELO DE ÁRVORE');
        });
    }
    // ---- ZONAS FIXAS + BANDOS (comida -> água -> descanso) ----
    // As zonas são geradas do relevo/rio (sem admin). Os anéis só aparecem
    // em modo desenvolvedor (?zonas=1 ou tecla V) ou quando a mecânica pede.
    const zones = buildFixedZones();
    const wildlife = createWildlife({ zones });
    const zoneMarkers = createZoneMarkers(scene, zones, { heightAt: (x, z) => terrain.heightAt(x, z) });
    let devZones = false;
    try { devZones = new URLSearchParams(location.search).has('zonas'); } catch { }
    zoneMarkers.setDevMode(devZones);
    let wildlifeSyncAt = 0;
    const player = { velocity: new THREE.Vector3(), keys: new Set(), yaw: 0, pitch: 0, crouch: false, animals: [], active: false, lastPointerX: null, lastPointerY: null, volume: 0.35, mouseSensitivity: 1, audio: null, money: 0, decoys: { deer: 0, boar: 0, bird: 0 }, equippedDecoy: '', stats: { kills: 0, animalsCollected: 0, totalEarned: 0, distance: 0 }, profileCode: null, stepTimer: 0 };
    const weapon = createWeapon(camera, DEFAULT_WEAPON);
    const binocularSocket = new THREE.Group();
    binocularSocket.name = 'BinocularSocket';
    binocularSocket.position.set(0, -0.34, -0.52);
    binocularSocket.scale.setScalar(0.82);
    binocularSocket.visible = false;
    camera.add(binocularSocket);
    let binocularLoad = null;
    let binocularsActive = false;
    let binocularZoom = 4;
    let scopeWasActive = false;
    // The scope is a second scene pass. Keep its target deliberately small and
    // update it less often so opening the overlay never forces a full-size stall.
    let scopeRenderAccumulator = 1 / 15;
    let scopeTargetReady = false;
    const scopeTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    const scopeCamera = camera.clone();
    const scopeOverlayScene = new THREE.Scene();
    const scopeOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    scopeOverlayCamera.position.z = 1;
    const scopeOverlayMaterial = new THREE.ShaderMaterial({
        uniforms: { uScopeTexture: { value: scopeTarget.texture }, uAspect: { value: 1 }, uRadius: { value: 0.46 } },
        vertexShader: `varying vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `uniform sampler2D uScopeTexture;
            uniform float uAspect;
            uniform float uRadius;
            varying vec2 vUv;
            void main() {
                vec2 d = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
                if (length(d) > uRadius) discard;
                vec2 scopeUv = vec2(d.x / uRadius * 0.5 + 0.5, d.y / uRadius * 0.5 + 0.5);
                gl_FragColor = texture2D(uScopeTexture, scopeUv);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`,
        depthTest: false, depthWrite: false, transparent: true, toneMapped: true,
    });
    scopeOverlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), scopeOverlayMaterial));
    function compositeScopeView() {
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, innerWidth, innerHeight);
        scopeOverlayMaterial.uniforms.uAspect.value = innerWidth / Math.max(1, innerHeight);
        renderer.autoClear = false;
        renderer.render(scopeOverlayScene, scopeOverlayCamera);
        renderer.autoClear = true;
    }
    function renderScopeView(dt) {
        if (!weapon.aiming || binocularsActive) return;
        scopeRenderAccumulator += dt;
        if (scopeTargetReady && scopeRenderAccumulator < 1 / 15) { compositeScopeView(); return; }
        scopeRenderAccumulator = 0;
        const width = renderer.domElement.width;
        const height = renderer.domElement.height;
        const side = Math.max(1, Math.min(width, height, 384));
        if (scopeTarget.width !== side || scopeTarget.height !== side) scopeTarget.setSize(side, side);
        scopeCamera.position.copy(camera.position);
        scopeCamera.quaternion.copy(camera.quaternion);
        scopeCamera.fov = weapon.aimFov;
        scopeCamera.aspect = 1;
        scopeCamera.updateProjectionMatrix();
        const modelVisible = weapon.modelRoot.visible;
        const armsVisible = weapon.arms.visible;
        weapon.modelRoot.visible = false;
        weapon.arms.visible = false;
        renderer.setRenderTarget(scopeTarget);
        renderer.render(scene, scopeCamera);
        weapon.modelRoot.visible = modelVisible;
        weapon.arms.visible = armsVisible;
        scopeTargetReady = true;
        compositeScopeView();
    }
    function setBinocularMode(enabled) {
        binocularsActive = enabled;
        binocularSocket.visible = enabled;
        weapon.modelRoot.visible = !enabled;
        weapon.arms.visible = !enabled;
        weapon.setAim(false);
        root.querySelector('.crosshair').hidden = enabled;
        root.querySelector('#binocular-overlay').hidden = !enabled;
        root.querySelector('#weapon-name').textContent = enabled ? 'BINÓCULO' : 'HUNTING RIFLE';
        root.querySelector('#ammo').hidden = enabled;
        root.querySelector('#status').textContent = enabled ? `OBSERVAÇÃO · ZOOM ${binocularZoom}×` : 'PRONTO';
    }
    function changeBinocularZoom(direction) {
        if (!binocularsActive) return;
        binocularZoom = THREE.MathUtils.clamp(binocularZoom + direction, 2, 12);
        root.querySelector('#status').textContent = `OBSERVAÇÃO · ZOOM ${binocularZoom}×`;
    }
    async function toggleBinoculars() {
        if (binocularsActive) { setBinocularMode(false); toast('RIFLE EQUIPADO'); return; }
        if (!binocularLoad) {
            binocularLoad = import('../admin/glb.js').then(({ importModel }) => importModel('./assets/binoculars.glb', renderer)).then((gltf) => {
                const model = gltf.scene;
                const bounds = new THREE.Box3().setFromObject(model);
                model.position.sub(bounds.getCenter(new THREE.Vector3()));
                model.rotation.y = Math.PI;
                binocularSocket.add(model);
                return model;
            }).catch((error) => { binocularLoad = null; throw error; });
        }
        try {
            await binocularLoad;
            if (!player.active) return;
            setBinocularMode(true);
        } catch (error) { console.error('Falha ao carregar binóculo:', error); toast('NÃO FOI POSSÍVEL CARREGAR O BINÓCULO'); }
    }
    let spawnData = [];
    let animalCatalog = [];
    const footstepPaths = Array.from({ length: 6 }, (_, index) => `./audio/footsteps/${String(index + 1).padStart(2, '0')}-footstep.ogg`);
    let footstepClips = null;
    let footstepIndex = -1;
    let rifleShotClips = null;
    let rifleShotIndex = 0;
    function playRifleShot() {
        rifleShotClips ??= Array.from({ length: 3 }, () => { const audio = new Audio('./audio/gunshots/rifle-mosin-short.wav'); audio.preload = 'auto'; return audio; });
        const clip = rifleShotClips[rifleShotIndex];
        rifleShotIndex = (rifleShotIndex + 1) % rifleShotClips.length;
        clip.volume = Math.max(0, Math.min(1, player.volume * 0.75));
        clip.currentTime = 0;
        clip.play().catch(() => {});
    }
    function updateFootsteps(dt, walking, running) {
        if (!walking) { player.stepTimer = 0; return; }
        player.stepTimer -= dt;
        if (player.stepTimer > 0) return;
        player.stepTimer = running ? 0.34 : player.crouch ? 0.68 : 0.49;
        footstepClips ??= footstepPaths.map((path) => { const audio = new Audio(path); audio.preload = 'auto'; return audio; });
        let nextIndex = Math.floor(Math.random() * footstepClips.length);
        if (nextIndex === footstepIndex) nextIndex = (nextIndex + 1) % footstepClips.length;
        footstepIndex = nextIndex;
        const clip = footstepClips[footstepIndex];
        clip.volume = Math.max(0, Math.min(1, player.volume * (player.crouch ? 0.35 : running ? 0.8 : 0.62)));
        clip.currentTime = 0;
        clip.play().catch(() => {});
    }
    function updateAnimalSound(animal, dt) {
        if (animal.dead || !animal.soundPath) return;
        animal.soundTimer = (animal.soundTimer ?? (12 + Math.random() * 18)) - dt;
        if (animal.soundTimer > 0) return;
        animal.soundTimer = 18 + Math.random() * 28;
        const distance = camera.position.distanceTo(animal.group.position);
        if (distance > 220 || Math.random() > 0.55) return;
        const source = `./${animal.soundPath}`;
        if (!animal.soundAudio || animal.soundAudio.dataset.source !== source) {
            animal.soundAudio?.pause();
            animal.soundAudio = new Audio(source);
            animal.soundAudio.preload = 'none';
            animal.soundAudio.dataset.source = source;
        }
        animal.soundAudio.volume = Math.max(0, Math.min(0.45, 0.45 * (1 - distance / 220)));
        animal.soundAudio.currentTime = 0;
        animal.soundAudio.play().catch(() => {});
    }
    // Sistema de spawn / respawn: o mapa NUNCA pode ficar sem animais.
    // - Cada abate (morte) agenda 1 reposição após RESPAWN_DELAY_SECONDS.
    // - Cada coleta (E) remove o corpo mas já deixou reposição agendada na morte;
    //   se o corpo sumir sem morte registrada, agenda aqui também.
    // - Garantia global: se vivos < MIN_ALIVE_ANIMALS, repõe perto do jogador.
    let gameTime = 0;
    let spawnCounter = 0;
    let loadedWeaponModelPath = '';
    let respawnQueue = [];
    let lastGlobalRespawn = -10;
    let lastAmbientCull = -10;
    let lastProfileSaveAt = 0;
    let lastSpawnCheckAt = 0;
    let lastHudCoordinateAt = 0;
    let profileSaveTimer = null;
    async function applyCatalog(data) {
        if (!data) return;
        updateTreeModels(data.vegetation ?? {});
        const previous = new Map(spawnData.map((spawn) => [spawn.id, spawn]));
        const previousCatalog = new Map(animalCatalog.map((animal) => [Number(animal.id), animal]));
        spawnData = data.spawns ?? [];
        for (const spawn of spawnData) {
            const old = previous.get(spawn.id);
            if (old) {
                spawn._loaded = old._loaded;
                spawn._animals = old._animals;
                const currentSpecies = (data.animals ?? []).find((animal) => Number(animal.id) === Number(spawn.animal_id));
                const oldSpecies = previousCatalog.get(Number(spawn.animal_id));
                // Se o animal foi trocado/desativado ou o modelPath mudou no admin,
                // descarta os bichos antigos para respawnar com o modelo novo.
                if (currentSpecies?.modelPath !== oldSpecies?.modelPath
                    || Boolean(currentSpecies?.active) !== Boolean(oldSpecies?.active)
                    || Number(old?.animal_id) !== Number(spawn.animal_id)) {
                    for (const animal of spawn._animals ?? []) scene.remove(animal.group);
                    const removed = new Set(spawn._animals ?? []);
                    player.animals = player.animals.filter((animal) => !removed.has(animal));
                    spawn._animals = [];
                    spawn._loaded = false;
                }
            }
        }
        animalCatalog = data.animals ?? [];
        const activeWeapon = data.weapons?.find((item) => item.active) ?? data.weapons?.[0];
        if (activeWeapon) {
            weapon.configure(activeWeapon);
            weapon.setAmmo(activeWeapon.magazineSize, activeWeapon.reserveAmmo);
            root.querySelector('#weapon-name').textContent = activeWeapon.name.toUpperCase();
            updateAmmo();
            if (activeWeapon.modelPath && activeWeapon.modelPath !== loadedWeaponModelPath) {
                const path = activeWeapon.modelPath;
                loadedWeaponModelPath = path;
                cloneModelAsset(path).then((gltf) => {
                    if (loadedWeaponModelPath === path) weapon.setModel(gltf);
                }).catch(() => { loadedWeaponModelPath = ''; toast('Não foi possível carregar o GLB da arma'); });
            }
        }
        // Troca o modelo dos animais já spawnados (procedurais) pelo GLB novo/editado no admin,
        // sem precisar de F5: atualiza quem ainda está procedural ("Corpo") OU cujo modelo mudou.
        for (const spawn of spawnData) {
            if (!spawn._loaded || !spawn._animals?.length) continue;
            const species = animalCatalog.find((animal) => Number(animal.id) === Number(spawn.animal_id));
            if (!species?.modelPath || species.active === false) {
                if (species && !species.modelPath) toast(`SEM MODELO · ${species.name} sem GLB no admin`);
                continue;
            }
            for (const animal of spawn._animals) {
                animal.animationConfig = species.animationConfig ?? {};
                animal.isBird = String(animal.animationConfig.type ?? '').toUpperCase() === 'AVE';
                animal.walkSpeed = Number(species.speed) || animal.walkSpeed;
                animal.runSpeed = Number(species.runSpeed) || animal.runSpeed;
                animal.fleeSpeed = Number(species.fleeSpeed) || animal.runSpeed;
                animal.detectionDistance = Number(species.detectionDistance) || animal.detectionDistance;
                animal.fleeDistance = Number(species.fleeDistance) || animal.fleeDistance;
                animal.soundPath = species.soundPath ?? '';
                const isProcedural = animal.group.children.some((child) => child.name === 'Corpo');
                const outdated = animal.modelPath !== species.modelPath;
                if (animal.dead) continue;
                if (!isProcedural && !outdated) { animal.playState(animal.state); continue; }
                loadAnimalModel(animal, species);
            }
        }
        // Sem spawn no mapa: usa os animais do catálogo (com GLB) como fallback
        // em vez de ficar só no veado procedural.
        if (animalCatalog.length) {
            for (const wild of [...player.animals]) {
                const id = String(wild.id);
                if (id.startsWith('wild-') || (id.startsWith('catalog-') && !wild.dead)) {
                    scene.remove(wild.group);
                    player.animals = player.animals.filter((animal) => animal !== wild);
                }
            }
            if (!spawnData.length) {
                const withModel = animalCatalog.filter((animal) => animal.modelPath);
                const source = withModel.length ? withModel : animalCatalog;
                source.forEach((species, index) => {
                    const [x, z] = fallbackPositions[index % fallbackPositions.length];
                    const animal = createAnimal(scene, { id: `catalog-${species.id}-${index}`, name: species.name, position: new THREE.Vector3(x, terrain.heightAt(x, z), z), seed: x * 9 + z + index, settings: species });
                    animal.animalTypeId = species.id;
                    animal.modelHeight = Number(species.height) || 2.1;
                    animal.modelPath = species.modelPath ?? '';
                    animal.soundPath = species.soundPath ?? '';
                    player.animals.push(animal);
                    if (species.modelPath) loadAnimalModel(animal, species);
                });
            }
        }
        restorePersistedDeaths(data.deadAnimals ?? []);
    }
    function refreshCatalog() {
        return fetch('./api/').then((r) => r.ok ? r.json() : null).then((data) => applyCatalog(data)).catch(() => { });
    }
    const fallbackPositions = [[46, 14], [-72, -36], [124, 88], [-155, 105], [210, -66], [290, 160]];
    for (const [x, z] of fallbackPositions) {
        const wild = createAnimal(scene, { id: `wild-${x}-${z}`, name: 'Veado-vermelho', position: new THREE.Vector3(x, terrain.heightAt(x, z), z), seed: x * 9 + z });
        wild._spawnId = null; wild._deathAt = 0; wild._respawnQueued = false;
        player.animals.push(wild);
    }
    function loadAnimalModel(animal, species) {
        if (!species?.modelPath || animal._loadingModelPath === species.modelPath) return;
        animal._loadingModelPath = species.modelPath;
        animal.modelPath = species.modelPath;
        cloneModelAsset(species.modelPath).then((gltf) => { animal.setModel(gltf, species.height); animal.modelPath = species.modelPath; }).catch((error) => { animal._loadingModelPath = null; toast(`${species.name}: ${error.message}`); });
    }
    function makeAnimal({ spawn, x, z, species, idSuffix, instanceId = null }) {
        spawnCounter += 1;
        const uniqueSuffix = `${Date.now().toString(36)}-${spawnCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const id = instanceId ?? (spawn ? `${spawn.id}-${idSuffix ?? uniqueSuffix}` : `wild-respawn-${uniqueSuffix}`);
        const baseScale = Number(species?.scale) || 1;
        const spawnScale = Number(spawn?.scale) || 1;
        const settings = species ? { ...species, scale: baseScale * spawnScale, rotationY: spawn?.rotation_y ?? species.rotationY ?? 0 } : {};
        const animal = createAnimal(scene, { id, name: species?.name ?? spawn?.name ?? 'Veado-vermelho', position: new THREE.Vector3(x, terrain.heightAt(x, z), z), seed: (spawnCounter * 13.7) + x, settings });
        animal.modelPath = species?.modelPath ?? '';
        animal.soundPath = species?.soundPath ?? '';
        animal.soundTimer = 12 + Math.random() * 18;
        animal._spawnId = spawn?.id ?? null;
        animal._deathAt = 0;
        animal._respawnQueued = false;
        animal.animalTypeId = species?.id ?? spawn?.animal_id ?? null;
        animal.modelHeight = Number(species?.height) || 2.1;
        if (species?.modelPath) loadAnimalModel(animal, species);
        return animal;
    }
    function restorePersistedDeaths(records = []) {
        for (const record of records) {
            const instanceId = String(record.instanceId ?? '');
            if (!instanceId) continue;
            const existing = player.animals.find((animal) => animal.id === instanceId);
            if (existing?.dead) continue;
            if (existing) {
                scene.remove(existing.group);
                player.animals = player.animals.filter((animal) => animal !== existing);
                for (const item of spawnData) if (item._animals) item._animals = item._animals.filter((animal) => animal !== existing);
            }
            const spawn = spawnData.find((item) => Number(item.id) === Number(record.spawnId)) ?? null;
            const catalogSpecies = animalCatalog.find((item) => Number(item.id) === Number(record.animalId)) ?? null;
            const species = {
                ...(catalogSpecies ?? {}),
                id: record.animalId ?? catalogSpecies?.id,
                name: record.name || catalogSpecies?.name || 'Animal',
                modelPath: record.modelPath || catalogSpecies?.modelPath || '',
                height: Number(record.height) || catalogSpecies?.height || 2.1,
                scale: Number(record.scale) || 1,
                weight: Number(record.weight) || catalogSpecies?.weight || 75,
                rotationY: Number(record.rotationY) || 0,
                animationConfig: record.animationConfig ?? catalogSpecies?.animationConfig ?? {},
            };
            const corpse = makeAnimal({ spawn: null, x: Number(record.x) || 0, z: Number(record.z) || 0, species, instanceId });
            corpse._spawnId = spawn?.id ?? record.spawnId ?? null;
            corpse.dead = true; corpse.health = 0; corpse.state = 'DEAD';
            corpse.deathTime = 0.7; corpse.groundY = corpse.group.position.y;
            corpse.hitRegion = record.hitRegion || 'Corpo';
            corpse.hitDistance = Number(record.hitDistance) || 0;
            corpse._deathAt = gameTime - Math.max(0, Number(record.ageSeconds) || 0);
            corpse._deathRecordId = instanceId;
            corpse._deathPersistenceStarted = true;
            corpse._respawnQueued = true;
            corpse.applyDeathPose(1);
            player.animals.push(corpse);
            if (spawn) { spawn._animals ??= []; spawn._animals.push(corpse); }
        }
    }
    function persistAnimalDeath(animal) {
        if (animal._deathPersistenceStarted || gameTime < (animal._deathPersistenceRetryAt ?? 0)) return;
        animal._deathPersistenceStarted = true;
        const spawn = spawnData.find((item) => Number(item.id) === Number(animal._spawnId))
            ?? spawnData.find((item) => (item._animals ?? []).includes(animal)) ?? null;
        animal._deathRecordId = String(animal.id);
        const payload = {
            instanceId: animal._deathRecordId,
            spawnId: spawn?.id ?? null,
            animalId: animal.animalTypeId ?? spawn?.animal_id ?? null,
            name: animal.name,
            modelPath: animal.modelPath ?? '',
            x: animal.group.position.x, y: animal.groundY ?? animal.group.position.y, z: animal.group.position.z,
            rotationY: animal.group.rotation.y,
            scale: animal.group.scale.x,
            height: animal.modelHeight ?? 2.1,
            weight: animal.weight,
            hitRegion: animal.hitRegion,
            hitDistance: animal.hitDistance,
            animationConfig: animal.animationConfig ?? {},
        };
        animal._deathSavePromise = fetch('./api/?action=death', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true,
        }).then((response) => { if (!response.ok) throw new Error('save failed'); animal._deathRecordSaved = true; }).catch(() => { animal._deathPersistenceStarted = false; animal._deathPersistenceRetryAt = gameTime + 5; });
    }
    function removePersistedDeath(animal) {
        const instanceId = animal._deathRecordId ?? animal.id;
        if (!instanceId) return;
        Promise.resolve(animal._deathSavePromise).catch(() => {}).then(() => fetch(`./api/?action=death&id=${encodeURIComponent(instanceId)}`, { method: 'DELETE', keepalive: true })).catch(() => {});
    }
    function scheduleRespawn(animal, spawnOrNull) {
        const position = animal?.group?.position;
        respawnQueue.push({
            dueAt: gameTime + RESPAWN_DELAY_SECONDS,
            spawnId: spawnOrNull?.id ?? null,
            animalId: animal?.animalTypeId ?? spawnOrNull?.animal_id ?? null,
            fromX: Number(position?.x ?? spawnOrNull?.x ?? camera.position.x),
            fromZ: Number(position?.z ?? spawnOrNull?.z ?? camera.position.z),
        });
    }
    function pickSpecies() {
        const withModel = animalCatalog.filter((a) => a.modelPath && a.active !== false);
        const active = animalCatalog.filter((a) => a.active !== false);
        const pool = withModel.length ? withModel : (active.length ? active : animalCatalog);
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    function watchDeaths() {
        for (const animal of player.animals) {
            if (animal.dead && !animal._deathPersistenceStarted) persistAnimalDeath(animal);
            if (animal.dead && !animal._respawnQueued) {
                animal._respawnQueued = true;
                animal._deathAt = gameTime;
                let spawn = spawnData.find((s) => s.id === animal._spawnId) ?? null;
                if (!spawn) spawn = spawnData.find((s) => (s._animals ?? []).includes(animal)) ?? null;
                if (spawn && !(spawn._animals ?? []).includes(animal)) { spawn._animals ??= []; spawn._animals.push(animal); animal._spawnId = spawn.id; }
                scheduleRespawn(animal, spawn);
            }
        }
    }
    function spawnOneFromQueue(entry) {
        const alive = aliveCount(player.animals);
        if (alive >= MAX_ANIMALS_TOTAL) return false;
        const origin = spawnData.find((spawn) => String(spawn.id) === String(entry.spawnId)) ?? null;
        const animalId = entry.animalId ?? origin?.animal_id;
        const spawn = pickAlternateSpawnSite(spawnData, {
            originId: entry.spawnId,
            animalId,
            fromX: Number(entry.fromX ?? origin?.x ?? camera.position.x),
            fromZ: Number(entry.fromZ ?? origin?.z ?? camera.position.z),
            playerX: camera.position.x,
            playerZ: camera.position.z,
        });
        if (spawn) {
            if (aliveForSpawn(spawn) >= desiredForSpawn(spawn) && alive >= MIN_ALIVE_ANIMALS) return true;
            const species = animalCatalog.find((animal) => Number(animal.id) === Number(spawn.animal_id)) ?? pickSpecies();
            const radius = Number(spawn.radius) || 220;
            const pos = pickRespawnPosition({ spawnX: Number(spawn.x), spawnZ: Number(spawn.z), radius, playerX: camera.position.x, playerZ: camera.position.z, minDist: Math.min(RESPAWN_MIN_DISTANCE, radius * 0.8) });
            const x = THREE.MathUtils.clamp(pos.x, -3950, 3950);
            const z = THREE.MathUtils.clamp(pos.z, -3950, 3950);
            const animal = makeAnimal({ spawn, x, z, species });
            spawn._animals ??= []; spawn._animals.push(animal);
            spawn._loaded = true;
            player.animals.push(animal);
            return true;
        }
        const species = animalCatalog.find((animal) => Number(animal.id) === Number(animalId)) ?? pickSpecies();
        const pos = pickGlobalRespawnPosition({ playerX: camera.position.x, playerZ: camera.position.z, minD: 140, maxD: 260 });
        const x = THREE.MathUtils.clamp(pos.x, -3950, 3950);
        const z = THREE.MathUtils.clamp(pos.z, -3950, 3950);
        player.animals.push(makeAnimal({ spawn: null, x, z, species }));
        return true;
    }
    function processRespawnQueue() {
        if (!respawnQueue.length) return;
        const remaining = [];
        for (const entry of respawnQueue) {
            if (Number(entry.dueAt) > gameTime) { remaining.push(entry); continue; }
            const ok = spawnOneFromQueue(entry);
            if (!ok) remaining.push({ ...entry, dueAt: gameTime + 2 });
        }
        respawnQueue = remaining;
    }
    function ensureGlobalMinimum() {
        // Mantém população próxima em vez de contar animais espalhados pelo mapa inteiro.
        const encounterRadius = 750;
        if (gameTime - lastAmbientCull >= 5) {
            lastAmbientCull = gameTime;
            const keep = [];
            for (const animal of player.animals) {
                const distance = Math.hypot(animal.group.position.x - camera.position.x, animal.group.position.z - camera.position.z);
                if (!animal.dead && animal._spawnId == null && distance > 1500) { scene.remove(animal.group); wildlife.release(animal); }
                else keep.push(animal);
            }
            player.animals = keep;
        }
        const nearbyAlive = player.animals.filter((animal) => !animal.dead && Math.hypot(animal.group.position.x - camera.position.x, animal.group.position.z - camera.position.z) <= encounterRadius).length;
        const missing = Math.max(0, MIN_ALIVE_ANIMALS - nearbyAlive);
        if (missing <= 0 || gameTime - lastGlobalRespawn < 2) return;
        if (aliveCount(player.animals) >= MAX_ANIMALS_TOTAL) return;
        const species = pickSpecies();
        if (!species) return;
        const forward = camera.getWorldDirection(new THREE.Vector3());
        let center = null;
        // Cria animais fora do campo de visão para evitar aparição instantânea na frente do jogador.
        for (let attempt = 0; attempt < 14; attempt += 1) {
            const candidate = pickGlobalRespawnPosition({ playerX: camera.position.x, playerZ: camera.position.z, minD: 150, maxD: 230 });
            const dx = candidate.x - camera.position.x; const dz = candidate.z - camera.position.z;
            const dot = (dx * forward.x + dz * forward.z) / Math.max(1, Math.hypot(dx, dz));
            center = candidate;
            if (dot < 0.18) break;
        }
        const herdSize = Math.min(GLOBAL_RESPAWN_THROTTLE, missing, MAX_ANIMALS_TOTAL - aliveCount(player.animals));
        for (let i = 0; i < herdSize; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 12 + Math.random() * 34;
            const x = THREE.MathUtils.clamp(center.x + Math.cos(angle) * distance, -3950, 3950);
            const z = THREE.MathUtils.clamp(center.z + Math.sin(angle) * distance, -3950, 3950);
            player.animals.push(makeAnimal({ spawn: null, x, z, species }));
        }
        lastGlobalRespawn = gameTime;
    }
    function cleanupOldCorpses() {
        let changed = false;
        for (const animal of [...player.animals]) {
            if (!animal.dead) continue;
            const age = gameTime - Number(animal._deathAt ?? gameTime);
            if (age < MAX_DEAD_AGE_SECONDS) continue;
            removePersistedDeath(animal);
            scene.remove(animal.group);
            player.animals = player.animals.filter((a) => a !== animal);
            for (const spawn of spawnData) if (spawn._animals) spawn._animals = spawn._animals.filter((a) => a !== animal);
            changed = true;
        }
        if (changed) { /* corpos antigos removidos; reposição já foi agendada na morte */ }
        respawnQueue = removeDueRespawns(respawnQueue, gameTime - 3600);
    }
    const aimRaycaster = new THREE.Raycaster();
    const binocularDirection = new THREE.Vector3();
    const binocularToAnimal = new THREE.Vector3();
    let binocularScanAt = 0;
    function updateBinocularTarget() {
        if (!binocularsActive || gameTime - binocularScanAt < 0.15) return;
        binocularScanAt = gameTime;
        camera.getWorldDirection(binocularDirection);
        let target = null; let targetDistance = Infinity;
        for (const animal of player.animals) {
            const group = animal.group;
            binocularToAnimal.set(group.position.x - camera.position.x, group.position.y + Math.max(0.6, (Number(animal.modelHeight) || 2.1) * 0.48) - camera.position.y, group.position.z - camera.position.z);
            const distanceSq = binocularToAnimal.lengthSq();
            const along = binocularToAnimal.dot(binocularDirection);
            if (along <= 0 || along > 1400 || distanceSq > 1400 * 1400) continue;
            const lateralSq = Math.max(0, distanceSq - along * along);
            const targetRadius = Math.max(0.8, (Number(animal.modelHeight) || 2.1) * (Number(group.scale.x) || 1) * 0.28);
            if (lateralSq > targetRadius * targetRadius || along >= targetDistance) continue;
            target = animal; targetDistance = along;
        }
        const card = root.querySelector('#binocular-info');
        card.hidden = !target;
        if (!target) return;
        const species = animalCatalog.find((entry) => Number(entry.id) === Number(target.animalTypeId));
        const states = { IDLE: 'PARADO', WALK: 'ANDANDO', MOVE: 'ANDANDO', RUN: 'CORRENDO', FLEE: 'FUGINDO', TURN: 'VIRANDO', ALERT: 'ALERTA', GRAZE: 'PASTANDO', DRINK: 'BEBENDO', REST: 'DESCANSANDO' };
        root.querySelector('#binocular-animal-name').textContent = target.name || 'Animal';
        root.querySelector('#binocular-animal-species').textContent = species?.species || target.name || 'Silvestre';
        root.querySelector('#binocular-animal-distance').textContent = `${Math.round(targetDistance)} m`;
        root.querySelector('#binocular-animal-weight').textContent = `${Math.round(Number(target.weight) || Number(species?.weight) || 0)} kg`;
        root.querySelector('#binocular-animal-state').textContent = target.dead ? 'MORTO' : (states[target.state] || 'SILVESTRE');
    }
    const clock = new THREE.Clock();
    let shown = true;
    let toastTimer;
    const toast = (message) => {
        const element = root.querySelector('#toast');
        element.textContent = message;
        element.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove('visible'), 2300);
    };
    const updateAmmo = () => { root.querySelector('#ammo').textContent = `${weapon.ammo} / ${weapon.reserve}`; };
    const updateMoney = () => { root.querySelector('#money').textContent = `R$ ${Math.round(player.money).toLocaleString('pt-BR')}`; };
    updateMoney();
    // Adota os animais novos / libera os que saíram do mapa.
    function profileSnapshot() {
        return {
            money: player.money,
            decoys: { ...player.decoys },
            equippedDecoy: player.equippedDecoy,
            totalEarned: player.stats.totalEarned,
            kills: player.stats.kills,
            animalsCollected: player.stats.animalsCollected,
            distance: player.stats.distance,
            position: { x: camera.position.x, z: camera.position.z },
            yaw: player.yaw,
            pitch: player.pitch,
        };
    }
    function applyPlayerProfile(profile = {}) {
        player.money = Math.max(0, Number(profile.money) || 0);
        player.decoys = Object.fromEntries(['deer', 'boar', 'bird'].map((type) => [type, Math.max(0, Math.floor(Number(profile.decoys?.[type]) || 0))]));
        player.equippedDecoy = ['deer', 'boar', 'bird'].includes(profile.equippedDecoy) && player.decoys[profile.equippedDecoy] > 0 ? profile.equippedDecoy : '';
        player.stats = {
            kills: Math.max(0, Number(profile.kills) || 0),
            animalsCollected: Math.max(0, Number(profile.animalsCollected) || 0),
            totalEarned: Math.max(0, Number(profile.totalEarned) || 0),
            distance: Math.max(0, Number(profile.distance) || 0),
        };
        const savedX = Number(profile.position?.x); const savedZ = Number(profile.position?.z);
        const x = THREE.MathUtils.clamp(Number.isFinite(savedX) ? savedX : 0, -3950, 3950);
        const z = THREE.MathUtils.clamp(Number.isFinite(savedZ) ? savedZ : 18, -3950, 3950);
        camera.position.set(x, terrain.heightAt(x, z) + 1.72, z);
        player.yaw = Number(profile.yaw) || 0;
        player.pitch = THREE.MathUtils.clamp(Number(profile.pitch) || 0, -1.35, 1.35);
        updateMoney();
        updateDecoyQuickbar();
    }
    async function savePlayerProfile(keepalive = false) {
        if (!player.profileCode) return;
        try {
            const response = await fetch('./api/?action=profile', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: player.profileCode, profile: profileSnapshot() }), keepalive,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (!keepalive) root.querySelector('#profile-status').textContent = 'Progresso salvo no servidor.';
        } catch (error) {
            if (!keepalive) { console.error('Falha ao salvar perfil:', error); toast('NÃO FOI POSSÍVEL SALVAR O PERFIL'); }
        }
    }
    function scheduleProfileSave() {
        if (!player.profileCode) return;
        clearTimeout(profileSaveTimer);
        profileSaveTimer = setTimeout(() => savePlayerProfile(), 350);
    }
    const decoyItems = [
        { id: 'deer', name: 'Chamador de cervos', species: 'deer', price: 450, key: '1', tone: 420 },
        { id: 'boar', name: 'Chamador de javalis', species: 'boar', price: 600, key: '2', tone: 185 },
        { id: 'bird', name: 'Chamador de aves', species: 'bird', price: 350, key: '3', tone: 760 },
    ];
    function updateDecoyQuickbar() {
        const quickbar = root.querySelector('#decoy-quickbar');
        if (!quickbar) return;
        for (const [index, item] of decoyItems.entries()) {
            const button = quickbar.querySelector(`[data-decoy-slot="${index}"]`);
            button.classList.toggle('equipped', player.equippedDecoy === item.id);
            button.querySelector('span').textContent = player.decoys[item.id] > 0 ? `${item.name.replace('Chamador de ', '').toUpperCase()} ×${player.decoys[item.id]}` : 'SEM ITEM';
            button.disabled = player.decoys[item.id] < 1;
        }
    }
    function closeDecoyDialog() {
        root.querySelector('#game-dialog').hidden = true;
    }
    function showDecoyDialog(mode) {
        const dialog = root.querySelector('#game-dialog');
        weapon.setAim(false);
        if (document.pointerLockElement) document.exitPointerLock();
        dialog.hidden = false;
        const isShop = mode === 'shop';
        const content = decoyItems.map((item) => {
            const quantity = player.decoys[item.id];
            const selected = player.equippedDecoy === item.id;
            return `<article class="decoy-card"><div><strong>${item.name}</strong><small>${quantity} ${quantity === 1 ? 'unidade' : 'unidades'} · Atalho ${item.key}</small></div>${isShop
                ? `<button class="decoy-action" data-buy-decoy="${item.id}" ${player.money < item.price ? 'disabled' : ''}>COMPRAR · R$ ${item.price.toLocaleString('pt-BR')}</button>`
                : `<button class="decoy-action" data-equip-decoy="${item.id}" ${quantity < 1 ? 'disabled' : ''}>${selected ? 'EQUIPADO' : 'EQUIPAR'}</button>`}</article>`;
        }).join('');
        dialog.innerHTML = `<div class="game-dialog-panel decoy-panel"><button class="icon-button dialog-close" aria-label="Fechar">×</button><span class="eyebrow">${isShop ? 'EQUIPAMENTO DE CAMPO' : 'EQUIPAMENTO DO CAÇADOR'}</span><h2>${isShop ? 'Loja de chamarizes' : 'Inventário'}</h2><p>${isShop ? `Saldo disponível: R$ ${Math.round(player.money).toLocaleString('pt-BR')}. A compra equipa o chamariz automaticamente.` : 'Equipe um chamariz aqui ou use as teclas 1, 2 e 3 para chamar os animais.'}</p><div class="decoy-list">${content}</div></div>`;
        dialog.querySelector('.dialog-close').onclick = closeDecoyDialog;
        dialog.querySelectorAll('[data-buy-decoy]').forEach((button) => button.addEventListener('click', () => {
            const item = decoyItems.find((entry) => entry.id === button.dataset.buyDecoy);
            if (!item || player.money < item.price) return;
            player.money -= item.price;
            player.decoys[item.id] += 1;
            player.equippedDecoy = item.id;
            updateMoney(); updateDecoyQuickbar(); scheduleProfileSave();
            showDecoyDialog('shop');
            toast(`${item.name.toUpperCase()} COMPRADO E EQUIPADO`);
        }));
        dialog.querySelectorAll('[data-equip-decoy]').forEach((button) => button.addEventListener('click', () => {
            const item = decoyItems.find((entry) => entry.id === button.dataset.equipDecoy);
            if (!item || player.decoys[item.id] < 1) return;
            player.equippedDecoy = item.id;
            updateDecoyQuickbar(); scheduleProfileSave(); showDecoyDialog('inventory');
        }));
    }
    function playDecoyCall(item) {
        try {
            player.audio ??= new AudioContext();
            if (player.audio.state === 'suspended') player.audio.resume();
            const audio = player.audio;
            for (let pulse = 0; pulse < 3; pulse += 1) {
                const start = audio.currentTime + pulse * 0.22;
                const oscillator = audio.createOscillator(); const gain = audio.createGain();
                oscillator.type = item.species === 'bird' ? 'sine' : 'triangle';
                oscillator.frequency.setValueAtTime(item.tone, start);
                oscillator.frequency.exponentialRampToValueAtTime(item.tone * (pulse % 2 ? 0.82 : 1.12), start + 0.16);
                gain.gain.setValueAtTime(0.0001, start); gain.gain.linearRampToValueAtTime(0.08 * player.volume, start + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
                oscillator.connect(gain).connect(audio.destination); oscillator.start(start); oscillator.stop(start + 0.18);
            }
        } catch { }
    }
    function activateDecoy(id) {
        const item = decoyItems.find((entry) => entry.id === id);
        if (!item || player.decoys[item.id] < 1) { toast('COMPRE ESSE CHAMARIZ NA LOJA · TECLA L'); return; }
        player.equippedDecoy = item.id;
        updateDecoyQuickbar(); scheduleProfileSave();
        playDecoyCall(item);
        const count = wildlife.callAnimals(camera.position.x, camera.position.z, { radius: 900, species: item.species });
        toast(count ? `${item.name.toUpperCase()} · ${count} ANIMAL(IS) OUVIRAM` : `${item.name.toUpperCase()} · NENHUM ANIMAL POR PERTO`);
    }
    root.querySelectorAll('[data-decoy-slot]').forEach((button) => button.addEventListener('click', () => {
        const item = decoyItems[Number(button.dataset.decoySlot)];
        if (item) activateDecoy(item.id);
    }));
    updateDecoyQuickbar();
    async function startGame() {
        const code = root.querySelector('#player-code').value.trim();
        const status = root.querySelector('#profile-status');
        if (!/^\d{3}$/.test(code)) { status.textContent = 'Digite exatamente 3 números para carregar ou criar seu perfil.'; return; }
        const button = root.querySelector('#start-button');
        button.disabled = true;
        status.textContent = 'Carregando perfil...';
        try {
            const response = await fetch(`./api/?action=profile&code=${encodeURIComponent(code)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            let profile = result.profile;
            if (!result.exists) {
                const create = await fetch('./api/?action=profile', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, profile: profileSnapshot() }),
                });
                if (!create.ok) throw new Error(`HTTP ${create.status}`);
                profile = (await create.json()).profile;
            }
            player.profileCode = code;
            try { localStorage.setItem('terras-altas-player-code', code); } catch { }
            applyPlayerProfile(profile);
            lastProfileSaveAt = gameTime;
            status.textContent = `Perfil ${code} carregado · salvamento automático ativo.`;
            root.querySelector('#start-screen').classList.add('hidden');
            try { renderer.domElement.requestPointerLock?.()?.catch(() => { }); } catch { }
        } catch (error) {
            console.error('Falha ao carregar perfil:', error);
            status.textContent = 'Não foi possível acessar o servidor. Confira se o jogo está aberto pelo Apache.';
        } finally { button.disabled = false; }
    }
    const onProfilePageHide = () => savePlayerProfile(true);
    window.addEventListener('pagehide', onProfilePageHide);
    function syncWildlife() {
        for (const animal of player.animals) if (!animal._wildlifeAdopted && !animal.dead) wildlife.adopt(animal);
        for (const animal of [...wildlife.animals]) if (!player.animals.includes(animal)) wildlife.release(animal);
    }
    refreshCatalog();
    const onKeyDown = (event) => {
        if (event.repeat && ['KeyR', 'KeyE', 'KeyB', 'KeyL', 'KeyI', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(event.code)) return;
        const dialog = root.querySelector('#game-dialog');
        if (event.code === 'Escape' && !dialog.hidden) { closeDecoyDialog(); event.preventDefault(); return; }
        if (player.active && (event.code === 'KeyL' || event.code === 'KeyI')) {
            event.preventDefault(); showDecoyDialog(event.code === 'KeyL' ? 'shop' : 'inventory'); return;
        }
        if (player.active && /^Digit[1-3]$/.test(event.code)) { activateDecoy(decoyItems[Number(event.code.slice(-1)) - 1].id); return; }
        if (player.active && /^Numpad[1-3]$/.test(event.code)) { activateDecoy(decoyItems[Number(event.code.slice(-1)) - 1].id); return; }
        if (event.repeat && (event.code === 'KeyR' || event.code === 'KeyE' || event.code === 'KeyB')) return;
        if (player.active && binocularsActive && (event.key === '+' || event.code === 'NumpadAdd' || (event.code === 'Equal' && event.shiftKey))) {
            event.preventDefault(); changeBinocularZoom(1); return;
        }
        if (player.active && binocularsActive && (event.key === '-' || event.code === 'NumpadSubtract' || event.code === 'Minus')) {
            event.preventDefault(); changeBinocularZoom(-1); return;
        }
        player.keys.add(event.code);
        if (event.code === 'KeyR' && player.active && !binocularsActive) reload();
        if (event.code === 'KeyB' && player.active) toggleBinoculars();
        if (event.code === 'Escape' && document.pointerLockElement) {
            document.exitPointerLock();
            player.lastPointerX = null; player.lastPointerY = null;
            weapon.setAim(false);
            if (binocularsActive) setBinocularMode(false);
        }
        if (event.code === 'KeyE' && player.active) collectNearest();
        // V: mostra/oculta os anéis das zonas (ferramenta de desenvolvimento).
        if (event.code === 'KeyV') {
            devZones = !devZones;
            zoneMarkers.setDevMode(devZones);
            toast(devZones ? 'ZONAS À VISTA (MODO DESENVOLVEDOR)' : 'ZONAS ESCONDIDAS');
        }
        if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    };
    const onKeyUp = (event) => player.keys.delete(event.code);
    const onMouseMove = (event) => {
        if (!player.active) return;
        const locked = document.pointerLockElement === renderer.domElement;
        const movementX = locked ? event.movementX : player.lastPointerX === null ? 0 : event.clientX - player.lastPointerX;
        const movementY = locked ? event.movementY : player.lastPointerY === null ? 0 : event.clientY - player.lastPointerY;
        const sensitivity = player.mouseSensitivity * (binocularsActive ? 0.24 : weapon.aiming ? 0.42 : 1);
        player.yaw -= movementX * 0.0018 * sensitivity;
        player.pitch = THREE.MathUtils.clamp(player.pitch - movementY * 0.0016 * sensitivity, -1.35, 1.35);
        player.lastPointerX = event.clientX; player.lastPointerY = event.clientY;
    };
    const onMouseDown = (event) => {
        if (!player.active) return;
        const locked = document.pointerLockElement === renderer.domElement;
        if (!locked) {
            player.lastPointerX = null; player.lastPointerY = null;
            try {
                const request = renderer.domElement.requestPointerLock?.();
                request?.catch?.(() => { });
            } catch { }
            if (event.button === 2) { event.preventDefault(); weapon.setAim(true); }
            return; // O clique que recupera a mira não consome munição.
        }
        if (event.button === 2) { event.preventDefault(); weapon.setAim(true); }
        if (event.button === 0) shoot();
    };
    const onMouseUp = (event) => { if (event.button === 2 && !binocularsActive) weapon.setAim(false); };
    const onMouseWheel = (event) => {
        if (!player.active || binocularsActive || !weapon.aiming) return;
        event.preventDefault();
        const zoom = weapon.adjustZoom(event.deltaY < 0 ? 0.5 : -0.5);
        root.querySelector('#rifle-zoom-level').textContent = `ZOOM ${zoom.toFixed(1)}×`;
    };
    const onPointerLockChange = () => {
        if (document.pointerLockElement === renderer.domElement) return;
        player.lastPointerX = null; player.lastPointerY = null;
        weapon.setAim(false);
    };
    const preventContextMenu = (event) => event.preventDefault();
    function playSound(kind) {
        if (kind === 'shot') { playRifleShot(); return; }
        try {
            player.audio ??= new AudioContext();
            if (player.audio.state === 'suspended') player.audio.resume();
            const audio = player.audio;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(kind === 'dry' ? 190 : 310, audio.currentTime);
            gain.gain.setValueAtTime(0.035 * player.volume, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
            oscillator.connect(gain).connect(audio.destination);
            oscillator.start(); oscillator.stop(audio.currentTime + 0.1);
        } catch { }
    }
    function shoot() {
        if (binocularsActive) { toast('B PARA GUARDAR O BINÓCULO E ATIRAR'); return; }
        const shot = weapon.fire();
        if (!shot.fired) {
            if (shot.reason === 'empty') { playSound('dry'); toast('SEM MUNIÇÃO · PRESSIONE R'); }
            return;
        }
        updateAmmo();
        root.querySelector('#status').textContent = 'DISPARO';
        playSound('shot');
        // IA: o estampido espanta a manada num raio de 120m (foge da posição do tiro).
        // Quem ouve avisa o próprio bando (alarme em cascata) no update do wildlife.
        wildlife.startle(camera.position.x, camera.position.z, 120);
        for (const animal of player.animals) {
            if (animal.dead || typeof animal.hearShot !== 'function') continue;
            if (animal.group.position.distanceTo(camera.position) <= 120) animal.hearShot(camera.position.x, camera.position.z);
        }
        player.pitch = THREE.MathUtils.clamp(player.pitch - weapon.config.recoilVertical, -1.35, 1.35);
        setTimeout(() => { const status = root.querySelector('#status'); if (status && !weapon.reloading) status.textContent = 'PRONTO'; }, 500);
        const muzzle = weapon.muzzleWorldPosition();
        const sceneTargets = [terrain.terrain, ...terrain.trees, ...player.animals.filter((animal) => !animal.dead).map((animal) => animal.group)];
        // Use the exact center-screen ray as the gameplay hit ray. Starting a
        // second ray at the rifle muzzle introduced parallax at close range.
        const hit = raycastFromReticle(camera, aimRaycaster, sceneTargets, weapon.config.range);
        weapon.showMuzzleFlash(scene, muzzle);
        if (hit) {
            const target = animalForHit(player.animals, hit.object);
            if (target) {
                const wasDead = target.dead;
                const hitDistance = camera.position.distanceTo(hit.point);
                target.hit(hit.point, hitDistance, weapon.config.damage, hit.object);
                const region = target.hitRegion.toLocaleUpperCase('pt-BR');
                toast(target.dead
                    ? `ACERTO FATAL · ${region} · ${Math.round(hitDistance)} M`
                    : `${region} · ${Math.round(hitDistance)} M`);
                if (!wasDead && target.dead) { player.stats.kills += 1; scheduleProfileSave(); }
                if (!wasDead && target.dead && !target._respawnQueued) {
                    target._respawnQueued = true;
                    target._deathAt = gameTime;
                    const spawn = spawnData.find((s) => s.id === target._spawnId) ?? spawnData.find((s) => (s._animals ?? []).includes(target)) ?? null;
                    scheduleRespawn(target, spawn);
                }
            } else {
                const impact = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd38a }));
                impact.position.copy(hit.point); scene.add(impact);
                setTimeout(() => { scene.remove(impact); impact.geometry.dispose(); impact.material.dispose(); }, 400);
            }
        }
    }
    function reload() {
        if (weapon.ammo >= weapon.config.magazineSize || weapon.reserve <= 0 || weapon.reloading) return;
        root.querySelector('#status').textContent = 'RECARREGANDO';
        weapon.setAim(false); playSound('reload');
        weapon.reload().then((loaded) => { if (!loaded) return; updateAmmo(); const status = root.querySelector('#status'); if (status) status.textContent = 'PRONTO'; });
    }
    function nearestDowned(range) {
        return player.animals
            .filter((animal) => animal.dead && animal.group.position.distanceTo(camera.position) <= range)
            .sort((a, b) => a.group.position.distanceTo(camera.position) - b.group.position.distanceTo(camera.position))[0];
    }
    function collectNearest() {
        const nearest = nearestDowned(COLLECT_RANGE);
        if (!nearest) return toast('APROXIME-SE DE UM ANIMAL ABATIDO');
        const reward = collectReward(nearest);
        removePersistedDeath(nearest);
        scene.remove(nearest.group);
        player.animals = player.animals.filter((animal) => animal !== nearest);
        for (const spawn of spawnData) if (spawn._animals) spawn._animals = spawn._animals.filter((animal) => animal !== nearest);
        // A reposição já foi agendada na morte (watchDeaths/shoot); se por algum
        // motivo o corpo sumiu sem morte registrada, agenda agora para o mapa
        // nunca esvaziar.
        if (!nearest._respawnQueued) { nearest._respawnQueued = true; scheduleRespawn(nearest, spawnData.find((s) => s.id === nearest._spawnId) ?? null); }
        player.money += reward;
        player.stats.animalsCollected += 1;
        player.stats.totalEarned += reward;
        updateMoney();
        scheduleProfileSave();
        playSound('collect');
        toast(`${nearest.name.toUpperCase()} RECOLHIDO · +R$ ${reward.toLocaleString('pt-BR')}`);
    }
    function resize() {
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
    }
    function update(dt) {
        gameTime += Math.max(0, dt);
        if (player.profileCode && gameTime - lastProfileSaveAt >= 12) { lastProfileSaveAt = gameTime; savePlayerProfile(); }
        const locked = document.pointerLockElement === renderer.domElement;
        player.active = root.querySelector('#start-screen').classList.contains('hidden') && root.querySelector('#game-dialog').hidden;
        camera.rotation.order = 'YXZ'; camera.rotation.set(player.pitch, player.yaw, 0);
        const running = player.keys.has('ShiftLeft') || player.keys.has('ShiftRight');
        player.crouch = player.keys.has('ControlLeft') || player.keys.has('ControlRight');
        const speed = (running ? 10 : 5) * (player.crouch ? 0.46 : 1);
        const direction = new THREE.Vector3(Number(player.keys.has('KeyD')) - Number(player.keys.has('KeyA')), 0, Number(player.keys.has('KeyS')) - Number(player.keys.has('KeyW'))).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
        const walking = player.active && direction.lengthSq() > 0;
        // Descansando: qualquer tecla de movimento levanta o caçador.
        weapon.setRunning(running && walking);
        const scoped = weapon.aiming && !binocularsActive;
        root.querySelector('.game-shell').classList.toggle('scope-active', scoped);
        root.querySelector('#rifle-scope-overlay').hidden = !scoped;
        root.querySelector('.crosshair').hidden = binocularsActive || scoped;
        if (scoped !== scopeWasActive) {
            scopeWasActive = scoped;
            if (scoped) {
                root.querySelector('#rifle-zoom-level').textContent = `ZOOM ${weapon.zoom.toFixed(1)}×`;
                scopeRenderAccumulator = 1 / 15;
            }
        }
        weapon.update(dt, { walking, fovOverride: binocularsActive ? 72 / binocularZoom : null });
        if (walking && direction.lengthSq()) { camera.position.addScaledVector(direction, speed * dt); player.stats.distance += speed * dt; }
        if (player.active && player.keys.has('Space') && camera.position.y <= terrain.heightAt(camera.position.x, camera.position.z) + 1.74) player.velocity.y = 5.5;
        player.velocity.y -= 14 * dt;
        const ground = terrain.heightAt(camera.position.x, camera.position.z) + (player.crouch ? 1.05 : 1.72);
        camera.position.y = Math.max(ground, camera.position.y + player.velocity.y * dt);
        if (camera.position.y <= ground + 0.02) player.velocity.y = 0;
        updateFootsteps(dt, walking && camera.position.y <= ground + 0.05, running);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -3950, 3950);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -3950, 3950);
        // ---- WILDLIFE: bandos, alarme em grupo e rotina nas zonas ----
        if (gameTime - wildlifeSyncAt > 0.6) { wildlifeSyncAt = gameTime; syncWildlife(); }
        const noise = noiseRadiusFor({ running: running && walking, crouch: player.crouch, walking });
        wildlife.update(dt, camera.position, { noise: noise ? { x: camera.position.x, z: camera.position.z, radius: noise } : null });
        player.animals.forEach((animal) => {
            const animalDistance = Math.hypot(animal.group.position.x - camera.position.x, animal.group.position.z - camera.position.z);
            if (!animal.dead && animalDistance > 2200) return;
            let animalDt = dt;
            if (animalDistance > 900) {
                animal._farUpdateElapsed = (animal._farUpdateElapsed ?? 0) + dt;
                if (animal._farUpdateElapsed < 0.05) return;
                animalDt = Math.min(0.05, animal._farUpdateElapsed);
                animal._farUpdateElapsed = 0;
            }
            animal.update(animalDt, camera.position, {
                groundHeight: (x, z) => terrain.heightAt(x, z),
                obstacles: terrain.obstacles,
                obstaclesNear: terrain.obstaclesNear,
                shotX: camera.position.x, shotZ: camera.position.z,
            });
            if (animalDistance <= 260) updateAnimalSound(animal, dt);
        });
        updateBinocularTarget();
        let coordsText = `X ${Math.round(camera.position.x)} · Z ${Math.round(camera.position.z)}`;
        if (devZones) {
            const wild = wildlife.stats();
            coordsText += ` · BANDOS ${wild.herds} · COMENDO ${wild.eating} · BEBENDO ${wild.drinking} · DEITADO ${wild.resting} · ALERTA ${wild.alerted}`;
        }
        if (gameTime - lastHudCoordinateAt >= 0.2) {
            lastHudCoordinateAt = gameTime;
            root.querySelector('#coords').textContent = coordsText;
        }
        // Núcleo do respawn: observa mortes, processa fila, garante mínimo global e limpa corpos velhos.
        watchDeaths();
        processRespawnQueue();
        ensureGlobalMinimum();
        cleanupOldCorpses();
        if (gameTime - lastSpawnCheckAt >= 0.35) {
            lastSpawnCheckAt = gameTime;
            for (const spawn of spawnData) ensureSpawnLoaded(spawn);
        }
    }
    function ensureSpawnLoaded(spawn) {
        const sx = Number(spawn.x); const sz = Number(spawn.z);
        const radius = Number(spawn.radius) || 120;
        const distance = Math.hypot(sx - camera.position.x, sz - camera.position.z);
        if (!spawn._loaded && distance <= Math.max(1000, radius)) {
            spawn._loaded = true;
            spawn._animals ??= [];
            const species = animalCatalog.find((animal) => Number(animal.id) === Number(spawn.animal_id));
            const amount = desiredForSpawn(spawn);
            const alive = aliveForSpawn(spawn);
            for (let i = alive; i < amount; i += 1) {
                const x = sx + Math.sin(i * 8.23) * radius * 0.35;
                const z = sz + Math.cos(i * 3.41) * radius * 0.35;
                const animal = makeAnimal({ spawn, x, z, species, idSuffix: `${Date.now().toString(36)}-${i}` });
                spawn._animals.push(animal);
                player.animals.push(animal);
            }
            return;
        }
        if (spawn._loaded && distance > Math.max(1700, radius * 2)) {
            // Descarrega só os VIVOS distantes (economia de memória).
            // Mortos ficam para coleta; vivos são recriados ao aproximar.
            const keep = [];
            const dropAlive = new Set();
            for (const animal of spawn._animals ?? []) {
                if (!animal.dead) dropAlive.add(animal);
                else keep.push(animal);
            }
            dropAlive.forEach((animal) => scene.remove(animal.group));
            if (dropAlive.size) player.animals = player.animals.filter((animal) => !dropAlive.has(animal));
            spawn._animals = keep;
            if (!keep.length) spawn._loaded = false;
        }
    }
    function animate() {
        if (!shown) return;
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        resolutionSampleTime += dt;
        if (dt > 0.024) slowFrameSamples += 1;
        if (resolutionSampleTime >= 2) {
            const maxRatio = Math.min(devicePixelRatio, 1.5);
            if (slowFrameSamples > 20) renderPixelRatio = Math.max(0.65, renderPixelRatio - 0.12);
            else if (slowFrameSamples < 8) renderPixelRatio = Math.min(maxRatio, renderPixelRatio + 0.05);
            renderer.setPixelRatio(renderPixelRatio);
            renderer.setSize(innerWidth, innerHeight);
            resolutionSampleTime = 0;
            slowFrameSamples = 0;
        }
        update(dt);
        renderer.render(scene, camera);
        renderScopeView(dt);
    }
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('wheel', onMouseWheel, { passive: false });
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('resize', resize);
    resize(); animate();
    return {
        pause() { shown = false; renderer.setAnimationLoop(null); document.exitPointerLock?.(); },
        show() { shown = true; root.querySelector('.game-shell')?.classList.remove('hidden'); refreshCatalog(); animate(); },
        dispose() { shown = false; document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); document.removeEventListener('pointerlockchange', onPointerLockChange); document.removeEventListener('wheel', onMouseWheel); window.removeEventListener('pagehide', onProfilePageHide); clearTimeout(profileSaveTimer); renderer.domElement.removeEventListener('mousedown', onMouseDown); renderer.domElement.removeEventListener('contextmenu', preventContextMenu); window.removeEventListener('resize', resize); scopeTarget.dispose(); scopeOverlayMaterial.dispose(); weapon.dispose(); camera.remove(binocularSocket); binocularSocket.traverse((object) => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material?.dispose(); }); player.audio?.close(); renderer.dispose(); terrain.dispose(); },
    };
}
