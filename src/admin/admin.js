import * as THREE from 'three';
import './admin.css';
import { createLandscape } from '../world/landscape.js';
import { createAnimal, inferAnimationRoles, inferModelFrontAxis } from '../world/animals.js';
import { createProceduralRifle, DEFAULT_WEAPON } from '../world/weapon.js';
import { importModel } from './glb.js';
import { computeGroundOffsetY, computeFitScale, frameObject } from './preview-utils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';


export function createAdmin(root, { onClose }) {
    root.innerHTML = `<main class="admin-shell"><aside class="admin-sidebar"><a class="wordmark" href="#">TERRAS <span>ALTAS</span></a><span class="eyebrow">RESERVA · ADMIN</span><nav><button class="nav-link active" data-tab="dashboard">◫ &nbsp; VISÃO GERAL</button><button class="nav-link" data-tab="animals">♧ &nbsp; ANIMAIS</button><button class="nav-link" data-tab="weapons">⌁ &nbsp; ARMAS</button><button class="nav-link" data-tab="trees">♣ &nbsp; ÁRVORES</button><button class="nav-link" data-tab="map">⌖ &nbsp; MAPA 3D</button><button class="nav-link" data-tab="spawns">◎ &nbsp; SPAWNS</button><button class="nav-link" data-tab="credits">≋ &nbsp; CRÉDITOS</button></nav><button id="logout" class="sidebar-bottom">SAIR DO PAINEL ↗</button></aside><section class="admin-content"><header class="admin-header"><div><span class="eyebrow">FERRAMENTAS DE RESERVA</span><h1 id="section-title">Visão geral</h1></div><button id="close-admin" class="icon-button" aria-label="Fechar painel" title="Voltar ao jogo">×</button></header><div id="panel"></div></section></main>`;
    const panel = root.querySelector('#panel');
    const sidebar = root.querySelector('.admin-sidebar');
    const state = { animals: [], spawns: [], weapons: [], animationPresets: [], vegetation: { pine: '', oak: '' }, selectedAnimal: null, model: null, weaponModel: null, map: null, renderer: null, frame: 0 };
    const request = async (url, options) => { const response = await fetch(url, options); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Falha na solicitação'); return response.json(); };
    async function refresh() {
        try {
            const data = await request('./api/'); state.animals = data.animals ?? []; state.spawns = data.spawns ?? []; state.weapons = data.weapons ?? []; state.animationPresets = data.animationPresets ?? []; state.vegetation = data.vegetation ?? { pine: '', oak: '' };
            const authenticated = data.authenticated;
            if (!authenticated) return login();
            dashboard();
        } catch { login(); }
    }
    function login() {
        panel.innerHTML = `<div class="login-wrap"><span class="eyebrow">ACESSO RESTRITO</span><h2>Administração<br>da reserva</h2><form id="login-form"><label>Usuário<input name="username" autocomplete="username" value="admin" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="primary-button">ENTRAR <span>↗</span></button><p class="form-error" id="login-error"></p></form></div>`;
        panel.querySelector('#login-form').onsubmit = async (event) => {
            event.preventDefault(); const form = new FormData(event.currentTarget);
            try { await request('./api/?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) }); await refresh(); }
            catch (error) { panel.querySelector('#login-error').textContent = error.message; }
        };
    }
    function dashboard() {
        panel.innerHTML = `<div class="stat-row"><article><span class="eyebrow">ÁREA MAPEADA</span><strong>64 <i>km²</i></strong><small>8.000 × 8.000 metros</small></article><article><span class="eyebrow">ESPÉCIES</span><strong>${state.animals.length}</strong><small>espécies catalogadas</small></article><article><span class="eyebrow">ZONAS DE SPAWN</span><strong>${state.spawns.length}</strong><small>regiões configuradas</small></article></div><section class="admin-section"><div class="section-intro"><span class="eyebrow">SERRA DO CEDRO · COORDENADAS MÉTRICAS</span><h2>Uma reserva viva, em escala real.</h2><p>O mapa de jogo e o mapa de edição compartilham terreno, coordenadas e objetos de ambiente.</p></div><button class="primary-button" data-go-map>ABRIR MAPA 3D <span>↗</span></button></section><section class="quick-links"><button data-tab="animals"><span>01</span><strong>Catálogo de animais</strong><small>Modelos, espécies e comportamento</small></button><button data-tab="spawns"><span>02</span><strong>Áreas de spawn</strong><small>População e regiões de habitat</small></button><button data-tab="credits"><span>03</span><strong>Créditos e licenças</strong><small>Procedural · sem assets externos</small></button></section>`;
        panel.querySelector('[data-go-map]').onclick = () => selectTab('map');
        panel.querySelectorAll('.quick-links [data-tab]').forEach((button) => button.onclick = () => selectTab(button.dataset.tab));
    }
    function animalPage() {
        panel.innerHTML = `<div class="toolbar"><p>${state.animals.length} registros</p><button id="new-animal" class="primary-button">+ NOVO ANIMAL</button></div><div class="animal-layout"><div class="animal-list">${state.animals.map((animal) => `<button data-animal="${animal.id}" class="animal-row"><span class="animal-symbol">♧</span><span><strong>${escapeHtml(animal.name)}</strong><small>${escapeHtml(animal.species || 'Espécie não definida')}</small></span><span class="animal-state">${animal.active ? 'ATIVO' : 'INATIVO'}</span></button>`).join('') || '<p class="empty-state">Nenhum animal ainda. Importe um GLB ou crie um registro.</p>'}</div><div class="animal-editor"><div class="animal-preview" id="animal-preview"><span>PREVIEW 3D</span><canvas></canvas></div><form id="animal-form" class="animal-form"><div class="form-heading"><span class="eyebrow">FICHA DO ANIMAL</span><button class="text-button" type="button" id="place-animal">COLOCAR NO MAPA ↗</button></div><input type="hidden" name="id"><div class="form-grid"><label>Nome<input name="name" required placeholder="Veado-vermelho"></label><label>Espécie<input name="species" placeholder="Cervidae"></label><label>Escala<input name="scale" type="number" value="1" min="0.1" step="0.1"></label><label>Velocidade (m/s)<input name="speed" type="number" value="4" min="0" step="0.1"></label><label>Vida<input name="health" type="number" value="100" min="1"></label><label>Peso (kg)<input name="weight" type="number" value="75" min="1"></label><label class="wide">Descrição<textarea name="description" rows="2"></textarea></label><label class="wide file-label">Modelo 3D · GLB<input name="model" type="file" accept=".glb,model/gltf-binary"></label></div><p class="import-report" id="import-report">Modelo procedural ativo. GLB carrega malhas, materiais, texturas, bones, morph targets e animações.</p><button class="primary-button">SALVAR ANIMAL <span>↗</span></button></form></div></div>`;
        const form = panel.querySelector('#animal-form');
        form.insertAdjacentHTML('afterbegin', '<input type="hidden" name="soundPath">');
        form.querySelector('.file-label').insertAdjacentHTML('afterend', '<label class="wide file-label">Som do animal · opcional (MP3, WAV, OGG, M4A)<input name="soundFile" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"></label>');
        form.querySelector('#import-report').insertAdjacentHTML('beforebegin', '<div class="sound-preview-wrap"><audio id="animal-sound-preview" controls hidden></audio><button id="clear-animal-sound" class="text-button" type="button" hidden>REMOVER SOM</button><span id="animal-sound-status">Sem som cadastrado.</span></div>');
        const soundPreview = form.querySelector('#animal-sound-preview');
        const soundStatus = form.querySelector('#animal-sound-status');
        const clearSound = form.querySelector('#clear-animal-sound');
        const showSound = (path) => {
            if (path) { soundPreview.src = `./${path}`; soundPreview.hidden = false; clearSound.hidden = false; soundStatus.textContent = 'Som salvo para esta espécie.'; }
            else { soundPreview.pause(); soundPreview.removeAttribute('src'); soundPreview.load(); soundPreview.hidden = true; clearSound.hidden = true; soundStatus.textContent = 'Sem som cadastrado.'; }
        };
        form.elements.soundFile.onchange = () => {
            const file = form.elements.soundFile.files?.[0];
            if (!file) return;
            soundPreview.src = URL.createObjectURL(file); soundPreview.hidden = false; clearSound.hidden = false; soundStatus.textContent = `Prévia: ${file.name} (salve para aplicar)`;
        };
        clearSound.onclick = () => { form.elements.soundFile.value = ''; form.elements.soundPath.value = ''; showSound(''); };
        state.selectedAnimal = null;
        const behaviorFields = document.createElement('div');
        behaviorFields.className = 'form-grid extra-fields';
        behaviorFields.innerHTML = '<label>Altura (m)<input name="height" type="number" value="2.1" min="0.1" step="0.1"></label><label>Velocidade de corrida<input name="runSpeed" type="number" value="7.6" min="0" step="0.1"></label><label>Detecção (m)<input name="detectionDistance" type="number" value="80" min="1"></label><label>Fuga (m)<input name="fleeDistance" type="number" value="35" min="1"></label><label>Grupo mínimo<input name="minCount" type="number" value="2" min="0" max="50"></label><label>Grupo máximo<input name="maxCount" type="number" value="8" min="1" max="50"></label><label>Comportamento<select name="behavior"><option>Fugir do jogador</option><option>Ficar alerta</option><option>Defender território</option></select></label><label>Habitat<select name="habitat"><option>Floresta</option><option>Campo</option><option>Montanha</option><option>Margem de água</option></select></label>';
        form.querySelector('.import-report').before(behaviorFields);
        behaviorFields.insertAdjacentHTML('beforeend', '<label>Velocidade de fuga<input name="fleeSpeed" type="number" value="7.6" min="0" step="0.1"></label>');
        const preview = createPreview(panel.querySelector('.animal-preview canvas'));
        state.preview = preview;
        form.elements.model.onchange = async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            try {
                state.model = await importModel(file, preview.renderer);
                preview.setModel(state.model);
                state.detectedFrontAxis = inferModelFrontAxis(state.model.scene);
                if (!state.selectedAnimal?.animationConfig?.frontAxis && state.detectedFrontAxis) form.elements.frontAxis.value = state.detectedFrontAxis;
                preview.configure({ scale: Number(scaleRange.value) || 1, frontAxis: form.elements.frontAxis.value, rotation: Number(previewControls.querySelector('[data-preview-rotation]').value) || 0 });
                setAnimationOptions(form.elements.animation, state.model.animations);
                populateAnimationRoles(state.model.animations, state.selectedAnimal?.animationConfig?.clips ?? {});
                panel.querySelector('#import-report').textContent = state.model.report;
            }
            catch (error) { panel.querySelector('#import-report').textContent = `Erro ao importar: ${error.message}`; }
        };
        form.onsubmit = async (event) => {
            event.preventDefault(); const values = Object.fromEntries(new FormData(form)); values.animationConfig = readAnimationConfig();
            try {
                const file = form.elements.model.files?.[0]; let modelPath = state.selectedAnimal?.modelPath ?? '';
                if (file) { const upload = new FormData(); upload.append('model', file); const result = await request('./api/?action=upload', { method: 'POST', body: upload }); modelPath = result.path; }
                const soundFile = form.elements.soundFile.files?.[0];
                if (soundFile) { const upload = new FormData(); upload.append('audio', soundFile); values.soundPath = (await request('./api/?action=audio-upload', { method: 'POST', body: upload })).path; }
                delete values.soundFile;
                await request('./api/?action=animal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, modelPath, active: true }) });
                state.model = null; await refresh(); selectTab('animals');
            } catch (error) { panel.querySelector('#import-report').textContent = error.message; }
        };
        panel.querySelector('#new-animal').onclick = () => { state.selectedAnimal = null; form.reset(); form.elements.id.value = ''; showSound(''); state.preview.showProcedural(); };
        panel.querySelector('#place-animal').onclick = async () => {
            if (!form.reportValidity()) return;
            try {
                const values = Object.fromEntries(new FormData(form)); values.animationConfig = readAnimationConfig();
                let modelPath = state.selectedAnimal?.modelPath ?? '';
                const file = form.elements.model.files?.[0];
                if (file) { const upload = new FormData(); upload.append('model', file); modelPath = (await request('./api/?action=upload', { method: 'POST', body: upload })).path; }
                const soundFile = form.elements.soundFile.files?.[0];
                if (soundFile) { const upload = new FormData(); upload.append('audio', soundFile); values.soundPath = (await request('./api/?action=audio-upload', { method: 'POST', body: upload })).path; }
                delete values.soundFile;
                const animal = await request('./api/?action=animal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, modelPath, active: true }) });
                state.animals = [...state.animals.filter((item) => item.id !== animal.id), animal];
                state.pendingAnimal = animal;
                selectTab('map');
            } catch (error) { panel.querySelector('#import-report').textContent = error.message; }
        };
        const previewControls = document.createElement('div');
        previewControls.className = 'preview-controls';
        previewControls.innerHTML = `
            <label>ANIMAÇÃO<select name="animation"><option value="">Sem animações carregadas</option></select></label>
            <div class="preview-actions-row">
                <button class="text-button" type="button" data-ground-btn>AJUSTAR AO CHÃO</button>
                <button class="text-button" type="button" data-frame-btn>ENQUADRAR ANIMAL</button>
                <button class="text-button" type="button" data-test-animal>TESTAR ANIMAÇÃO ▶</button>
            </div>
            <div class="scale-presets-row">
                <span>PRESETS DE ESCALA:</span>
                <button class="text-button chip" type="button" data-preset="0.5">0.5×</button>
                <button class="text-button chip" type="button" data-preset="1">1.0×</button>
                <button class="text-button chip" type="button" data-preset="1.5">1.5×</button>
                <button class="text-button chip" type="button" data-preset="2">2.0×</button>
            </div>
            <label>ESCALA DO PREVIEW<input data-preview-scale type="range" min="0.25" max="3" step="0.05" value="1"></label>
            <label>ALTURA DO CHÃO (m)<input data-preview-height type="range" min="-1" max="2" step="0.05" value="0"></label>
            <label>ROTAÇÃO<input data-preview-rotation type="range" min="-3.14" max="3.14" step="0.05" value="0"></label>
        `;
        form.insertBefore(previewControls, form.querySelector('.primary-button'));
        const scaleRange = previewControls.querySelector('[data-preview-scale]');
        const heightRange = previewControls.querySelector('[data-preview-height]');
        previewControls.querySelector('[name="animation"]').insertAdjacentHTML('afterend', '<label>TYPE<select name="animalType"><option value="ANIMAL">ANIMAL</option><option value="AVE">AVE</option></select></label><label>FRONT AXIS<select name="frontAxis"><option>+X</option><option>-X</option><option>+Z</option><option>-Z</option></select></label><label>IDLE<select name="clipIdle"><option value="">Auto detect</option></select></label><label>WALK<select name="clipWalk"><option value="">Auto detect</option></select></label><label>RUN<select name="clipRun"><option value="">Auto detect</option></select></label><label>FLEE<select name="clipFlee"><option value="">Auto detect</option></select></label><label>TURN<select name="clipTurn"><option value="">Auto detect</option></select></label><label>FLY<select name="clipFly"><option value="">Auto detect</option></select></label><label>ATTACK<select name="clipAttack"><option value="">Auto detect</option></select></label><label>ANIMATION SPEED<input name="animationSpeed" type="number" value="1" min="0.1" max="4" step="0.05"></label><label>FLIGHT SPEED<input name="flightSpeed" type="number" value="8" min="0.1" step="0.1"></label><label>MIN FLIGHT HEIGHT<input name="minFlightHeight" type="number" value="10" min="1"></label><label>MAX FLIGHT HEIGHT<input name="maxFlightHeight" type="number" value="24" min="1"></label><label>LOOP CLIPS<input name="animationLoop" type="checkbox" checked></label><label>SAVED PRESET<select name="animationPreset"><option value="">Select preset...</option></select></label><label>PRESET NAME<input name="animationPresetName" placeholder="Deer"></label><button class="text-button" type="button" data-save-animation-preset>Save preset</button><button class="text-button" type="button" data-apply-animation-preset>Apply preset</button>');
        const roleSelects = { idle: form.elements.clipIdle, walk: form.elements.clipWalk, run: form.elements.clipRun, flee: form.elements.clipFlee, turn: form.elements.clipTurn, fly: form.elements.clipFly, attack: form.elements.clipAttack };
        function populateAnimationRoles(animations = [], chosen = {}) {
            const automatic = inferAnimationRoles(animations);
            for (const [role, select] of Object.entries(roleSelects)) {
                const previous = chosen[role] ?? select.value;
                select.replaceChildren(new Option('Auto detect', ''), ...animations.map((clip) => new Option(clip.name || 'Unnamed clip', clip.name)));
                select.value = previous && [...select.options].some((option) => option.value === previous) ? previous : (automatic[role] ?? '');
            }
        }
        function readAnimationConfig() {
            const clips = Object.fromEntries(Object.entries(roleSelects).map(([role, select]) => [role, select.value]).filter(([, value]) => value));
            const speed = (name, fallback) => Number(form.elements[name]?.value) || fallback;
            return { type: form.elements.animalType.value, clips, walkSpeed: speed('speed', 1.25), runSpeed: speed('runSpeed', 7.6), fleeSpeed: speed('fleeSpeed', speed('runSpeed', 7.6)), animationSpeed: speed('animationSpeed', 1), modelScale: Number(scaleRange.value) || 1, frontAxis: form.elements.frontAxis.value, footOffset: Number(heightRange.value) || 0, rotationY: Number(previewControls.querySelector('[data-preview-rotation]').value) || 0, loop: Object.fromEntries(Object.keys(roleSelects).map((role) => [role, !!form.elements.animationLoop.checked])), flightSpeed: speed('flightSpeed', 8), minFlightHeight: speed('minFlightHeight', 10), maxFlightHeight: speed('maxFlightHeight', 24) };
        }
        function applyAnimationConfig(config = {}) {
            form.elements.animalType.value = config.type || 'ANIMAL'; form.elements.frontAxis.value = config.frontAxis || state.detectedFrontAxis || '+X';
            for (const [role, select] of Object.entries(roleSelects)) select.value = config.clips?.[role] ?? '';
            form.elements.animationSpeed.value = config.animationSpeed ?? 1; form.elements.flightSpeed.value = config.flightSpeed ?? 8;
            form.elements.minFlightHeight.value = config.minFlightHeight ?? 10; form.elements.maxFlightHeight.value = config.maxFlightHeight ?? 24;
            form.elements.animationLoop.checked = config.loop ? Object.values(config.loop).every(Boolean) : true;
            if (config.modelScale !== undefined) { scaleRange.value = config.modelScale; preview.configure({ scale: Number(config.modelScale) }); }
            if (config.footOffset !== undefined) { heightRange.value = config.footOffset; preview.configure({ height: Number(config.footOffset) }); }
            if (config.rotationY !== undefined) previewControls.querySelector('[data-preview-rotation]').value = config.rotationY;
            preview.configure({ rotation: Number(config.rotationY) || 0, frontAxis: form.elements.frontAxis.value });
        }
        const refreshPresetSelect = () => {
            const select = form.elements.animationPreset; select.replaceChildren(new Option('Select preset...', ''));
            state.animationPresets.forEach((preset) => select.add(new Option(preset.name, preset.name)));
        };
        refreshPresetSelect();
        state.applyAnimalConfig = applyAnimationConfig;
        state.populateAnimationRoles = populateAnimationRoles;
        previewControls.querySelector('[data-save-animation-preset]').onclick = async () => {
            const name = form.elements.animationPresetName.value.trim();
            if (!name) { form.elements.animationPresetName.focus(); return; }
            try {
                const preset = await request('./api/?action=animation-preset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config: readAnimationConfig() }) });
                state.animationPresets = [...state.animationPresets.filter((item) => item.name !== preset.name), preset].sort((a, b) => a.name.localeCompare(b.name));
                refreshPresetSelect(); form.elements.animationPreset.value = preset.name;
                panel.querySelector('#import-report').textContent = `Preset "${preset.name}" salvo.`;
            } catch (error) { panel.querySelector('#import-report').textContent = error.message; }
        };
        previewControls.querySelector('[data-apply-animation-preset]').onclick = () => {
            const preset = state.animationPresets.find((item) => item.name === form.elements.animationPreset.value);
            if (!preset) return;
            applyAnimationConfig(preset.config);
            form.elements.speed.value = preset.config.walkSpeed ?? form.elements.speed.value;
            form.elements.runSpeed.value = preset.config.runSpeed ?? form.elements.runSpeed.value;
            form.elements.fleeSpeed.value = preset.config.fleeSpeed ?? form.elements.fleeSpeed.value;
            panel.querySelector('#import-report').textContent = `Preset "${preset.name}" aplicado. Confira os nomes dos clips neste modelo.`;
        };
        previewControls.querySelector('[name="animation"]').onchange = (event) => preview.playAnimation(Number(event.target.value));
        scaleRange.oninput = (event) => preview.configure({ scale: Number(event.target.value) });
        heightRange.oninput = (event) => preview.configure({ height: Number(event.target.value) });
        previewControls.querySelector('[data-preview-rotation]').oninput = (event) => preview.configure({ rotation: Number(event.target.value), frontAxis: form.elements.frontAxis.value });
        form.elements.frontAxis.onchange = () => preview.configure({ rotation: Number(previewControls.querySelector('[data-preview-rotation]').value), frontAxis: form.elements.frontAxis.value });
        previewControls.querySelector('[data-test-animal]').onclick = () => preview.testMovement();
        previewControls.querySelector('[data-ground-btn]').onclick = () => {
            const result = preview.adjustToFloor();
            heightRange.value = result.height;
        };
        previewControls.querySelector('[data-frame-btn]').onclick = () => preview.frameAnimal();
        previewControls.querySelectorAll('[data-preset]').forEach((button) => {
            button.onclick = () => {
                const value = Number(button.dataset.preset);
                scaleRange.value = value;
                preview.configure({ scale: value });
            };
        });
        panel.querySelectorAll('[data-animal]').forEach((button) => {
            button.onclick = () => loadAnimal(button.dataset.animal, form, preview);
            const animal = state.animals.find((item) => String(item.id) === button.dataset.animal);
            const actions = document.createElement('div');
            actions.className = 'animal-row-actions';
            actions.innerHTML = `
                <button type="button" title="Pré-visualizar no editor" data-preview>👁</button>
                <button type="button" title="Colocar no mapa 3D" data-place>↗</button>
                <button type="button" title="Duplicar" data-copy>⧉</button>
                <button type="button" title="${animal.active ? 'Desativar' : 'Ativar'}" data-toggle>${animal.active ? '◉' : '○'}</button>
                <button type="button" title="Excluir" data-delete>×</button>
            `;
            button.after(actions);
            actions.querySelector('[data-preview]').onclick = () => loadAnimal(animal.id, form, preview);
            actions.querySelector('[data-place]').onclick = () => { state.pendingAnimal = animal; selectTab('map'); };
            actions.querySelector('[data-copy]').onclick = async () => {
                const copy = { ...animal, name: `${animal.name} (cópia)`, active: true };
                delete copy.id;
                try { await request('./api/?action=animal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(copy) }); await refresh(); selectTab('animals'); }
                catch (error) { panel.querySelector('#import-report').textContent = error.message; }
            };
            actions.querySelector('[data-toggle]').onclick = async () => {
                try { await request(`./api/?action=animal&id=${animal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !animal.active }) }); await refresh(); selectTab('animals'); }
                catch (error) { panel.querySelector('#import-report').textContent = error.message; }
            };
            actions.querySelector('[data-delete]').onclick = async () => {
                if (!confirm(`Excluir ${animal.name} e suas áreas de spawn?`)) return;
                try { await request(`./api/?action=animal&id=${animal.id}`, { method: 'DELETE' }); await refresh(); selectTab('animals'); }
                catch (error) { panel.querySelector('#import-report').textContent = error.message; }
            };
        });
        return preview;
    }
    function loadAnimal(id, form, preview) {
        const animal = state.animals.find((item) => String(item.id) === String(id)); if (!animal) return;
        state.selectedAnimal = animal; Object.entries(animal).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
        const soundPreview = panel.querySelector('#animal-sound-preview');
        const clearSound = panel.querySelector('#clear-animal-sound');
        const soundStatus = panel.querySelector('#animal-sound-status');
        if (animal.soundPath) { soundPreview.src = `./${animal.soundPath}`; soundPreview.hidden = false; clearSound.hidden = false; soundStatus.textContent = 'Som salvo para esta espécie.'; }
        else { soundPreview.pause(); soundPreview.removeAttribute('src'); soundPreview.load(); soundPreview.hidden = true; clearSound.hidden = true; soundStatus.textContent = 'Sem som cadastrado.'; }
        preview.showProcedural();
        if (animal.modelPath) {
            importModel(`./${animal.modelPath}`, preview.renderer).then((model) => {
                preview.setModel(model);
                preview.configure({ scale: Number(form.elements.scale.value) || 1 });
                state.detectedFrontAxis = inferModelFrontAxis(model.scene);
                setAnimationOptions(form.elements.animation, model.animations);
                state.populateAnimationRoles?.(model.animations, animal.animationConfig?.clips ?? {});
                if (!animal.animationConfig?.frontAxis && state.detectedFrontAxis) form.elements.frontAxis.value = state.detectedFrontAxis;
                state.applyAnimalConfig?.(animal.animationConfig ?? {});
                panel.querySelector('#import-report').textContent = model.report;
            }).catch((error) => { panel.querySelector('#import-report').textContent = error.message; });
        }
    }
    function setAnimationOptions(select, animations = []) {
        select.replaceChildren(new Option(animations.length ? 'Selecionar animação' : 'Sem animações carregadas', ''));
        animations.forEach((animation, index) => select.add(new Option(animation.name || `Animação ${index + 1}`, String(index))));
    }
    function weaponsPage() {
        const current = state.weapons[0] ?? DEFAULT_WEAPON;
        panel.innerHTML = `<div class="toolbar"><p>${state.weapons.length} armas cadastradas · slot principal</p><button id="new-weapon" class="primary-button">+ ADICIONAR ARMA</button></div><div class="weapon-layout"><section class="weapon-editor"><div class="weapon-preview"><span class="eyebrow">PREVIEW 3D · ÓRBITA / SCROLL</span><canvas id="weapon-preview"></canvas><div class="weapon-preview-actions"><button type="button" id="test-aim" class="text-button">TESTAR MIRA</button><button type="button" id="test-recoil" class="text-button">TESTAR RECUO</button><button type="button" id="test-animation" class="text-button">TESTAR ANIMAÇÃO</button></div></div><form id="weapon-form" class="animal-form"><div class="form-heading"><span class="eyebrow">CONFIGURAÇÃO DA ARMA</span><span class="weapon-active-label"><input name="active" type="checkbox" checked> ARMA PRINCIPAL</span></div><input type="hidden" name="id"><div class="form-grid"><label>Nome<input name="name" required></label><label>Tipo<select name="weaponType"><option value="rifle">Rifle</option><option value="shotgun">Espingarda</option><option value="pistol">Pistola</option><option value="bow">Arco</option></select></label><label>Dano<input name="damage" type="number" min="1" step="1"></label><label>Alcance (m)<input name="range" type="number" min="1"></label><label>Cadência (tiros/s)<input name="fireRate" type="number" min="0.1" step="0.05"></label><label>Carregador<input name="magazineSize" type="number" min="1"></label><label>Munição reserva<input name="reserveAmmo" type="number" min="0"></label><label>Recarga (s)<input name="reloadTime" type="number" min="0.1" step="0.1"></label><label>Recoil vertical<input name="recoilVertical" type="number" min="0" step="0.001"></label><label>Recoil horizontal<input name="recoilHorizontal" type="number" min="0" step="0.001"></label><label>Recuperação<input name="recoilRecovery" type="number" min="0.1" step="0.1"></label><label>Zoom<input name="zoom" type="number" min="1" step="0.05"></label><label>Escala do modelo<input name="modelScale" type="number" min="0.05" step="0.05"></label><label class="wide">Modelo da arma · GLB<input name="model" type="file" accept=".glb,model/gltf-binary"></label><label>Socket X<input name="positionX" type="number" step="0.01"></label><label>Socket Y<input name="positionY" type="number" step="0.01"></label><label>Socket Z<input name="positionZ" type="number" step="0.01"></label><label>Rotação X (rad)<input name="rotationX" type="number" step="0.01"></label><label>Rotação Y (rad)<input name="rotationY" type="number" step="0.01"></label><label>Rotação Z (rad)<input name="rotationZ" type="number" step="0.01"></label><label>Muzzle X<input name="muzzleX" type="number" step="0.01"></label><label>Muzzle Y<input name="muzzleY" type="number" step="0.01"></label><label>Muzzle Z<input name="muzzleZ" type="number" step="0.01"></label><label>Autor<input name="author"></label><label>Licença<input name="license"></label><label class="wide">URL de origem<input name="sourceUrl" type="url"></label></div><p class="import-report" id="weapon-report">A arma procedural já funciona. O GLB enviado substitui o modelo visual mantendo socket, mira, recoil e combate.</p><button class="primary-button">SALVAR ARMA <span>↗</span></button></form></section><aside class="weapon-list"><span class="eyebrow">ARSENAL</span>${state.weapons.map((weapon) => `<button type="button" class="weapon-row" data-weapon="${weapon.id}"><span>⌁</span><span><strong>${escapeHtml(weapon.name)}</strong><small>${weapon.active ? 'PRINCIPAL' : 'DISPONÍVEL'} · ${escapeHtml(weapon.weaponType)}</small></span></button>`).join('')}</aside></div>`;
        const form = panel.querySelector('#weapon-form');
        const preview = createWeaponPreview(panel.querySelector('#weapon-preview'));
        state.weaponModel = preview;
        const fill = (weapon) => {
            form.reset();
            for (const [key, value] of Object.entries(weapon)) if (form.elements[key] && key !== 'modelPath') form.elements[key].value = value;
            form.elements.id.value = weapon.id ?? '';
            form.elements.active.checked = weapon.active ?? true;
            form.elements.model.value = '';
            preview.showDefault();
            if (weapon.modelPath) importModel(`./${weapon.modelPath}`, preview.renderer).then((gltf) => { preview.setModel(gltf); setAnimationOptions(gltf.animations); }).catch((error) => { panel.querySelector('#weapon-report').textContent = error.message; });
        };
        fill(current);
        form.addEventListener('input', () => preview.configure(Object.fromEntries(new FormData(form))));
        form.elements.model.onchange = async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            try { const gltf = await importModel(file, preview.renderer); preview.setModel(gltf); setAnimationOptions(gltf.animations); panel.querySelector('#weapon-report').textContent = gltf.report; }
            catch (error) { panel.querySelector('#weapon-report').textContent = `Erro ao importar GLB: ${error.message}`; }
        };
        form.onsubmit = async (event) => {
            event.preventDefault(); const values = Object.fromEntries(new FormData(form));
            try {
                let modelPath = state.weapons.find((item) => String(item.id) === values.id)?.modelPath ?? '';
                const file = form.elements.model.files?.[0];
                if (file) { const upload = new FormData(); upload.append('model', file); modelPath = (await request('./api/?action=upload', { method: 'POST', body: upload })).path; }
                await request('./api/?action=weapon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, modelPath, active: form.elements.active.checked }) });
                await refresh(); selectTab('weapons');
            } catch (error) { panel.querySelector('#weapon-report').textContent = error.message; }
        };
        panel.querySelector('#new-weapon').onclick = () => fill({ ...DEFAULT_WEAPON, id: '', name: 'Nova arma', active: true });
        panel.querySelectorAll('[data-weapon]').forEach((button) => button.onclick = () => fill(state.weapons.find((weapon) => String(weapon.id) === button.dataset.weapon)));
        panel.querySelector('#test-aim').onclick = () => preview.setAiming(true);
        panel.querySelector('#test-recoil').onclick = () => preview.testRecoil();
        panel.querySelector('#test-animation').onclick = () => preview.testAnimation();
    }
    function createWeaponPreview(canvas) {
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x27342b);
        scene.add(new THREE.HemisphereLight(0xecebdc, 0x443a2d, 2)); const light = new THREE.DirectionalLight(0xffe0b2, 3); light.position.set(-3, 5, 4); scene.add(light);
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100); camera.position.set(2.6, 1.7, 3.3); camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
        const base = new THREE.Group(); scene.add(base); let model = createProceduralRifle(); model.rotation.y = 1.08; base.add(model);
        let gltf = null; let mixer = null; let action = null; let distance = 4.2; let dragging = false; let lastX = 0; let aim = false;
        const clock = new THREE.Clock();
        function draw() { if (state.weaponModel?.renderer !== renderer) return; mixer?.update(clock.getDelta()); renderer.render(scene, camera); state.frame = requestAnimationFrame(draw); }
        function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); }
        function updateCamera() { camera.position.set(Math.sin(model.rotation.y) * distance * 0.62, distance * 0.34, Math.cos(model.rotation.y) * distance); camera.lookAt(0, 0, 0); }
        canvas.addEventListener('pointerdown', (event) => { dragging = true; lastX = event.clientX; canvas.setPointerCapture(event.pointerId); });
        canvas.addEventListener('pointerup', () => { dragging = false; });
        canvas.addEventListener('pointermove', (event) => { if (!dragging) return; model.rotation.y += (event.clientX - lastX) * 0.01; lastX = event.clientX; updateCamera(); });
        canvas.addEventListener('wheel', (event) => { distance = THREE.MathUtils.clamp(distance * (event.deltaY > 0 ? 1.08 : 0.92), 1.4, 12); updateCamera(); }, { passive: true });
        return {
            renderer,
            dispose() { cancelAnimationFrame(state.frame); renderer.dispose(); },
            setModel(value) { if (model) base.remove(model); gltf = value; model = value.scene; const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3()); const scale = 1.35 / Math.max(size.x, size.y, size.z, 0.001); model.scale.setScalar(scale); model.position.set(-((bounds.min.x + bounds.max.x) / 2) * scale, -((bounds.min.y + bounds.max.y) / 2) * scale, -((bounds.min.z + bounds.max.z) / 2) * scale); base.add(model); mixer = value.animations.length ? new THREE.AnimationMixer(model) : null; action = null; updateCamera(); },
            showDefault() { if (model) base.remove(model); gltf = null; mixer = null; model = createProceduralRifle(); model.rotation.y = 1.08; base.add(model); updateCamera(); },
            configure(values = {}) { if (values.modelScale && model) model.scale.setScalar((gltf ? 1.35 / Math.max(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length(), 0.001) : 1) * Number(values.modelScale)); if (values.rotationY !== undefined && Number.isFinite(Number(values.rotationY))) model.rotation.y = Number(values.rotationY); if (values.rotationX !== undefined) model.rotation.x = Number(values.rotationX); if (values.rotationZ !== undefined) model.rotation.z = Number(values.rotationZ); if (values.positionX !== undefined) model.position.x = Number(values.positionX); if (values.positionY !== undefined) model.position.y = Number(values.positionY); if (values.positionZ !== undefined) model.position.z = Number(values.positionZ); },
            setAiming(value) { aim = value; camera.fov = value ? 27 : 38; camera.updateProjectionMatrix(); setTimeout(() => { aim = false; camera.fov = 38; camera.updateProjectionMatrix(); }, 1100); },
            testRecoil() { model.rotation.x -= 0.18; base.position.z += 0.1; setTimeout(() => { model.rotation.x += 0.18; base.position.z = 0; }, 180); },
            testAnimation() { if (mixer && gltf?.animations.length) { mixer.stopAllAction(); action = mixer.clipAction(gltf.animations[0]).reset().play(); } else this.testRecoil(); },
        };
    }
    function mapPage() {
        panel.innerHTML = `<div class="map-toolbar"><div><span class="eyebrow">MUNDO ABERTO · 8 KM × 8 KM</span><strong>64 km²</strong><small>Selecione o terreno para definir uma posição</small></div><div class="map-actions"><select id="map-animal"><option value="">Escolher animal</option>${state.animals.map((animal) => `<option value="${animal.id}">${escapeHtml(animal.name)}</option>`).join('')}</select><button id="save-spawn" class="primary-button">SALVAR SPAWN <span>↗</span></button></div></div><div class="map-view"><canvas id="map-canvas"></canvas><div class="map-coords" id="map-coords">CLIQUE NO TERRENO · X 0 · Y 0 · Z 0</div><div class="map-compass">N ↑</div></div><div class="map-footer"><span>ARRASTAR · ORBITAR</span><span>SCROLL · ZOOM</span><span>SELEÇÃO · TERRENO</span><label>QTD <input id="spawn-count" type="number" value="6" min="1" max="50"></label><label>RAIO <input id="spawn-radius" type="number" value="120" min="10"></label><span id="spawn-result">SISTEMA DE COORDENADAS · METROS</span></div>`;
        const canvas = panel.querySelector('#map-canvas'); const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9b8a4);
        scene.add(new THREE.HemisphereLight(0xecf1db, 0x374333, 2.1)); const light = new THREE.DirectionalLight(0xffe4bc, 3); light.position.set(-220, 370, 190); scene.add(light);
        const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 20000); camera.position.set(500, 560, 700);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true;
        const terrain = createLandscape(scene, { seed: 1427, decorativeRadius: 1250 }); state.map = { scene, camera, renderer, terrain };
        const spawnMarkers = [];
        state.spawns.forEach((spawn) => { const marker = new THREE.Mesh(new THREE.ConeGeometry(10, 28, 5), new THREE.MeshStandardMaterial({ color: 0xe2a866 })); marker.userData.spawn = spawn; scene.add(marker); spawnMarkers.push(marker); });
        const controls = { dragging: false, lastX: 0, lastY: 0, theta: 0.65, phi: 0.62, radius: 13000, target: new THREE.Vector3(0, 0, 0) };
        function updateCamera() {
            camera.position.set(controls.target.x + controls.radius * Math.sin(controls.phi) * Math.sin(controls.theta), controls.target.y + controls.radius * Math.cos(controls.phi), controls.target.z + controls.radius * Math.sin(controls.phi) * Math.cos(controls.theta)); camera.lookAt(controls.target);
            const markerScale = controls.radius > 3000 ? Math.min(5, controls.radius / 2600) : 1;
            for (const marker of spawnMarkers) { const spawn = marker.userData.spawn; marker.scale.setScalar(markerScale); marker.position.set(spawn.x, terrain.heightAt(spawn.x, spawn.z) + 14 * markerScale + 2, spawn.z); }
        }
        const overview = document.createElement('button'); overview.className = 'text-button'; overview.type = 'button'; overview.textContent = 'VER TODA A RESERVA · 8 × 8 KM';
        overview.onclick = () => { controls.theta = 0.65; controls.phi = 0.62; controls.radius = 13000; controls.target.set(0, 0, 0); updateCamera(); };
        panel.querySelector('.map-actions').prepend(overview);
        function resize() { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); updateCamera(); }
        let marker;
        let placementAnimalModel = null;
        const animalModelCache = new Map();
        async function fetchAnimalGltf(modelPath) {
            if (!modelPath) return null;
            if (animalModelCache.has(modelPath)) return animalModelCache.get(modelPath);
            try {
                const loaded = await importModel(`./${modelPath}`, renderer);
                animalModelCache.set(modelPath, loaded);
                return loaded;
            } catch { return null; }
        }
        async function updatePlacementModel(point) {
            if (placementAnimalModel) { scene.remove(placementAnimalModel); placementAnimalModel = null; }
            const animalId = panel.querySelector('#map-animal').value || state.pendingAnimal?.id;
            const animal = state.animals.find((item) => String(item.id) === String(animalId));
            const rotDeg = Number(panel.querySelector('#spawn-rotation').value) || 0;
            const rotY = (rotDeg * Math.PI) / 180;
            const userSpawnScale = Number(panel.querySelector('#spawn-scale').value) || 1;
            if (animal?.modelPath) {
                const gltf = await fetchAnimalGltf(animal.modelPath);
                if (gltf) {
                    const clone = SkeletonUtils.clone(gltf.scene);
                    const bounds = new THREE.Box3().setFromObject(clone);
                    const targetHeight = Number(animal.height) || 2.1;
                    const baseScale = targetHeight / Math.max(bounds.max.y - bounds.min.y, 0.001);
                    const totalScale = baseScale * (Number(animal.scale) || 1) * userSpawnScale;
                    clone.scale.setScalar(totalScale);
                    clone.position.set(
                        point.x,
                        point.y + computeGroundOffsetY(bounds.min.y, totalScale, 0),
                        point.z,
                    );
                    clone.rotation.y = rotY;
                    scene.add(clone);
                    placementAnimalModel = clone;
                    return;
                }
            }
            // Fallback visual com cone caso não haja modelo
            const cone = new THREE.Mesh(new THREE.ConeGeometry(8, 25, 6), new THREE.MeshStandardMaterial({ color: 0x4caf50, emissive: 0x1b5e20 }));
            cone.position.set(point.x, point.y + 12, point.z);
            scene.add(cone);
            placementAnimalModel = cone;
        }

        const placement = document.createElement('div');
        placement.className = 'placement-controls';
        placement.innerHTML = '<label>ROTAÇÃO °<input id="spawn-rotation" type="number" value="0" step="15"></label><label>ESCALA<input id="spawn-scale" type="number" value="1" min="0.1" step="0.1"></label><label>HABITAT<select id="spawn-habitat"><option>Floresta</option><option>Campo</option><option>Montanha</option><option>Margem de água</option></select></label><label>INÍCIO<input id="spawn-start" type="time" value="06:00"></label><label>FIM<input id="spawn-end" type="time" value="18:00"></label>';
        panel.querySelector('.map-footer').before(placement);
        panel.querySelector('#spawn-rotation').oninput = () => { if (state.selectedPoint) updatePlacementModel(state.selectedPoint); };
        panel.querySelector('#spawn-scale').oninput = () => { if (state.selectedPoint) updatePlacementModel(state.selectedPoint); };
        panel.querySelector('#map-animal').onchange = () => { if (state.selectedPoint) updatePlacementModel(state.selectedPoint); };

        canvas.addEventListener('pointerdown', (e) => { controls.dragging = true; controls.lastX = e.clientX; controls.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointerup', async (e) => {
            controls.dragging = false;
            if (Math.abs(e.clientX - controls.lastX) + Math.abs(e.clientY - controls.lastY) > 4) return;
            const rect = canvas.getBoundingClientRect();
            mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(mouse, camera);
            const hit = ray.intersectObject(terrain.terrain, false)[0];
            if (!hit) return;
            const { x, y, z } = hit.point;
            panel.querySelector('#map-coords').textContent = `POSIÇÃO · X ${x.toFixed(1)} · Y ${y.toFixed(1)} · Z ${z.toFixed(1)}`;
            if (marker) scene.remove(marker);
            marker = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 5), new THREE.MeshStandardMaterial({ color: 0xe15335, emissive: 0x341008 }));
            marker.position.set(x, y + 25, z);
            scene.add(marker);
            state.selectedPoint = { x, y, z };
            await updatePlacementModel(state.selectedPoint);
        });
        canvas.addEventListener('pointermove', (e) => { if (!controls.dragging) return; controls.theta -= (e.clientX - controls.lastX) * 0.005; controls.phi = THREE.MathUtils.clamp(controls.phi + (e.clientY - controls.lastY) * 0.005, 0.12, 1.45); controls.lastX = e.clientX; controls.lastY = e.clientY; updateCamera(); });
        canvas.addEventListener('wheel', (e) => { controls.radius = THREE.MathUtils.clamp(controls.radius * (1 + e.deltaY * 0.001), 90, 14000); updateCamera(); }, { passive: true });
        root.querySelector('#save-spawn').onclick = async () => {
            if (!state.selectedPoint) { panel.querySelector('#spawn-result').textContent = 'SELECIONE UM PONTO NO TERRENO'; return; }
            const animalId = panel.querySelector('#map-animal').value || state.pendingAnimal?.id; if (!animalId) { panel.querySelector('#spawn-result').textContent = 'ESCOLHA UM ANIMAL'; return; }
            try {
                await request('./api/?action=spawn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ animalId, ...state.selectedPoint, rotationY: Number(panel.querySelector('#spawn-rotation').value) * Math.PI / 180, scale: Number(panel.querySelector('#spawn-scale').value), count: Number(panel.querySelector('#spawn-count').value), radius: Number(panel.querySelector('#spawn-radius').value), habitat: panel.querySelector('#spawn-habitat').value, startTime: panel.querySelector('#spawn-start').value, endTime: panel.querySelector('#spawn-end').value }) });
                state.pendingAnimal = null;
                panel.querySelector('#spawn-result').textContent = 'SPAWN SALVO · POSIÇÃO PERSISTIDA'; await refresh(); selectTab('spawns');
            } catch (error) { panel.querySelector('#spawn-result').textContent = error.message; }
        };
        const render = () => { if (state.map?.renderer !== renderer) return; renderer.render(scene, camera); state.frame = requestAnimationFrame(render); };
        resize(); window.addEventListener('resize', resize); render();
    }
    function spawnPage() {
        panel.innerHTML = `<div class="toolbar"><p>Distribuição e horários dos animais</p><button class="primary-button" data-open-map>+ POSICIONAR NO MAPA</button></div><div class="spawn-list">${state.spawns.map((spawn) => `<article><span class="spawn-icon">◎</span><strong>${escapeHtml(spawn.name || 'Área de spawn')}</strong><span>${escapeHtml(spawn.habitat || 'Habitat não definido')}</span><span>${spawn.count} animais · raio ${spawn.radius} m</span><small>X ${Number(spawn.x).toFixed(0)} · Y ${Number(spawn.y).toFixed(0)} · Z ${Number(spawn.z).toFixed(0)}</small><button data-delete-spawn="${spawn.id}" title="Excluir spawn">×</button></article>`).join('') || '<p class="empty-state">Nenhuma área configurada.</p>'}</div>`;
        panel.querySelector('[data-open-map]').onclick = () => selectTab('map');
        panel.querySelectorAll('[data-delete-spawn]').forEach((button) => button.onclick = async () => { await request(`./api/?action=spawn&id=${button.dataset.deleteSpawn}`, { method: 'DELETE' }); await refresh(); selectTab('spawns'); });
    }
    function treesPage() {
        const labels = { pine: 'Pinheiro · Pine Tree (evolveduk)', oak: 'Carvalho · Oak Trees (DJMaesen)' };
        panel.innerHTML = `<section class="tree-assets-page"><span class="eyebrow">VEGETAÇÃO DO MAPA</span><h2>Importar modelos de árvores</h2><p>Escolha o arquivo GLB ou o ZIP baixado do Sketchfab. Pacotes ZIP com GLTF e texturas são extraídos automaticamente; as árvores aparecem no mapa ao fechar o painel.</p><form id="tree-assets-form"><div class="tree-asset-grid">${Object.entries(labels).map(([kind, label]) => `<label class="tree-asset-card"><strong>${label}</strong><small>${state.vegetation[kind] ? `Ativo · ${escapeHtml(state.vegetation[kind].split('/').pop())}` : 'Modelo procedural atual'}</small><input name="${kind}" type="file" accept=".glb,.zip,model/gltf-binary,application/zip"><span>GLB ou ZIP · arquivo até 80 MB</span><button type="button" class="text-button" data-reset-tree="${kind}" ${state.vegetation[kind] ? '' : 'disabled'}>VOLTAR AO PROCEDURAL</button></label>`).join('')}</div><p class="import-report" id="tree-import-status">Licenças CC BY: inclua os créditos dos autores se publicar o jogo.</p><button class="primary-button" type="submit">IMPORTAR E APLICAR <span>↗</span></button></form><div class="tree-credits"><a target="_blank" rel="noreferrer" href="https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9">Pine Tree · evolveduk · CC BY</a><a target="_blank" rel="noreferrer" href="https://sketchfab.com/3d-models/oak-trees-d841c3bcc5324daebee50f45619e05fc">Oak Trees · DJMaesen · CC BY</a></div></section>`;
        const form = panel.querySelector('#tree-assets-form');
        form.onsubmit = async (event) => {
            event.preventDefault();
            const status = panel.querySelector('#tree-import-status');
            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                let imported = 0;
                for (const kind of ['pine', 'oak']) {
                    const file = form.elements[kind].files?.[0];
                    if (!file) continue;
                    status.textContent = `Enviando ${labels[kind]}...`;
                    const upload = new FormData(); upload.append('model', file);
                    const result = await request('./api/?action=upload', { method: 'POST', body: upload });
                    await request('./api/?action=vegetation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, modelPath: result.path }) });
                    state.vegetation[kind] = result.path; imported += 1;
                }
                if (!imported) throw new Error('Escolha pelo menos um arquivo GLB ou ZIP para importar.');
                status.textContent = 'Modelos salvos. Feche o administrador para aplicá-los no mapa.';
                treesPage();
            } catch (error) { status.textContent = error.message; }
            finally { const submit = panel.querySelector('#tree-assets-form [type="submit"]'); if (submit) submit.disabled = false; }
        };
        panel.querySelectorAll('[data-reset-tree]').forEach((button) => button.onclick = async () => {
            try {
                const kind = button.dataset.resetTree;
                await request('./api/?action=vegetation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, modelPath: '' }) });
                state.vegetation[kind] = '';
                treesPage();
            } catch (error) { panel.querySelector('#tree-import-status').textContent = error.message; }
        });
    }
    function creditsPage() {
        panel.innerHTML = `<section class="credits-page"><span class="eyebrow">REGISTRO DE PROCEDÊNCIA</span><h2>Créditos e licenças</h2><p>O ambiente deste projeto é gerado proceduralmente. O GLB do rifle ainda precisa ser enviado pelo administrador; nenhum arquivo foi baixado do Sketchfab.</p><div class="credit-line"><strong>Hunting Rifle - Fortnite (PBR)</strong><span>Tylukex / Wicked_Vixx · Sketchfab</span><small>CC BY 4.0 · atribuição exigida · https://sketchfab.com/3d-models/hunting-rifle-fortnite-pbr-2d6cb620d5a8478b9ac83782d1319d47</small></div><div class="credit-line"><strong>Footsteps</strong><span>GboxMikeFozzy · OpenGameArt.org</span><small>CC0 · https://opengameart.org/content/footsteps-0</small></div><div class="credit-line"><strong>Vegetação, relevo e água</strong><span>Geração procedural · Terras Altas</span><small>Sem asset externo</small></div><div class="credit-line"><strong>Modelos importados</strong><span>Enviados pelo administrador</span><small>Registre autoria, licença e URL de origem antes da publicação.</small></div></section>`;
    }
    function selectTab(tab) {
        state.map?.renderer.dispose(); state.map?.terrain.dispose(); state.map = null; state.preview?.dispose(); state.preview = null; state.weaponModel?.dispose(); state.weaponModel = null;
        sidebar.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
        root.querySelector('#section-title').textContent = ({ dashboard: 'Visão geral', animals: 'Animais', weapons: 'Armas', trees: 'Árvores', map: 'Mapa 3D', spawns: 'Áreas de spawn', credits: 'Créditos e licenças' })[tab];
        ({ dashboard, animals: animalPage, weapons: weaponsPage, trees: treesPage, map: mapPage, spawns: spawnPage, credits: creditsPage })[tab]?.();
        if (tab === 'credits') panel.querySelector('.credits-page').insertAdjacentHTML('beforeend', '<div class="credit-line"><strong>Gunshot Sounds · Mosin Nagant</strong><span>Tabasco · OpenGameArt.org</span><small>CC0 · https://opengameart.org/content/gunshot-sounds</small></div>');
    }
    const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    function createPreview(canvas) {
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0x232c25);
        scene.add(new THREE.HemisphereLight(0xf2eedc, 0x453c2d, 2.2));
        const light = new THREE.DirectionalLight(0xffdfa9, 3.2); light.position.set(-3, 8, 5); scene.add(light);
        const fillLight = new THREE.DirectionalLight(0x90a4ae, 1.2); fillLight.position.set(4, 3, -4); scene.add(fillLight);
        const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500); camera.position.set(4.2, 3.2, 5.8); camera.lookAt(0, 1, 0);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        let model; let mixer = null;
        let baseBounds = null;
        let fitScale = 1;
        let userScale = 1;
        let heightOffset = 0;
        let currentTarget = new THREE.Vector3(0, 0.9, 0);

        // Chão de referência plano + grid alinhado em Y = 0
        const floorGroup = new THREE.Group(); scene.add(floorGroup);
        const floorPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 60),
            new THREE.MeshStandardMaterial({ color: 0x3d4f3b, roughness: 0.95, metalness: 0.05 }),
        );
        floorPlane.rotation.x = -Math.PI / 2; floorPlane.position.y = 0;
        const grid = new THREE.GridHelper(60, 40, 0x768a6b, 0x364433);
        grid.position.y = 0.001;
        floorGroup.add(floorPlane, grid);

        const clock = new THREE.Clock();
        function draw() {
            if (state.preview?.renderer !== renderer) return;
            mixer?.update(clock.getDelta());
            renderer.render(scene, camera);
            state.frame = requestAnimationFrame(draw);
        }
        function resize() {
            const rect = canvas.getBoundingClientRect();
            renderer.setSize(rect.width, rect.height);
            camera.aspect = rect.width / Math.max(1, rect.height);
            camera.updateProjectionMatrix();
        }
        function applyGround() {
            if (!model || !baseBounds) return;
            const totalScale = fitScale * userScale;
            model.scale.setScalar(totalScale);
            model.position.y = computeGroundOffsetY(baseBounds.min.y, totalScale, heightOffset);
        }
        function frame() {
            if (!model) return;
            const box = new THREE.Box3().setFromObject(model);
            if (!box.isEmpty()) currentTarget = frameObject(camera, box);
        }

        canvas.addEventListener('pointerdown', (event) => { canvas.dataset.dragX = String(event.clientX); });
        canvas.addEventListener('pointermove', (event) => {
            if (!event.buttons || !model) return;
            const dx = event.clientX - Number(canvas.dataset.dragX || event.clientX);
            model.rotation.y += dx * 0.01;
            canvas.dataset.dragX = String(event.clientX);
        });
        canvas.addEventListener('wheel', (event) => {
            const dir = camera.position.clone().sub(currentTarget);
            const factor = event.deltaY > 0 ? 1.08 : 0.92;
            const len = THREE.MathUtils.clamp(dir.length() * factor, 0.4, 400);
            camera.position.copy(currentTarget).addScaledVector(dir.normalize(), len);
            camera.lookAt(currentTarget);
        }, { passive: true });
        const preview = {
            renderer,
            dispose() { cancelAnimationFrame(state.frame); renderer.dispose(); },
            setModel(gltf) {
                if (model) scene.remove(model);
                state.model = gltf;
                model = gltf.scene;
                mixer = gltf.animations?.length ? new THREE.AnimationMixer(model) : null;
                model.position.set(0, 0, 0);
                model.scale.setScalar(1);
                baseBounds = new THREE.Box3().setFromObject(model);
                const size = baseBounds.getSize(new THREE.Vector3());
                fitScale = computeFitScale(size, 2.2);
                userScale = 1;
                heightOffset = 0;
                applyGround();
                scene.add(model);
                floorGroup.visible = true;
                if (gltf.animations?.length) preview.playAnimation(0);
                frame();
            },
            playAnimation(index) {
                if (!mixer || !state.model?.animations?.[index]) return;
                mixer.stopAllAction();
                mixer.clipAction(state.model.animations[index]).reset().play();
            },
            configure({ scale, height, rotation, frontAxis } = {}) {
                if (!model) return;
                if (scale !== undefined) userScale = Number(scale) || 1;
                if (height !== undefined) heightOffset = Number(height) || 0;
                if (rotation !== undefined || frontAxis !== undefined) {
                    const axisYaw = { '+X': -Math.PI / 2, '-X': Math.PI / 2, '+Z': 0, '-Z': Math.PI }[String(frontAxis ?? '+X').toUpperCase()] ?? -Math.PI / 2;
                    model.rotation.y = axisYaw + (Number(rotation) || 0);
                }
                applyGround();
            },
            adjustToFloor() {
                heightOffset = 0;
                applyGround();
                frame();
                return { height: 0, scale: userScale };
            },
            frameAnimal() { frame(); },
            testMovement() {
                if (mixer && state.model?.animations?.length) preview.playAnimation(0);
                else if (model) model.rotation.y += Math.PI / 2;
            },
            showProcedural() {
                if (model) scene.remove(model);
                state.model = null; mixer = null; baseBounds = null;
                model = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x876142 }));
                body.rotation.z = Math.PI / 2; body.position.y = 1.3; model.add(body); scene.add(model);
                currentTarget.set(0, 1.3, 0);
                camera.position.set(4, 3, 6); camera.lookAt(currentTarget);
            },
        };
        state.preview = preview; preview.showProcedural(); resize(); draw(); return preview;
    }
    root.querySelectorAll('.nav-link').forEach((button) => button.onclick = () => selectTab(button.dataset.tab));
    root.querySelector('#close-admin').onclick = onClose;
    root.querySelector('#logout').onclick = async () => { try { await request('./api/?action=logout', { method: 'POST' }); } finally { onClose(); } };
    refresh();
    return { dispose() { cancelAnimationFrame(state.frame); state.map?.renderer.dispose(); state.map?.terrain.dispose(); state.preview?.dispose(); root.innerHTML = ''; } };
}
