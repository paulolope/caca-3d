import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight } from '../src/world/landscape.js';

test('terrain is deterministic at the same world coordinate', () => {
    assert.equal(terrainHeight(140, -320), terrainHeight(140, -320));
});

test('terrain has meaningful elevation variation across the reserve', () => {
    const samples = [[0, 0], [1100, -700], [-2100, 1700], [3500, 2900]].map(([x, z]) => terrainHeight(x, z));
    assert.ok(Math.max(...samples) - Math.min(...samples) > 5);
});
