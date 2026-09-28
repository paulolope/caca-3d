import fs from 'node:fs';
const p = 'c:/xampp/htdocs/CAÇA-3D/src/world/animals.js';
const t = fs.readFileSync(p, 'utf8');
const lines = t.split('\n');
console.log(lines.slice(100, 115).map((l, i) => (101 + i) + ':' + JSON.stringify(l)).join('\n'));
