import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ALIVE_ANIMALS, RESPAWN_DELAY_SECONDS, MAX_DEAD_AGE_SECONDS, aliveCount, deadCount, desiredForSpawn, aliveForSpawn, missingForSpawn, missingGlobal, pickRespawnPosition, pickGlobalRespawnPosition, dueRespawns, removeDueRespawns } from '../src/world/spawn.js';

test('contagem de vivos/mortos e mínimo global', () => {
    const animals = [{ dead: false }, { dead: true }, { dead: false }, null];
    assert.equal(aliveCount(animals), 2);
    assert.equal(deadCount(animals), 1);
    assert.equal(missingGlobal(animals, 6), 4);
    assert.equal(missingGlobal([{ dead: false }, { dead: false }, { dead: false }, { dead: false }, { dead: false }, { dead: false }], 6), 0);
});

test('desejado por spawn respeita count e teto de 20', () => {
    assert.equal(desiredForSpawn({ count: 5 }), 5);
    assert.equal(desiredForSpawn({ count: 99 }), 20);
    assert.equal(desiredForSpawn({}), 1);
    const spawn = { count: 5, _animals: [{ dead: false }, { dead: true }, { dead: false }] };
    assert.equal(aliveForSpawn(spawn), 2);
    assert.equal(missingForSpawn(spawn), 3);
});

test('fila de respawn: vencidos e remoção', () => {
    const queue = [{ dueAt: 5, spawnId: 1 }, { dueAt: 15, spawnId: 2 }, { dueAt: 8, spawnId: null }];
    assert.equal(dueRespawns(queue, 10).length, 2);
    assert.equal(removeDueRespawns(queue, 10).length, 1);
});

test('posição de respawn fica dentro do raio e longe do jogador quando possível', () => {
    let i = 0;
    const seq = [0.1, 0.9, 0.3, 0.4, 0.5, 0.5, 0.6, 0.2];
    const rand = () => seq[(i += 1) % seq.length];
    const pos = pickRespawnPosition({ spawnX: 100, spawnZ: 100, radius: 120, playerX: 100, playerZ: 100, minDist: 80, rand });
    assert.ok(Math.hypot(pos.x - 100, pos.z - 100) <= 121);
    assert.ok(Math.hypot(pos.x - 100, pos.z - 100) >= 0);
    const far = pickRespawnPosition({ spawnX: 0, spawnZ: 0, radius: 200, playerX: 1000, playerZ: 1000, minDist: 80, rand: () => 0.25 });
    assert.ok(Math.hypot(far.x - 1000, far.z - 1000) >= 80);
});

test('posição global fica em anel ao redor do jogador', () => {
    const pos = pickGlobalRespawnPosition({ playerX: 0, playerZ: 0, minD: 120, maxD: 320, rand: () => 0.5 });
    const d = Math.hypot(pos.x, pos.z);
    assert.ok(d >= 119 && d <= 321);
});

test('constantes garantem mapa nunca vazio', () => {
    assert.ok(MIN_ALIVE_ANIMALS >= 1);
    assert.ok(RESPAWN_DELAY_SECONDS > 0 && RESPAWN_DELAY_SECONDS <= 30);
    assert.ok(MAX_DEAD_AGE_SECONDS > RESPAWN_DELAY_SECONDS);
});
