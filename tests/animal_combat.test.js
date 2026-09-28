import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAnimal, minimumDamageForThreeShotKill } from '../src/world/animals.js';

test('dano mínimo escala com a vida para garantir morte em até três tiros', () => {
    assert.equal(minimumDamageForThreeShotKill(100, 1), 34);
    assert.equal(minimumDamageForThreeShotKill(400, 1), 134);
    assert.equal(minimumDamageForThreeShotKill(100, 65), 65);
});

test('animal com vida personalizada morre no terceiro tiro no corpo', () => {
    const scene = new THREE.Scene();
    const animal = createAnimal(scene, {
        id: 'combat-test',
        position: new THREE.Vector3(0, 0, 0),
        settings: { health: 400 },
    });
    const impact = new THREE.Vector3(0, 1, 0);

    animal.hit(impact, 10, 1);
    assert.equal(animal.dead, false);
    animal.hit(impact, 10, 1);
    assert.equal(animal.dead, false);
    animal.hit(impact, 10, 1);
    assert.equal(animal.dead, true);
    scene.clear();
});

test('animal sem clip de morte termina deitado pela pose procedural', () => {
    const scene = new THREE.Scene();
    const animal = createAnimal(scene, {
        id: 'death-pose-test',
        position: new THREE.Vector3(0, 0, 0),
    });

    animal.hit(new THREE.Vector3(0, 1, 0), 10, 100);
    for (let frame = 0; frame < 20; frame += 1) animal.update(0.05, new THREE.Vector3());
    assert.equal(animal.dead, true);
    assert.ok(Math.abs(animal.group.rotation.x - Math.PI / 2) < 1e-6);
    scene.clear();
});

test('rota lateral persiste enquanto o alvo direto continua bloqueado', () => {
    const scene = new THREE.Scene();
    const animal = createAnimal(scene, {
        id: 'navigation-detour-test',
        position: new THREE.Vector3(0, 0, 0),
    });
    animal.state = 'MOVE';
    animal.target = { x: 0, z: 100 };
    animal.arrivalRadius = 1;
    const tree = { x: 0, z: 4, radius: 2, height: 6 };
    const context = { groundHeight: () => 0, obstaclesNear: () => [tree] };

    animal.update(0.05, new THREE.Vector3(-100, 0, -100), context);
    const detour = animal.navigationDetourAngle;
    assert.ok(Number.isFinite(detour));
    assert.notEqual(detour, 0);
    animal.update(0.05, new THREE.Vector3(-100, 0, -100), context);
    assert.equal(animal.navigationDetourAngle, detour);
    assert.ok(animal.group.rotation.y > 0);
    scene.clear();
});
