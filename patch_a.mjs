import fs from 'node:fs';
const p = 'c:/xampp/htdocs/CAÇA-3D/src/world/animals.js';
let t = fs.readFileSync(p, 'utf8');
const marker = '    animal.modelBaseY = 0;\n';
const helper = `    animal.modelBaseY = 0;
    animal.pickClip = (names) => {
        if (!animal.actions || !animal.actions.size) return null;
        const lowered = names.map((n) => String(n).toLowerCase());
        for (const entry of animal.actions) {
            const k = String(entry[0]).toLowerCase();
            if (lowered.some((w) => w && k.includes(w))) return { key: entry[0], action: entry[1] };
        }
        return null;
    };
`;
if (!t.includes('animal.pickClip') && t.includes(marker)) {
  t = t.replace(marker, helper);
  fs.writeFileSync(p, t, 'utf8');
  console.log('helper inserido len=' + t.length);
} else {
  console.log('helper ja existe ou marker ausente');
}
