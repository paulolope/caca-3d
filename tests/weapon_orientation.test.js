import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createWeapon, createProceduralRifle } from '../src/world/weapon.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RIFLE_GLB = path.join(here, '..', 'uploads', 'models', '6e4b0a4ca4ddc70c1b15beac62d337c1.glb');

function toSocketSpace(weapon, point) {
    weapon.socket.updateWorldMatrix(true, false);
    return point.clone().applyMatrix4(new THREE.Matrix4().copy(weapon.socket.matrixWorld).invert());
}

function worldOf(weapon, object) {
    return object.getWorldPosition(new THREE.Vector3());
}

function assertAlignedWithCamera(weapon, camera, label) {
    camera.updateMatrixWorld(true);
    const barrel = worldOf(weapon, weapon._testBarrel);
    const stock = worldOf(weapon, weapon._testStock);
    const up = worldOf(weapon, weapon._testUp);
    const upRef = worldOf(weapon, weapon._testUpRef);

    // Espaço do WeaponSocket: isola a orientação do rifle da pose configurada do socket.
    const socketBarrel = toSocketSpace(weapon, barrel).sub(toSocketSpace(weapon, stock)).normalize();
    const socketUp = toSocketSpace(weapon, up).sub(toSocketSpace(weapon, upRef)).normalize();
    assert.ok(socketBarrel.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-3, `${label}: cano deve apontar para -Z no socket, veio ${socketBarrel.toArray()}`);
    assert.ok(socketUp.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-3, `${label}: topo da arma deve ficar em +Y, veio ${socketUp.toArray()}`);

    // Espaço da câmera: o cano acompanha yaw/pitch da câmera.
    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const cameraBarrel = barrel.clone().sub(stock).normalize();
    assert.ok(cameraBarrel.dot(cameraForward) > 0.999, `${label}: cano deve seguir o forward da câmera, dot=${cameraBarrel.dot(cameraForward).toFixed(5)}`);

    // Profundidade na direção do olhar: coronha mais perto do player, cano mais longe.
    const stockDepth = stock.clone().sub(cameraPosition).dot(cameraForward);
    const barrelDepth = barrel.clone().sub(cameraPosition).dot(cameraForward);
    assert.ok(stockDepth > 0 && barrelDepth > 0, `${label}: arma deve ficar à frente da câmera (coronha=${stockDepth.toFixed(3)}, cano=${barrelDepth.toFixed(3)})`);
    assert.ok(barrelDepth > stockDepth, `${label}: cano (${barrelDepth.toFixed(3)}) deve ficar mais longe que a coronha (${stockDepth.toFixed(3)})`);
}

function attachTestMarkers(weapon, model) {
    const find = (name) => {
        let hit = null;
        model.traverse((object) => { if (object.name === name) hit = object; });
        return hit;
    };
    weapon._testBarrel = find('test-barrel-tip');
    weapon._testStock = find('test-stock-end');
    weapon._testUp = find('test-top');
    weapon._testUpRef = find('test-axis');
    assert.ok(weapon._testBarrel && weapon._testStock && weapon._testUp && weapon._testUpRef, 'marcadores de eixo devem existir no modelo');
}

// Réplica do eixo frontal do GLB do rifle: cano em +Z de cena, topo em +Y.
function buildStandInGltf() {
    const scene = new THREE.Group();
    scene.name = 'StandInRifle';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 1.2), new THREE.MeshStandardMaterial());
    body.position.set(0, 0.05, 0.46);
    scene.add(body);
    const marker = (name, position) => {
        const object = new THREE.Object3D();
        object.name = name;
        object.position.set(...position);
        scene.add(object);
    };
    marker('test-barrel-tip', [0, 0, 1.05]);
    marker('test-stock-end', [0, 0, -0.14]);
    marker('test-axis', [0, 0.05, 0.46]);
    marker('test-top', [0, 0.15, 0.46]);
    return { scene, animations: [] };
}

function readGlb(file) {
    const buffer = fs.readFileSync(file);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
    return { buffer, json, binOffset: 20 + jsonLength + 8 };
}

