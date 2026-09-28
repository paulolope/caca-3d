import io
p = r'c:\xampp\htdocs\CAÇA-3D\src\world\animals.js'
t = io.open(p, encoding='utf-8').read()
old = "group.children.forEach((child, index) => { if (child.name === 'Perna') child.rotation.x = Math.sin(performance.now() * 0.012 + index * 2) * 0.45; });"
new = """animal.groundY = group.position.y;
            animal.walkPhase = (animal.walkPhase || 0) + dt * (fleeing_now() ? 9 : 5.5);
            if (!animal.currentAction) animal.proceduralStride(animal.walkPhase, 1, fleeing_now());
            if (animal.parts && animal.parts.body && !animal.modelRoot) {
                animal.parts.body.position.y = 1.35 + Math.abs(Math.sin(animal.walkPhase)) * (fleeing_now() ? 0.07 : 0.045);
                if (animal.parts.head) animal.parts.head.position.y = 2.04 + Math.sin(animal.walkPhase * 2) * 0.02;
            } else if (animal.modelRoot && !animal.currentAction) {
                animal.modelRoot.position.y = (animal.modelBaseY || 0) + Math.abs(Math.sin(animal.walkPhase)) * (fleeing_now() ? 0.06 : 0.035);
            }"""
assert old in t, 'stride line not found'
t = t.replace(old, new)
old2 = "animal.speed = animal.state === 'FLEE' ? animal.runSpeed : animal.walkSpeed;"
assert old2 in t, 'speed line not found'
helper = "const fleeing_now = () => animal.state === 'FLEE' || animal.state === 'RUN';\n            animal.speed = fleeing_now() ? animal.runSpeed : animal.walkSpeed;"
t = t.replace(old2, helper)
old3 = "const dx = animal.state === 'FLEE' ? group.position.x - playerPosition.x : Math.sin(animal.direction);"
new3 = "const dx = fleeing_now() ? group.position.x - playerPosition.x : Math.sin(animal.direction);"
assert old3 in t, 'dx not found'
t = t.replace(old3, new3)
old4 = "const dz = animal.state === 'FLEE' ? group.position.z - playerPosition.z : Math.cos(animal.direction);"
new4 = "const dz = fleeing_now() ? group.position.z - playerPosition.z : Math.cos(animal.direction);"
assert old4 in t, 'dz not found'
t = t.replace(old4, new4)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('PART3 OK', len(t))
