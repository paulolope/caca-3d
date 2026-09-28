import fs from 'node:fs';

function inspect(file) {
    const b = fs.readFileSync(file);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
    console.log('\n=== ' + file.split(/[\\/]/).pop() + '  (' + (b.length / 1024).toFixed(0) + ' KB) ===');
    console.log('generator:', json.asset?.generator, '| version:', json.asset?.version);
    console.log('nodes:', (json.nodes || []).length, 'meshes:', (json.meshes || []).length, 'materials:', (json.materials || []).length);
    console.log('textures:', (json.textures || []).length, 'images:', (json.images || []).length, 'samplers:', (json.samplers || []).length);
    console.log('skins:', (json.skins || []).length, 'animations:', (json.animations || []).length, 'accessors:', (json.accessors || []).length);
    const morphs = (json.meshes || []).flatMap((m) => m.primitives || []).reduce((n, p) => n + (p.targets ? p.targets.length : 0), 0);
    console.log('morph targets:', morphs);
    console.log('buffers:', JSON.stringify(json.buffers || []));
    console.log('images:', JSON.stringify((json.images || []).map((i) => ({ name: i.name, mimeType: i.mimeType, uri: i.uri ? String(i.uri).slice(0, 80) : '(bufferView ' + i.bufferView + ')' }))));
    console.log('texture->image:', JSON.stringify((json.textures || []).map((t) => t.source)));
    const mats = (json.materials || []).map((m) => {
        const p = m.pbrMetallicRoughness || {};
        const slots = ['baseColorTexture', 'metallicRoughnessTexture', 'normalTexture', 'occlusionTexture', 'emissiveTexture'].filter((k) => p[k] ?? m[k]);
        return m.name + '[' + slots.join(',') + (m.normalMap ? ',normalMap' : '') + ']';
    });
    console.log('materials:', JSON.stringify(mats));
    console.log('animation names:', JSON.stringify((json.animations || []).map((a) => a.name)));
    const poses = {};
    for (const n of json.nodes || []) { if (n.matrix) poses.matrix = (poses.matrix || 0) + 1; if (n.translation) poses.translation = (poses.translation || 0) + 1; if (n.rotation) poses.rotation = (poses.rotation || 0) + 1; if (n.skin !== undefined) poses.skinNode = (poses.skinNode || 0) + 1; }
    console.log('node transforms:', JSON.stringify(poses));
    const pos = (json.accessors || []).filter((a) => a.type === 'VEC3' && a.min);
    if (pos.length) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const a of pos) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
        console.log('union bbox:', min.map((v) => v.toFixed(2)).join(','), '->', max.map((v) => v.toFixed(2)).join(','), '| size', max.map((v, i) => (v - min[i]).toFixed(2)).join(','));
    }
    const uriImages = (json.images || []).filter((i) => i.uri && !String(i.uri).startsWith('data:'));
    if (uriImages.length) console.log('!! IMAGENS EXTERNAS:', JSON.stringify(uriImages.map((i) => i.uri)));
}

for (const f of process.argv.slice(2)) inspect(f);
