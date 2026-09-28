import * as THREE from 'three';

export const DEFAULT_WEAPON = Object.freeze({
    id: 'hunting-rifle',
    name: 'Hunting Rifle',
    weaponType: 'rifle',
    damage: 65,
    range: 650,
    fireRate: 1.15,
    magazineSize: 5,
    reserveAmmo: 25,
    reloadTime: 2.2,
    recoilVertical: 0.032,
    recoilHorizontal: 0.009,
    recoilRecovery: 7,
    zoom: 5,
    modelScale: 0.58,
    positionX: 0.31,
    positionY: -0.3,
    positionZ: -0.72,
    rotationX: -0.02,
    rotationY: 0,
    rotationZ: 0,
    muzzleX: 0,
    muzzleY: 0.07,
    muzzleZ: -0.65,
    modelPath: '',
    author: 'Tylukex / Wicked_Vixx',
    license: 'CC BY 4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/hunting-rifle-fortnite-pbr-2d6cb620d5a8478b9ac83782d1319d47',
});

const forward = new THREE.Vector3(0, 0, -1);

// Eixo frontal do rifle importado por GLB.
// Compondo as matrizes dos nós (Sketchfab_model -> fbx -> RootNode -> SK_Old_Hunting_Rifle_LOD0)
// o cano do modelo resulta em +Z de cena, enquanto o topo da arma (scope) fica em +Y.
// A câmera do three.js olha para -Z, ou seja, o GLB nasce com 180° de diferença em Y.
// Um giro puro de 180° em Y leva +Z -> -Z (cano na direção da câmera), mantém +Y -> +Y
// (arma de pé) e preserva o centro do modelo, sem alterar o arquivo original.
const GLB_FORWARD_YAW = Math.PI;

function addPart(group, geometry, material, position, rotation = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}

export function createProceduralRifle() {
    const rifle = new THREE.Group();
    rifle.name = 'HuntingRifleProcedural';
    const stock = new THREE.MeshStandardMaterial({ color: 0x624733, roughness: 0.78 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x242927, roughness: 0.34, metalness: 0.78 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x302f29, roughness: 0.88 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x253b37, roughness: 0.2, metalness: 0.45 });

    addPart(rifle, new THREE.BoxGeometry(0.15, 0.14, 0.5), stock, [0, 0, 0.13]);
    addPart(rifle, new THREE.BoxGeometry(0.18, 0.19, 0.32), metal, [0, 0.025, -0.1]);
    addPart(rifle, new THREE.BoxGeometry(0.12, 0.08, 0.18), stock, [0, -0.06, -0.02]);
    addPart(rifle, new THREE.CylinderGeometry(0.024, 0.033, 0.78, 10), metal, [0, 0.065, -0.59], [Math.PI / 2, 0, 0]);
    addPart(rifle, new THREE.CylinderGeometry(0.034, 0.034, 0.11, 10), metal, [0, 0.065, -1.015], [Math.PI / 2, 0, 0]);
    addPart(rifle, new THREE.BoxGeometry(0.07, 0.22, 0.12), grip, [0, -0.17, 0.02], [0.17, 0, 0]);
    addPart(rifle, new THREE.BoxGeometry(0.045, 0.08, 0.09), metal, [0, 0.13, -0.08]);
    addPart(rifle, new THREE.CylinderGeometry(0.055, 0.055, 0.33, 12), metal, [0, 0.2, -0.08], [Math.PI / 2, 0, 0]);
    addPart(rifle, new THREE.CylinderGeometry(0.039, 0.039, 0.25, 12), lens, [0, 0.2, -0.08], [Math.PI / 2, 0, 0]);
    addPart(rifle, new THREE.BoxGeometry(0.06, 0.025, 0.08), metal, [0, 0.1, -0.48]);
    rifle.userData.muzzlePoint = new THREE.Vector3(0, 0.065, -1.07);
    rifle.userData.source = 'procedural-placeholder';
    return rifle;
}

function addSleeve(socket, start, end, color) {
    const sleeve = new THREE.Group();
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const delta = new THREE.Vector3().subVectors(endPoint, startPoint);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, delta.length(), 9), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    socket.add(mesh);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), new THREE.MeshStandardMaterial({ color: 0x77604a, roughness: 0.95 }));
    hand.position.copy(endPoint);
    socket.add(hand);
    sleeve.add(mesh, hand);
    return sleeve;
}

