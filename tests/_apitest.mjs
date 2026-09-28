import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8099';
let cookie = '';

async function api(pathname, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(BASE + pathname, { method, headers, body: payload });
    const raw = await response.text();
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 200) }; }
    return { status: response.status, data };
}
let passed = 0;
const ok = (label, condition, extra = '') => {
    if (!condition) { console.error(`  FALHOU: ${label} ${extra}`); process.exitCode = 1; }
    else { passed++; console.log(`  ok  ${label}`); }
};

console.log('\n[1] API sem sessao deve negar escrita');
{
    const r = await api('/api/?action=animal', { method: 'POST', body: { name: 'x' } });
    ok('401 sem sessao', r.status === 401, `-> ${r.status}`);
}
console.log('\n[2] login');
{
    const r = await api('/api/?action=login', { method: 'POST', body: { username: 'admin', password: 'paulo1212' } });
    ok('login aceito', r.status === 200 && r.data.authenticated === true, JSON.stringify(r.data));
    const bad = await fetch(BASE + '/api/?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'errada' }) });
    ok('senha errada -> 401', bad.status === 401);
}

console.log('\n[3] upload persistente do GLB');
let modelPath = '';
{
    const glb = fs.readFileSync('c:/xampp/htdocs/CAÇA-3D/uploads/models/a8e320fecca1734ccb6b4cf7db8c22be.glb');
    const form = new FormData();
    form.append('model', new File([glb], 'deer.glb', { type: 'model/gltf-binary' }));
    const r = await api('/api/?action=upload', { method: 'POST', form });
    ok('upload devolve path', r.status === 200 && typeof r.data.path === 'string', JSON.stringify(r.data));
    modelPath = r.data.path ?? '';
    ok('path persistente em uploads/models', /^uploads\/models\/[a-f0-9]{32}\.glb$/.test(modelPath), modelPath);
    ok('arquivo existe no disco', fs.existsSync('c:/xampp/htdocs/CAÇA-3D/' + modelPath));
    const head = await fetch(BASE + '/' + modelPath);
    ok('GLB servido pela web (mesma URL do jogo)', head.status === 200 && (await head.arrayBuffer()).byteLength > 1000, `-> ${head.status}`);
}
console.log('\n[4] upload rejeita arquivo invalido');
{
    const form = new FormData();
    form.append('model', new File([Buffer.from('nada')], 'x.txt', { type: 'text/plain' }));
    const r = await api('/api/?action=upload', { method: 'POST', form });
    ok('extensao invalida -> 400', r.status === 400, `-> ${r.status}`);
}

console.log('\n[5] SALVAR ANIMAL');
const payload = {
    name: 'Veado-teste-e2e', species: 'Cervidae', description: 'teste', scale: '1.5', height: '1.42',
    speed: '4', runSpeed: '7.6', health: '100', weight: '95', detectionDistance: '80', fleeDistance: '35',
    minCount: '2', maxCount: '8', behavior: 'Fugir do jogador', habitat: 'Floresta', modelPath, active: true,
};
let animalId = 0;
{
    const r = await api('/api/?action=animal', { method: 'POST', body: payload });
    ok('animal criado', r.status === 200 && Number(r.data.id) > 0, JSON.stringify(r.data).slice(0, 200));
    animalId = Number(r.data.id);
    ok('modelPath persistido', r.data.modelPath === modelPath, r.data.modelPath);
    ok('escala persistida', Number(r.data.scale) === 1.5, String(r.data.scale));
    ok('altura persistida', Number(r.data.height) === 1.42, String(r.data.height));
    ok('ativo', r.data.active === true, String(r.data.active));
}
console.log('\n[6] animal aparece na listagem');
{
    const r = await api('/api/');
    const found = (r.data.animals ?? []).find((a) => a.id === animalId);
    ok('listado apos salvar', Boolean(found), JSON.stringify((r.data.animals ?? []).map((a) => a.name)));
    ok('campos completos', Boolean(found && found.species && found.modelPath && found.behavior && found.habitat), JSON.stringify(found));
}
console.log('\n[7] sessao nova continua vendo o animal');
{
    cookie = '';
    const r = await api('/api/');
    ok('persiste sem sessao antiga', Boolean((r.data.animals ?? []).find((a) => a.id === animalId)));
    cookie = '';
    await api('/api/?action=login', { method: 'POST', body: { username: 'admin', password: 'paulo1212' } });
}

console.log('\n[8] COLOCAR NO MAPA -> spawn');
let spawnId = 0;
{
    const r = await api('/api/?action=spawn', { method: 'POST', body: { animalId, x: 120.5, y: 14.25, z: -80, rotationY: Math.PI / 2, scale: 1.5, count: 3, radius: 60, habitat: 'Floresta' } });
    ok('spawn criado', r.status === 200 && Number(r.data.id) > 0, JSON.stringify(r.data));
    spawnId = Number(r.data.id);
}
console.log('\n[9] payload do jogo contem spawn + animal');
{
    const r = await api('/api/');
    const spawn = (r.data.spawns ?? []).find((s) => s.id === spawnId);
    const species = (r.data.animals ?? []).find((a) => a.id === animalId);
    ok('spawn presente', Boolean(spawn));
    ok('spawn aponta para o animal', spawn?.animal_id === animalId, JSON.stringify(spawn));
    ok('spawn com x/y/z/rotacao/escala', Boolean(spawn && spawn.x === 120.5 && spawn.y === 14.25 && spawn.z === -80 && Number(spawn.rotation_y).toFixed(3) === (Math.PI / 2).toFixed(3) && spawn.scale === 1.5), JSON.stringify(spawn));
    ok('game.js acha a especie por animal_id && active', Boolean(species && species.active && species.modelPath), JSON.stringify(species));
}
console.log('\n[10] editar mantem modelPath');
{
    const r = await api('/api/?action=animal', { method: 'POST', body: { id: animalId, ...payload, name: 'Veado-editado' } });
    ok('editado', r.status === 200 && r.data.name === 'Veado-editado', r.data.name);
    ok('modelPath preservado', r.data.modelPath === modelPath, r.data.modelPath);
}
console.log('\n[11] desativar/ativar');
{
    await api(`/api/?action=animal&id=${animalId}`, { method: 'PUT', body: { active: false } });
    let list = await api('/api/');
    ok('fica inativo', list.data.animals.find((a) => a.id === animalId)?.active === false);
    await api(`/api/?action=animal&id=${animalId}`, { method: 'PUT', body: { active: true } });
    list = await api('/api/');
    ok('reativado', list.data.animals.find((a) => a.id === animalId)?.active === true);
}
console.log('\n[12] excluir spawn e animal');
{
    let r = await api(`/api/?action=spawn&id=${spawnId}`, { method: 'DELETE' });
    ok('spawn excluido', r.status === 200);
    r = await api(`/api/?action=animal&id=${animalId}`, { method: 'DELETE' });
    ok('animal excluido', r.status === 200);
    const list = await api('/api/');
    ok('nao aparece mais', !list.data.animals.find((a) => a.id === animalId));
    ok('spawn orfao removido (FK cascade)', !list.data.spawns.find((s) => s.id === spawnId));
}

console.log(`\n=== API E2E: ${passed} verificacoes ok${process.exitCode ? ' · COM FALHAS' : ''} ===`);
