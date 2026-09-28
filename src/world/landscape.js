import * as THREE from 'three';

const WORLD_SIZE = 8000;
function hash(x, z, seed) {
    const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
}
function noise(x, z, seed) {
    const ix = Math.floor(x); const iz = Math.floor(z);
    const fx = x - ix; const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx); const sz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, seed); const b = hash(ix + 1, iz, seed);
    const c = hash(ix, iz + 1, seed); const d = hash(ix + 1, iz + 1, seed);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sz);
}
export function terrainHeight(x, z, seed = 1427) {
    const hills = (noise(x * 0.0016, z * 0.0016, seed) - 0.5) * 50 + (noise(x * 0.00055, z * 0.00055, seed + 12) - 0.5) * 100;
    const mountain = Math.max(0, noise(x * 0.0011 + 9, z * 0.0011 - 6, seed + 3) - 0.61) * 150;
    return hills + mountain;
}
function createTerrain(seed) {
    // Mantém o relevo suave com bem menos vértices para acelerar a entrada no mapa.
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 220, 220);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color(0x526c4c); const high = new THREE.Color(0x89906b); const rock = new THREE.Color(0x777a70);
    for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i); const z = positions.getZ(i);
        const height = terrainHeight(x, z, seed);
        positions.setY(i, height);
        const variation = noise(x * 0.025, z * 0.025, seed + 44);
        const color = low.clone().lerp(high, THREE.MathUtils.clamp(variation * 0.85 + height / 190, 0, 1));
        if (height > 72) color.lerp(rock, Math.min((height - 72) / 105, 0.8));
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#81906b'; context.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4500; i += 1) {
        const shade = Math.floor(hash(i, 23, seed + 90) * 48);
        context.fillStyle = i % 5 === 0 ? `rgba(150,139,94,${0.08 + shade / 900})` : `rgba(34,65,40,${0.08 + shade / 900})`;
        context.fillRect(hash(i, 5, seed + 31) * 256, hash(i, 7, seed + 61) * 256, 1 + shade / 32, 1 + shade / 28);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(230, 230);
    texture.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
}
function createWater(scene, seed) {
    const group = new THREE.Group();
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x507f88, roughness: 0.24, metalness: 0.08, transparent: true, opacity: 0.78 });
    for (const [x, z, width, depth] of [
        [-690, -520, 280, 190], [930, 740, 220, 140], [2700, -1800, 600, 420],
        [-2900, -2600, 380, 300], [3100, 2700, 360, 300], [-3000, 2200, 380, 300], [1500, -3300, 320, 250],
    ]) {
        const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterMat);
        water.rotation.x = -Math.PI / 2; water.scale.set(width, depth, 1); water.position.set(x, terrainHeight(x, z, seed) + 0.8, z); group.add(water);
    }
    scene.add(group); return group;
}
function createTrees(scene, seed, radius) {
    const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x36533b, roughness: 0.94 }), 4200);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.36, 5, 7), new THREE.MeshStandardMaterial({ color: 0x554a37, roughness: 1 }), 4200);
    const matrix = new THREE.Matrix4(); const scale = new THREE.Vector3(); const quaternion = new THREE.Quaternion();
    let count = 0;
    const obstacles = [];
    const placements = [];
    for (let i = 0; i < 16000 && count < foliage.count; i += 1) {
        const x = (hash(i, 9, seed) - 0.5) * WORLD_SIZE;
        const z = (hash(14, i, seed + 8) - 0.5) * WORLD_SIZE;
        if (Math.hypot(x, z) > radius || hash(i, i * 2, seed + 55) < 0.39) continue;
        const h = terrainHeight(x, z, seed);
        const size = 0.68 + hash(i, 73, seed + 6) * 1.1;
        obstacles.push({ x, z, radius: Math.max(1.15, size * 1.35 + 0.55), height: 5 + size * 2 });
        placements.push({ x, z, height: 18 + hash(i, 93, seed + 29) * 16, yaw: hash(i, 81, seed) * Math.PI * 2, kind: hash(i, 39, seed) < 0.54 ? 'pine' : 'oak' });
        scale.set(size * 1.35, size * (1.9 + hash(i, 4, seed + 23)), size * 1.35);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 81, seed) * Math.PI * 2);
        matrix.compose(new THREE.Vector3(x, h + 3 + size * 3, z), quaternion, scale); foliage.setMatrixAt(count, matrix);
        matrix.compose(new THREE.Vector3(x, h + 2.5, z), quaternion, new THREE.Vector3(size, size, size)); trunks.setMatrixAt(count, matrix);
        count += 1;
    }
    for (const [x, z, size] of [[-19, -42, 1.9], [17, -55, 2.1], [-34, -86, 1.7], [39, -103, 2.2], [-8, -128, 1.8], [67, -76, 1.7], [-61, -118, 2.1], [4, -190, 2.3], [93, -160, 1.8], [-104, -73, 1.9]]) {
        if (count >= foliage.count) break;
        const height = terrainHeight(x, z, seed);
        obstacles.push({ x, z, radius: size * 1.35 + 0.55, height: 7 });
        placements.push({ x, z, height: 18 + size * 7, yaw: hash(x, z, seed) * Math.PI * 2, kind: hash(x, z, seed + 16) < 0.54 ? 'pine' : 'oak' });
        scale.set(size * 1.35, size * 2.5, size * 1.35);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(x, z, seed) * Math.PI * 2);
        matrix.compose(new THREE.Vector3(x, height + 3 + size * 3, z), quaternion, scale); foliage.setMatrixAt(count, matrix);
        matrix.compose(new THREE.Vector3(x, height + 2.5, z), quaternion, new THREE.Vector3(size, size, size)); trunks.setMatrixAt(count, matrix);
        count += 1;
    }
    const obstacleCells = new Map();
    const cellKey = (x, z) => `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
    for (const obstacle of obstacles) {
        const key = cellKey(obstacle.x, obstacle.z);
        const cell = obstacleCells.get(key) ?? [];
        cell.push(obstacle);
        obstacleCells.set(key, cell);
    }
    foliage.count = count; trunks.count = count; foliage.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
    foliage.castShadow = true; trunks.castShadow = true; scene.add(foliage, trunks); return { meshes: [foliage, trunks], obstacles, obstacleCells, placements };
}
function createBackgroundForest(scene, seed) {
    const pineGeometry = new THREE.ConeGeometry(1, 1, 7, 1);
    const oakGeometry = new THREE.IcosahedronGeometry(1, 1);
    const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.34, 5, 6);
    const pineMaterial = new THREE.MeshStandardMaterial({ color: 0x294638, roughness: 1 });
    const oakMaterial = new THREE.MeshStandardMaterial({ color: 0x3c5a3e, roughness: 1 });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x514331, roughness: 1 });
    const cells = new Map(); const obstacles = [];
    const candidateCount = 60000;
    for (let i = 0; i < candidateCount; i += 1) {
        const x = (hash(i, 901, seed + 101) - 0.5) * WORLD_SIZE;
        const z = (hash(907, i, seed + 113) - 0.5) * WORLD_SIZE;
        // Deixa a clareira inicial livre e destaca os modelos GLB importados perto do jogador.
        if (x * x + z * z < 650 * 650) continue;
        const patch = noise(x * 0.0008, z * 0.0008, seed + 127);
        if (patch < 0.42 || hash(i, i * 0.7, seed + 139) < 0.34) continue;
        const ground = terrainHeight(x, z, seed);
        const treeHeight = 17 + hash(i, 29, seed + 149) * 22;
        const pine = hash(i, 41, seed + 151) < 0.72;
        const crownWidth = treeHeight * (pine ? 0.14 : 0.23);
        const tree = { x, z, ground, height: treeHeight, crownWidth, pine, yaw: hash(i, 53, seed + 157) * Math.PI * 2, shade: hash(i, 67, seed + 163) };
        const key = `${Math.floor((x + WORLD_SIZE / 2) / 1000)},${Math.floor((z + WORLD_SIZE / 2) / 1000)}`;
        const cell = cells.get(key) ?? [];
        cell.push(tree); cells.set(key, cell);
        obstacles.push({ x, z, radius: Math.max(1.6, crownWidth * (pine ? 0.48 : 0.42)), height: treeHeight });
    }
    const meshes = []; const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const scale = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion();
    for (const [key, trees] of cells) {
        const pines = trees.filter((tree) => tree.pine); const oaks = trees.filter((tree) => !tree.pine);
        for (const [kind, entries, geometry, material] of [['pine', pines, pineGeometry, pineMaterial], ['oak', oaks, oakGeometry, oakMaterial]]) {
            if (!entries.length) continue;
            const foliage = new THREE.InstancedMesh(geometry, material, entries.length);
            foliage.name = `BackgroundForest_${kind}_${key}`; foliage.castShadow = false; foliage.receiveShadow = false;
            entries.forEach((tree, index) => {
                position.set(tree.x, tree.ground + tree.height * (tree.pine ? 0.69 : 0.73), tree.z);
                rotation.setFromAxisAngle(up, tree.yaw);
                if (tree.pine) scale.set(tree.crownWidth, tree.height * 0.64, tree.crownWidth);
                else scale.set(tree.crownWidth, tree.height * 0.25, tree.crownWidth);
                matrix.compose(position, rotation, scale); foliage.setMatrixAt(index, matrix);
            });
            foliage.instanceMatrix.needsUpdate = true; foliage.computeBoundingSphere(); meshes.push(foliage);
        }
        const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
        trunks.name = `BackgroundForest_Trunks_${key}`; trunks.castShadow = false; trunks.receiveShadow = false;
        trees.forEach((tree, index) => {
            position.set(tree.x, tree.ground + tree.height * 0.28, tree.z);
            rotation.setFromAxisAngle(up, tree.yaw);
            const trunkWidth = 0.7 + tree.shade * 0.55;
            scale.set(trunkWidth, tree.height * 0.56 / 5, trunkWidth);
            matrix.compose(position, rotation, scale); trunks.setMatrixAt(index, matrix);
        });
        trunks.instanceMatrix.needsUpdate = true; trunks.computeBoundingSphere(); meshes.push(trunks);
    }
    scene.add(...meshes);
    return { meshes, obstacles, dispose() { scene.remove(...meshes); pineGeometry.dispose(); oakGeometry.dispose(); trunkGeometry.dispose(); pineMaterial.dispose(); oakMaterial.dispose(); trunkMaterial.dispose(); } };
}
function instancedTreeModel(model, placements, seed, kind) {
    if (!model || !placements.length) return [];
    model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || size.y < 0.001) return [];
    const center = bounds.getCenter(new THREE.Vector3());
    const normalize = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z)
        .multiply(new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y));
    const output = [];
    const instances = placements.filter((item) => item.kind === kind);
    if (!instances.length) return [];
    const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const scale = new THREE.Vector3();
    const cellSize = 300;
    const cells = new Map();
    for (const item of instances) {
        const key = `${Math.floor(item.x / cellSize)},${Math.floor(item.z / cellSize)}`;
        const cell = cells.get(key) ?? [];
        cell.push(item);
        cells.set(key, cell);
    }
    const sources = [];
    model.traverse((object) => { if (object.isMesh && object.geometry) sources.push(object); });
    for (const source of sources) {
        const geometry = source.geometry.clone();
        geometry.applyMatrix4(normalize.clone().multiply(source.matrixWorld));
        const material = Array.isArray(source.material) ? source.material.map((item) => item.clone()) : source.material.clone();
        for (const [cellKey, cellItems] of cells) {
            const mesh = new THREE.InstancedMesh(geometry, material, cellItems.length);
            mesh.name = `Forest_${kind}_${cellKey}_${source.name || 'mesh'}`;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            cellItems.forEach((item, index) => {
                position.set(item.x, terrainHeight(item.x, item.z, seed), item.z);
                rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw);
                const height = item.height * (0.92 + hash(index, item.x, seed + item.z) * 0.16);
                scale.setScalar(height);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(index, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            output.push(mesh);
        }
    }
    return output;
}
export function createLandscape(scene, { seed = 1427, decorativeRadius = 1250 } = {}) {
    const terrain = createTerrain(seed); scene.add(terrain);
    const water = createWater(scene, seed);
    const treeData = createTrees(scene, seed, decorativeRadius);
    const backgroundForest = createBackgroundForest(scene, seed);
    for (const obstacle of backgroundForest.obstacles) {
        treeData.obstacles.push(obstacle);
        const key = `${Math.floor(obstacle.x / 32)},${Math.floor(obstacle.z / 32)}`;
        const cell = treeData.obstacleCells.get(key) ?? [];
        cell.push(obstacle); treeData.obstacleCells.set(key, cell);
    }
    let trees = treeData.meshes;
    let customTreeMeshes = false;
    const disposeTreeMeshes = (meshes) => {
        const geometries = new Set(); const materials = new Set();
        for (const mesh of meshes) {
            geometries.add(mesh.geometry);
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
        }
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
    };
    return { terrain, water, treePlacementCount: treeData.placements.length, get trees() { return [...trees, ...backgroundForest.meshes]; }, setTreeModels(models = {}) {
        const pineModel = models.pine ?? models.oak;
        const oakModel = models.oak ?? models.pine;
        const next = [...instancedTreeModel(pineModel, treeData.placements, seed, 'pine'), ...instancedTreeModel(oakModel, treeData.placements, seed, 'oak')];
        if (!next.length) return false;
        if (customTreeMeshes) disposeTreeMeshes(trees);
        scene.remove(...trees);
        trees = next;
        customTreeMeshes = true;
        scene.add(...trees);
        return true;
    }, resetTreeModels() {
        if (!customTreeMeshes) return;
        scene.remove(...trees);
        disposeTreeMeshes(trees);
        trees = treeData.meshes;
        customTreeMeshes = false;
        scene.add(...trees);
    }, obstacles: treeData.obstacles, obstaclesNear(x, z) {
        const found = [];
        const cx = Math.floor(x / 32); const cz = Math.floor(z / 32);
        for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) found.push(...(treeData.obstacleCells.get(`${cx + dx},${cz + dz}`) ?? []));
        return found;
    }, heightAt: (x, z) => terrainHeight(x, z, seed), size: WORLD_SIZE, dispose() { scene.remove(terrain, water, ...trees); backgroundForest.dispose(); terrain.geometry.dispose(); terrain.material.map?.dispose(); terrain.material.dispose(); water.traverse((o) => { o.geometry?.dispose(); }); if (customTreeMeshes) disposeTreeMeshes(trees); else trees.forEach((o) => { o.geometry.dispose(); o.material.dispose(); }); } };
}
