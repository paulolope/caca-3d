import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Extensão usada por modelos antigos (ex.: Sketchfab 0.6) onde a cor fica em
// material.extensions.KHR_materials_pbrSpecularGlossiness.diffuseTexture em vez de
// pbrMetallicRoughness.baseColorTexture. O GLTFLoader do three ignora a extensão e
// devolve material branco sem mapa — era por isso que o animal aparecia sem textura.
export const SPEC_GLOSS_EXTENSION = 'KHR_materials_pbrSpecularGlossiness';

const GLB_MAGIC = 0x46546c67; // 'glTF' lido em little-endian
const CHUNK_JSON = 0x4e4f534a; // 'JSON' lido em little-endian

/** Lê apenas o JSON do container GLB. Lança erro claro se não for GLB válido. */
export function readGlbJson(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 20) throw new Error('arquivo GLB truncado');
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('cabeçalho GLB inválido');
    if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('chunk JSON ausente');
    const length = view.getUint32(12, true);
    if (20 + length > arrayBuffer.byteLength) throw new Error('chunk JSON fora do arquivo');
    const text = new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, length));
    return { json: JSON.parse(text.replace(/[\u0000\s]+$/u, '')), jsonLength: length };
}

/** Remonta o GLB com o JSON (possivelmente alterado) preservando o binário original. */
export function rebuildGlb(arrayBuffer, json) {
    const bytes = new TextEncoder().encode(JSON.stringify(json));
    const padding = (4 - (bytes.length % 4)) % 4;
    const jsonChunkLength = bytes.length + padding;
    const original = new Uint8Array(arrayBuffer);
    const originalJsonLength = new DataView(arrayBuffer).getUint32(12, true);
    const rest = original.subarray(12 + 8 + originalJsonLength);
    const total = 12 + 8 + jsonChunkLength + rest.length;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, GLB_MAGIC, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonChunkLength, true);
    view.setUint32(16, CHUNK_JSON, true);
    out.set(bytes, 20);
    out.fill(0x20, 20 + bytes.length, 20 + jsonChunkLength);
    out.set(rest, 20 + jsonChunkLength);
    return out.buffer;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Converte KHR_materials_pbrSpecularGlossiness para o PBR metallic-roughness padrão.
 * Mantém o mesmo pipeline do GLTFLoader usado pela arma — nada de loader paralelo.
 */
export function normalizeSpecGloss(json) {
    const converted = [];
    const warnings = [];
    for (const material of json.materials ?? []) {
        const specGloss = material.extensions?.[SPEC_GLOSS_EXTENSION];
        if (!specGloss) continue;
        const pbr = material.pbrMetallicRoughness ?? (material.pbrMetallicRoughness = {});
        if (specGloss.diffuseFactor && pbr.baseColorFactor === undefined) pbr.baseColorFactor = specGloss.diffuseFactor;
        if (specGloss.diffuseTexture && pbr.baseColorTexture === undefined) pbr.baseColorTexture = specGloss.diffuseTexture;
        if (pbr.roughnessFactor === undefined) pbr.roughnessFactor = specGloss.glossinessFactor === undefined ? 1 : clamp01(1 - specGloss.glossinessFactor);
        if (pbr.metallicFactor === undefined) pbr.metallicFactor = specGloss.specularFactor ? clamp01(average(specGloss.specularFactor)) : 0;
        if (specGloss.specularGlossinessTexture) warnings.push(`${material.name || '(sem nome)'}: specularGlossinessTexture aproximada pelos fatores`);
        delete material.extensions[SPEC_GLOSS_EXTENSION];
        if (material.extensions && Object.keys(material.extensions).length === 0) delete material.extensions;
        converted.push(material.name || '(sem nome)');
    }
    for (const key of ['extensionsUsed', 'extensionsRequired']) {
        if (!json[key]) continue;
        json[key] = json[key].filter((name) => name !== SPEC_GLOSS_EXTENSION);
        if (json[key].length === 0) delete json[key];
    }
    return { converted, warnings };
}

/** Lista [nomeDoSlot, contêiner, chave] de cada textura realmente referenciada. */
function textureSlots(material) {
    const pbr = material.pbrMetallicRoughness ?? {};
    return [
        ['baseColorTexture', pbr, 'baseColorTexture'],
        ['metallicRoughnessTexture', pbr, 'metallicRoughnessTexture'],
        ['normalTexture', material, 'normalTexture'],
        ['occlusionTexture', material, 'occlusionTexture'],
        ['emissiveTexture', material, 'emissiveTexture'],
    ].filter(([, container, key]) => container[key] && typeof container[key].index === 'number');
}

function imageOfTexture(json, textureIndex) {
    const texture = json.textures?.[textureIndex];
    return texture && Number.isInteger(texture.source) ? json.images?.[texture.source] : undefined;
}

/**
 * Confere cada textura referenciada pelos materiais.
 *  · embutida (bufferView) ou data URI  → ok, o próprio GLTFLoader decodifica;
 *  · URI externa com pasta conhecida   → testa o arquivo e mantém a referência;
 *  · URI externa sem base / 404        → remove a referência e registra a falha.
 * Os índices de json.textures não mudam (o GLTFLoader só resolve texturas usadas
 * por materiais), então remoção da referência é segura.
 */
