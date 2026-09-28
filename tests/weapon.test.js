import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapon, DEFAULT_WEAPON } from '../src/world/weapon.js';

test('hunting rifle defaults expose tunable ammo, optics, socket and recoil', () => {
    assert.equal(DEFAULT_WEAPON.magazineSize, 5);
    assert.equal(DEFAULT_WEAPON.reserveAmmo, 25);
    assert.ok(DEFAULT_WEAPON.zoom > 1);
    assert.ok(DEFAULT_WEAPON.recoilRecovery > 0);
    assert.equal(DEFAULT_WEAPON.license, 'CC BY 4.0');
});

test('weapon socket, muzzle point, aiming and fire lock are functional', () => {
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
    const weapon = createWeapon(camera);
    assert.equal(weapon.socket.name, 'WeaponSocket');
    assert.equal(weapon.muzzlePoint.name, 'MuzzlePoint');
    assert.equal(weapon.modelRoot.children[0].name, 'HuntingRifleProcedural');
    assert.equal(weapon.fire(10).fired, true);
    assert.equal(weapon.ammo, 4);
    assert.equal(weapon.fire(10.1).fired, false);
    weapon.setAim(true);
    assert.equal(weapon.aiming, true);
    weapon.dispose();
});
