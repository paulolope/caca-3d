import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECT_RANGE, REGION_BONUS, collectReward } from '../src/world/game.js';

test('recompensa do animal abatido considera peso e região de acerto', () => {
    assert.equal(collectReward({ weight: 100, hitRegion: 'Corpo' }), 200);
    assert.equal(collectReward({ weight: 100, hitRegion: 'Pulmão' }), 240);
    assert.equal(collectReward({ weight: 100, hitRegion: 'Cabeça' }), 300);
});

test('recompensa cai no bônus de corpo quando a região é desconhecida', () => {
    assert.equal(collectReward({ weight: 80, hitRegion: 'Pata' }), 160);
    assert.equal(collectReward({ weight: 80 }), 160);
});

test('recompensa tolera dados ausentes ou inválidos', () => {
    assert.equal(collectReward({ weight: 'abc', hitRegion: 'Corpo' }), 0);
    assert.equal(collectReward({}), 0);
    assert.equal(collectReward({ weight: 0, hitRegion: 'Cabeça' }), 0);
});

test('alcance de coleta e bônus por região permanecem consistentes', () => {
    assert.equal(COLLECT_RANGE, 5);
    assert.equal(REGION_BONUS['Cabeça'], 1.5);
    assert.equal(REGION_BONUS['Pulmão'], 1.2);
    assert.equal(REGION_BONUS['Corpo'], 1);
});