// Reconstrói a hierarquia do GLB (nós com matriz) e marca o eixo do cano a partir dos vértices.
function buildGltfFromGlb(file) {
    const { buffer, json, binOffset } = readGlb(file);
    const objects = json.nodes.map((node) => {
        const object = new THREE.Object3D();
        object.name = node.name ?? '';
        if (node.matrix) object.matrix.fromArray(node.matrix);
        object.matrixAutoUpdate = false;
        return object;
    });
    json.nodes.forEach((node, index) => (node.children ?? []).forEach((child) => objects[index].add(objects[child])));
    const scene = new THREE.Group();
    scene.add(objects[json.scenes[json.scene ?? 0].nodes[0]]);

    const meshNodeIndex = json.nodes.findIndex((node) => node.mesh !== undefined);
    const meshObject = objects[meshNodeIndex];

    const primitive = json.meshes[json.nodes[meshNodeIndex].mesh].primitives[0];
    const accessor = json.accessors[primitive.attributes.POSITION];
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = binOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const floats = new Float32Array(buffer.buffer, buffer.byteOffset + start, accessor.count * 3);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < accessor.count; i++) {
        for (let axis = 0; axis < 3; axis++) {
            const value = floats[i * 3 + axis];
            min[axis] = Math.min(min[axis], value);
            max[axis] = Math.max(max[axis], value);
        }
    }
    const center = min.map((value, axis) => (value + max[axis]) / 2);

    // Envelope real do rifle: reproduz o auto-fit e a centralização feitos pelo jogo.
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(...max.map((value, axis) => value - min[axis])),
        new THREE.MeshStandardMaterial(),
    );
    body.position.set(...center);
    meshObject.add(body);

    const marker = (name, position) => {
        const object = new THREE.Object3D();
        object.name = name;
        object.position.set(...position);
        meshObject.add(object);
    };
    // Espaço cru do mesh: eixo longo = Y (cano em Y mínimo, coronha em Y máximo), topo em +Z.
    marker('test-barrel-tip', [center[0], min[1], center[2]]);
    marker('test-stock-end', [center[0], max[1], center[2]]);
    marker('test-axis', [center[0], center[1], center[2]]);
    marker('test-top', [center[0], center[1], center[2] + 0.1]);
    return { scene, animations: [] };
}

test('GLB rifle barrel points to the camera forward after loading', () => {
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
    const weapon = createWeapon(camera);
    weapon.setModel(buildStandInGltf());
    attachTestMarkers(weapon, weapon.modelRoot.children[0]);
    assertAlignedWithCamera(weapon, camera, 'quadril');
    weapon.dispose();
});

test('rifle follows camera yaw and pitch keeping the barrel forward', () => {
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
    const weapon = createWeapon(camera);
    weapon.setModel(buildStandInGltf());
    attachTestMarkers(weapon, weapon.modelRoot.children[0]);

    for (const [label, yaw, pitch] of [
        ['esquerda', 1.1, 0],
        ['direita', -1.1, 0],
        ['cima', 0, -0.7],
        ['baixo', 0, 0.7],
    ]) {
        camera.rotation.set(pitch, yaw, 0);
        camera.updateMatrixWorld(true);
        assertAlignedWithCamera(weapon, camera, label);
    }

    // Mira (ADS): alinhamento mantido depois da transição de pose.
    camera.rotation.set(0, 0, 0);
    weapon.setAim(true);
    for (let i = 0; i < 40; i++) weapon.update(1, {});
    assert.equal(weapon.aiming, true);
    camera.updateMatrixWorld(true);
    const barrel = worldOf(weapon, weapon._testBarrel);
    const stock = worldOf(weapon, weapon._testStock);
    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(barrel.clone().sub(stock).normalize().dot(cameraForward) > 0.999, 'mira deve manter o cano no forward da câmera');

    // Disparo continua funcional.
    assert.equal(weapon.fire(10).fired, true);
    assert.equal(weapon.ammo, 4);
    weapon.dispose();
});

test('hunting rifle GLB muzzle is aligned with the camera forward', (t) => {
    if (!fs.existsSync(RIFLE_GLB)) return t.skip('GLB do rifle não encontrado');
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
    const weapon = createWeapon(camera);
    weapon.setModel(buildGltfFromGlb(RIFLE_GLB));
    attachTestMarkers(weapon, weapon.modelRoot.children[0]);
    assertAlignedWithCamera(weapon, camera, 'GLB real');
    weapon.dispose();
});

test('procedural rifle keeps pointing forward without a GLB', () => {
    const rifle = createProceduralRifle();
    assert.ok(rifle.userData.muzzlePoint.z < 0, 'rifle procedural deve continuar apontando para -Z');
});

