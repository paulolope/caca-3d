import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animalForHit, raycastFromReticle } from '../src/world/game.js';

test('tiro acerta o objeto sob o centro da mira, não o deslocado ao lado', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    const centered = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    centered.position.set(0, 0, -10);
    const offset = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    offset.position.set(4, 0, -10);
    centered.updateMatrixWorld(true); offset.updateMatrixWorld(true);

    const hit = raycastFromReticle(camera, new THREE.Raycaster(), [offset, centered], 100);
    assert.equal(hit?.object, centered);
});

test('raycast da mira respeita alcance da arma', () => {
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);
    camera.lookAt(0, 0, -1);
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    target.position.set(0, 0, -20);
    target.updateMatrixWorld(true);

    assert.equal(raycastFromReticle(camera, new THREE.Raycaster(), [target], 10), null);
});

test('acerto pertence ao animal atingido mesmo quando IDs coincidem', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
    camera.lookAt(0, 0, -1);
    const sideGroup = new THREE.Group();
    sideGroup.userData.animalId = 'duplicate';
    sideGroup.position.set(4, 0, -10);
    const sideBody = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    sideBody.userData.animalId = 'duplicate'; sideGroup.add(sideBody);
    const centerGroup = new THREE.Group();
    centerGroup.userData.animalId = 'duplicate';
    centerGroup.position.set(0, 0, -10);
    const centerBody = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    centerBody.userData.animalId = 'duplicate'; centerGroup.add(centerBody);
    sideGroup.updateMatrixWorld(true); centerGroup.updateMatrixWorld(true);
    const sideAnimal = { id: 'duplicate', group: sideGroup, dead: false };
    const centerAnimal = { id: 'duplicate', group: centerGroup, dead: false };
    const hit = raycastFromReticle(camera, new THREE.Raycaster(), [sideGroup, centerGroup], 100);

    assert.equal(hit?.object, centerBody);
    assert.equal(animalForHit([sideAnimal, centerAnimal], hit.object), centerAnimal);
});
