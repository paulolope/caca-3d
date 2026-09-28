import fs from 'node:fs';

const file = process.argv[2];
const b = fs.readFileSync(file);
const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
const jsonLen = dv.getUint32(12, true);
const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));

console.log('extensionsUsed   :', JSON.stringify(json.extensionsUsed));
console.log('extensionsRequired:', JSON.stringify(json.extensionsRequired));
console.log('\n--- MATERIALS (full) ---');
console.log(JSON.stringify(json.materials, null, 2));
console.log('\n--- TEXTURES (full) ---');
console.log(JSON.stringify(json.textures, null, 2));
console.log('\n--- IMAGES ---');
console.log(JSON.stringify(json.images, null, 2));
console.log('\n--- SAMPLERS ---');
console.log(JSON.stringify(json.samplers, null, 2));
console.log('\n--- MESHES primitives ---');
console.log(JSON.stringify(json.meshes.map((m) => ({ name: m.name, prims: m.primitives.map((p) => ({ material: p.material, attributes: p.attributes, targets: p.targets ? p.targets.length : 0 })) })), null, 2));
console.log('\n--- SKINS ---');
console.log(JSON.stringify((json.skins || []).map((s) => ({ name: s.name, joints: s.joints.length, skeleton: s.skeleton, inverseBindMatrices: s.inverseBindMatrices })), null, 2));
console.log('\n--- ANIMATIONS ---');
console.log(JSON.stringify((json.animations || []).map((a) => ({ name: a.name, channels: a.channels.length, samplers: a.samplers.length })), null, 2));