export async function resolveTextures(json, basePath, probe) {
    const check = probe ?? ((target) => fetch(target));
    const found = [];
    const missing = [];
    const dead = new Set();
    for (const material of json.materials ?? []) {
        const owner = material.name || '(sem nome)';
        for (const [slot, container, key] of textureSlots(material)) {
            const image = imageOfTexture(json, container[key].index);
            if (image && (!image.uri || image.uri.startsWith('data:'))) { found.push({ material: owner, slot }); continue; }
            const file = image?.uri ?? '(textura sem imagem)';
            let ok = false;
            if (image?.uri && basePath) {
                try { ok = (await check(basePath + image.uri)).ok; } catch { ok = false; }
            }
            if (ok) found.push({ material: owner, slot, file: image.uri });
            else { missing.push({ material: owner, slot, file }); dead.add(container[key].index); }
        }
    }
    if (dead.size) {
        for (const material of json.materials ?? []) {
            for (const [, container, key] of textureSlots(material)) if (dead.has(container[key].index)) delete container[key];
        }
    }
    return { found, missing };
}

const formatLength = (value) => (value > 10 ? `${value.toFixed(2)} cm (${(value / 100).toFixed(2)} m)` : `${value.toFixed(2)} m`);
const formatBytes = (value) => (value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`);
const urlDirectory = (url) => url.split('/').slice(0, -1).join('/') + '/';




/**
 * Ponto de entrada único usado pela arma e pelos animais: lê o GLB, normaliza o
 * PBR, valida as texturas e entrega ao GLTFLoader (mesmo pipeline da arma).
 */
export async function importModel(fileOrUrl, renderer) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/basis/');
    if (renderer) {
        ktx2.detectSupport(renderer);
        loader.setKTX2Loader(ktx2);
    }
    const isFile = typeof fileOrUrl !== 'string';
    const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`não foi possível baixar o arquivo (HTTP ${response.status})`);
        const basePath = isFile ? '' : urlDirectory(url);
        const isGltf = !isFile && new URL(url, location.href).pathname.toLowerCase().endsWith('.gltf');
        let rawSize; let converted = []; let warnings = []; let found = []; let missing = []; let gltf;
        if (isGltf) {
            const raw = await response.text(); rawSize = new TextEncoder().encode(raw).byteLength;
            const json = JSON.parse(raw);
            ({ converted, warnings } = normalizeSpecGloss(json));
            gltf = await loader.parseAsync(JSON.stringify(json), basePath);
        } else {
            const raw = await response.arrayBuffer(); rawSize = raw.byteLength;
            const { json } = readGlbJson(raw);
            ({ converted, warnings } = normalizeSpecGloss(json));
            ({ found, missing } = await resolveTextures(json, basePath));
            const data = converted.length || missing.length ? rebuildGlb(raw, json) : raw;
            gltf = await loader.parseAsync(data, basePath);
        }

        const meshes = [];
        let bones = 0; let morphs = 0; let materials = 0; let textures = 0;
        gltf.scene.traverse((object) => {
            if (object.isMesh || object.isSkinnedMesh) {
                meshes.push(object);
                object.castShadow = true; object.receiveShadow = true;
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    if (!material) continue;
                    materials += 1;
                    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) if (material[key]?.isTexture) textures += 1;
                    if (!material.map && material.color?.getHex() === 0xffffff) material.color.setHex(0x887f70);
                    material.needsUpdate = true;
                }
            }
            if (object.isBone) bones += 1;
            if (object.morphTargetDictionary) morphs += Object.keys(object.morphTargetDictionary).length;
        });

        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
        const fileName = isFile ? fileOrUrl.name : decodeURIComponent(url.split('/').pop().split('?')[0]);
        const skins = gltf.parser?.json?.skins?.length ?? 0;
        const animations = gltf.animations ?? [];

        const diagnostics = {
            fileName,
            fileSize: rawSize,
            meshes: meshes.length,
            materials,
            textures: found.length,
            texturesMissing: missing,
            bones,
            skeleton: skins,
            animations: animations.length,
            morphTargets: morphs,
            boundingBox: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
            height: size.y,
            convertedMaterials: converted,
        };

        const lines = [
            `MODELO: ${fileName} · ${formatBytes(rawSize)}`,
            `Meshes: ${meshes.length} · Materiais: ${materials}`,
            `Texturas: ${found.length} · Texturas ausentes: ${missing.length}`,
            `Bones: ${bones} · Skeleton: ${skins}`,
            `Animações: ${animations.length} · Morph targets: ${morphs}`,
            `Bounding box: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`,
            `Altura: ${formatLength(size.y)}`,
        ];
        if (converted.length) lines.push(`Materiais convertidos: ${converted.join(', ')} (${SPEC_GLOSS_EXTENSION})`);
        for (const note of warnings) lines.push(`AVISO: ${note}`);
        for (const entry of missing) lines.push(`TEXTURA NÃO ENCONTRADA · arquivo: ${entry.file} · material: ${entry.material} (${entry.slot})`);

        return { ...gltf, report: lines.join('\n'), diagnostics, missingTextures: missing, convertedMaterials: converted };
    } catch (error) {
        throw new Error(`Não foi possível ler o GLB: ${error.message}`);
    } finally {
        if (isFile) URL.revokeObjectURL(url);
        draco.dispose(); ktx2.dispose();
    }
}
