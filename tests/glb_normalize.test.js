import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    readGlbJson,
    rebuildGlb,
    normalizeSpecGloss,
    resolveTextures,
    SPEC_GLOSS_EXTENSION,
} from '../src/admin/glb.js';

function findAnyDeerGlb() {
    const dir = 'c:/xampp/htdocs/CAÇA-3D/uploads/models';
    const match = readdirSync(dir).find((name) => name.endsWith('.glb'));
    if (!match) throw new Error('nenhum GLB em uploads/models');
    return join(dir, match);
}

test('readGlbJson extrai o JSON e valida formato do container GLB', () => {
    const file = findAnyDeerGlb();
    const buffer = readFileSync(file);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { json, jsonLength } = readGlbJson(arrayBuffer);
    assert.ok(json, 'deve retornar JSON');
    assert.equal(json.asset?.version, '2.0');
    assert.ok(jsonLength > 0);
});

test('normalizeSpecGloss converte KHR_materials_pbrSpecularGlossiness para pbrMetallicRoughness', () => {
    const synthetic = {
        extensionsUsed: [SPEC_GLOSS_EXTENSION, 'KHR_draco_mesh_compression'],
        extensionsRequired: [SPEC_GLOSS_EXTENSION],
        materials: [
            {
                name: 'Mat_Antler',
                extensions: {
                    [SPEC_GLOSS_EXTENSION]: {
                        diffuseFactor: [0.8, 0.8, 0.8, 1],
                        diffuseTexture: { index: 1 },
                        glossinessFactor: 0.2,
                        specularFactor: [0.04, 0.04, 0.04],
                    },
                },
            },
            {
                name: 'Mat_StandardPbr',
                pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
            },
        ],
    };

    const { converted } = normalizeSpecGloss(synthetic);
    assert.deepEqual(converted, ['Mat_Antler']);
    assert.equal(synthetic.extensionsUsed.includes(SPEC_GLOSS_EXTENSION), false, 'extensão removida de extensionsUsed');
    assert.equal(synthetic.extensionsRequired, undefined, 'extensionsRequired removida quando vazia');
    const antler = synthetic.materials[0];
    assert.equal(antler.extensions, undefined, 'bloco de extensão removido do material');
    assert.deepEqual(antler.pbrMetallicRoughness.baseColorFactor, [0.8, 0.8, 0.8, 1]);
    assert.deepEqual(antler.pbrMetallicRoughness.baseColorTexture, { index: 1 });
    assert.ok(Math.abs(antler.pbrMetallicRoughness.roughnessFactor - 0.8) < 1e-4, 'roughness = 1 - glossiness');
    assert.ok(antler.pbrMetallicRoughness.metallicFactor >= 0 && antler.pbrMetallicRoughness.metallicFactor <= 1);
});

test('rebuildGlb gera um GLB binário válido que é legível novamente', () => {
    const file = findAnyDeerGlb();
    const buffer = readFileSync(file);
    const original = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { json } = readGlbJson(original);
    const { converted } = normalizeSpecGloss(json);
    assert.ok(converted.length > 0, 'deer.glb real possui materiais KHR spec/gloss');
    const rebuilt = rebuildGlb(original, json);
    assert.ok(rebuilt instanceof ArrayBuffer);
    const parsedAgain = readGlbJson(rebuilt);
    assert.ok(parsedAgain.json, 'deve reler o GLB remontado');
    assert.equal(parsedAgain.json.materials[0].pbrMetallicRoughness.baseColorTexture?.index, 0);
    assert.equal(parsedAgain.json.materials[0].extensions, undefined);
});

test('resolveTextures valida texturas embutidas em bufferView como encontradas', async () => {
    const json = {
        images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
        textures: [{ source: 0 }],
        materials: [{ name: 'Mat', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    };
    const { found, missing } = await resolveTextures(json, '');
    assert.equal(found.length, 1);
    assert.equal(missing.length, 0);
});

test('resolveTextures remove referência morta e registra TEXTURA NÃO ENCONTRADA', async () => {
    const json = {
        images: [{ uri: 'textures/missing.png' }],
        textures: [{ source: 0 }],
        materials: [{ name: 'Pele', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    };
    const { found, missing } = await resolveTextures(json, '');
    assert.equal(found.length, 0);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].material, 'Pele');
    assert.equal(missing[0].file, 'textures/missing.png');
    assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture, undefined, 'referência morta removida para evitar falha no GLTFLoader');
});

