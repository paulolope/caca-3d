import fs from 'node:fs';
const p = 'c:/xampp/htdocs/CAÇA-3D/src/world/animals.js';
let t = fs.readFileSync(p, 'utf8');
// remove o fechamento duplicado inserido antes do animal.hit
t = t.replace("    };\n    };\n    animal.hit =", "    };\n    animal.hit =");
if ((t.match(/    animal\.proceduralStride/g) || []).length > 1) {
  const first = t.indexOf('    animal.proceduralStride');
  const second = t.indexOf('    animal.proceduralStride', first + 1);
  const endSecond = t.indexOf('    };\n', second) + '    };\n'.length;
  t = t.slice(0, first) + t.slice(endSecond);
  console.log('duplicado removido');
}
fs.writeFileSync(p, t, 'utf8');
console.log('len=' + t.length);