export function createWeapon(camera, settings = {}) {
    const config = { ...DEFAULT_WEAPON, ...settings };
    const socket = new THREE.Group();
    socket.name = 'WeaponSocket';
    camera.add(socket);
    const arms = new THREE.Group();
    arms.name = 'FirstPersonArms';
    addSleeve(arms, [-0.2, -0.34, -0.21], [-0.02, -0.19, -0.55], 0x48503f);
    addSleeve(arms, [0.43, -0.35, -0.18], [0.28, -0.2, -0.45], 0x48503f);
    socket.add(arms);

    const modelRoot = new THREE.Group();
    modelRoot.name = 'WeaponModelRoot';
    const proceduralModel = createProceduralRifle();
    modelRoot.add(proceduralModel);
    socket.add(modelRoot);
    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.name = 'MuzzlePoint';
    muzzlePoint.position.set(config.muzzleX, config.muzzleY, config.muzzleZ);
    socket.add(muzzlePoint);

    const hipPosition = new THREE.Vector3(config.positionX, config.positionY, config.positionZ);
    const hipRotation = new THREE.Euler(config.rotationX, config.rotationY, config.rotationZ);
    const aimPosition = new THREE.Vector3(0.015, -0.16, -0.48);
    const aimRotation = new THREE.Euler(-0.005, 0, 0);
    const hipFov = camera.fov;
    let currentZoom = THREE.MathUtils.clamp(Number(config.zoom) || 5, 4.5, 12);
    let aimFov = hipFov / currentZoom;
    let aiming = false;
    let running = false;
    let recoil = 0;
    let lateralRecoil = 0;
    let shotTime = -Infinity;
    let reloading = false;
    let ammo = Number(config.magazineSize) || 5;
    let reserve = Number(config.reserveAmmo) || 25;
    let mixer = null;
    let actions = new Map();
    let currentAction = null;
    let muzzleFlashTime = 0;

    function playAction(names) {
        const match = [...actions.entries()].find(([name]) => names.some((candidate) => name.includes(candidate)));
        if (!match || match[1] === currentAction) return;
        match[1].reset().play();
        currentAction?.crossFadeTo(match[1], 0.12, true);
        currentAction = match[1];
    }

    const weapon = {
        config,
        socket,
        modelRoot,
        muzzlePoint,
        arms,
        get ammo() { return ammo; },
        get reserve() { return reserve; },
        get aiming() { return aiming; },
        get zoom() { return currentZoom; },
        get aimFov() { return aimFov; },
        get reloading() { return reloading; },
        get fireInterval() { return 1 / Math.max(0.1, Number(config.fireRate) || 1); },
        configure(values = {}) {
            Object.assign(config, values);
            hipPosition.set(Number(config.positionX), Number(config.positionY), Number(config.positionZ));
            hipRotation.set(Number(config.rotationX), Number(config.rotationY), Number(config.rotationZ));
            muzzlePoint.position.set(Number(config.muzzleX), Number(config.muzzleY), Number(config.muzzleZ));
            currentZoom = THREE.MathUtils.clamp(Number(config.zoom) || 5, 4.5, 12);
            aimFov = hipFov / currentZoom;
            modelRoot.scale.setScalar(Math.max(0.05, Number(config.modelScale) || 1));
            return weapon;
        },
        setModel(gltf) {
            modelRoot.clear();
            const model = gltf.scene;
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            const largest = Math.max(size.x, size.y, size.z, 0.001);
            const autoFit = 0.92 / largest;
            model.scale.setScalar(autoFit);
            model.position.set(
                -((bounds.min.x + bounds.max.x) / 2) * autoFit,
                -((bounds.min.y + bounds.max.y) / 2) * autoFit,
                -((bounds.min.z + bounds.max.z) / 2) * autoFit,
            );
            model.traverse((object) => {
                if (!object.isMesh && !object.isSkinnedMesh) return;
                object.castShadow = true;
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    if (!material) continue;
                    material.roughness ??= 0.72;
                    material.metalness ??= 0.05;
                    material.needsUpdate = true;
                }
            });
            modelRoot.add(model);
            // Alinha o eixo frontal do GLB (+Z) com o forward da câmera (-Z).
            modelRoot.rotation.set(0, GLB_FORWARD_YAW, 0);
            mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
            actions = new Map(gltf.animations.map((clip) => [clip.name.toLowerCase(), mixer.clipAction(clip)]));
            playAction(['idle', 'equip']);
            modelRoot.userData.source = 'uploaded-glb';
        },
        setAim(value) { aiming = Boolean(value) && !reloading; },
        adjustZoom(amount) {
            if (!aiming) return currentZoom;
            currentZoom = THREE.MathUtils.clamp(currentZoom + Number(amount || 0), 4.5, 12);
            aimFov = hipFov / currentZoom;
            return currentZoom;
        },
        setRunning(value) { running = Boolean(value); },
        setAmmo(current, extra = reserve) { ammo = Math.max(0, Math.min(config.magazineSize, Number(current) || 0)); reserve = Math.max(0, Number(extra) || 0); },
        fire(now = performance.now() / 1000) {
            if (reloading || now - shotTime < weapon.fireInterval) return { fired: false, reason: 'busy' };
            if (ammo <= 0) return { fired: false, reason: 'empty' };
            ammo -= 1;
            shotTime = now;
            recoil = Math.min(recoil + Number(config.recoilVertical), 0.16);
            lateralRecoil += (Math.random() - 0.5) * Number(config.recoilHorizontal) * 2;
            muzzleFlashTime = 0.06;
            playAction(['shoot', 'fire']);
            return { fired: true };
        },
        reload() {
            if (reloading || ammo >= config.magazineSize || reserve <= 0) return Promise.resolve(false);
            reloading = true;
            aiming = false;
            playAction(['reload']);
            return new Promise((resolve) => {
                setTimeout(() => {
                    const amount = Math.min(config.magazineSize - ammo, reserve);
                    ammo += amount;
                    reserve -= amount;
                    reloading = false;
                    playAction(['idle']);
                    resolve(true);
                }, Math.max(0.1, Number(config.reloadTime)) * 1000);
            });
        },
        update(dt, { walking = false, fovOverride = null } = {}) {
            recoil = THREE.MathUtils.damp(recoil, 0, Number(config.recoilRecovery) || 7, dt);
            lateralRecoil = THREE.MathUtils.damp(lateralRecoil, 0, Number(config.recoilRecovery) || 7, dt);
            const t = 1 - Math.exp(-12 * dt);
            const targetPosition = aiming ? aimPosition : hipPosition;
            const targetRotation = aiming ? aimRotation : hipRotation;
            socket.position.lerp(targetPosition, t);
            socket.rotation.x = THREE.MathUtils.lerp(socket.rotation.x, targetRotation.x + recoil, t);
            socket.rotation.y = THREE.MathUtils.lerp(socket.rotation.y, targetRotation.y + lateralRecoil, t);
            socket.rotation.z = THREE.MathUtils.lerp(socket.rotation.z, targetRotation.z, t);
            camera.fov = Number.isFinite(fovOverride) ? fovOverride : THREE.MathUtils.lerp(camera.fov, hipFov, t);
            camera.updateProjectionMatrix();
            const bob = !aiming && walking && !running ? Math.sin(performance.now() * 0.012) * 0.006 : 0;
            modelRoot.position.set(0, bob, -recoil * 1.4);
            arms.visible = true;
            muzzleFlashTime = Math.max(0, muzzleFlashTime - dt);
            mixer?.update(dt);
            if (running && !aiming) playAction(['run', 'sprint']);
            else if (walking && !aiming) playAction(['walk', 'idle']);
            else if (!aiming && !reloading && muzzleFlashTime <= 0) playAction(['idle']);
        },
        muzzleWorldPosition(target = new THREE.Vector3()) { return muzzlePoint.getWorldPosition(target); },
        muzzleWorldDirection(target = new THREE.Vector3()) { return muzzlePoint.getWorldDirection(target).normalize(); },
        playEquip() { playAction(['equip', 'idle']); },
        showMuzzleFlash(scene, point) {
            if (muzzleFlashTime <= 0) return;
            const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true, opacity: 0.8 }));
            flash.position.copy(point);
            scene.add(flash);
            setTimeout(() => { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); }, 65);
        },
        dispose() {
            camera.remove(socket);
            mixer?.stopAllAction();
            socket.traverse((object) => {
                if (!object.isMesh) return;
                object.geometry?.dispose();
                if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
                else object.material?.dispose();
            });
        },
    };

    socket.position.copy(hipPosition);
    socket.rotation.copy(hipRotation);
    socket.scale.setScalar(1);
    modelRoot.scale.setScalar(Math.max(0.05, Number(config.modelScale) || 1));
    return weapon;
}
