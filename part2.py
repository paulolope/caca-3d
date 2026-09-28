import io
p = r'c:\xampp\htdocs\CAÇA-3D\src\world\animals.js'
t = io.open(p, encoding='utf-8').read()
old = "if (animal.modelRoot && animal.modelRoot.userData.baseY === undefined) animal.modelRoot.userData.baseY = animal.modelRoot.position.y;"
new = "animal.groundY = group.position.y;"
assert old in t, 'hit line not found'
t = t.replace(old, new)
old2 = "const moving = animal.state === 'WALK' || animal.state === 'FLEE';"
new2 = "const moving = animal.state === 'WALK' || animal.state === 'FLEE' || animal.state === 'RUN';"
assert old2 in t, 'moving line not found'
t = t.replace(old2, new2)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('PART2 OK', len(t))
