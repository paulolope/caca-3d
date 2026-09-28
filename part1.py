import io
p = r'c:\xampp\htdocs\CAÇA-3D\src\world\animals.js'
t = io.open(p, encoding='utf-8-sig').read()
t = t.replace('\r\n', '\n')

old_death = "target.position.y = THREE.MathUtils.lerp(target.userData.baseY ?? target.position.y, 0.35, eased);"
new_death = """group.rotation.z = (Math.PI / 2) * eased;
        group.position.y = (animal.groundY ?? group.position.y) + (animal.deathLift ?? 0.4) * eased;
        if (animal.modelRoot) {
            animal.modelRoot.rotation.z = 0;
            animal.modelRoot.position.y = animal.modelBaseY || animal.modelRoot.position.y;
        }
    };
    animal.resetDeathPose = () => {
        group.rotation.z = 0;
        if (animal.groundY !== undefined) group.position.y = animal.groundY;
    };
    animal.proceduralStride = (phase, intensity = 1, isFlee = false) => {
        const hasLegs = group.children.some((c) => c.name === 'Perna');
        if (hasLegs) {
            group.children.forEach((child, index) => {
                if (child.name === 'Perna') child.rotation.x = Math.sin(phase + index * Math.PI) * (isFlee ? 0.55 : 0.4) * intensity;
            });
        } else if (animal.modelRoot) {
            animal.modelRoot.rotation.x = Math.sin(phase) * 0.04 * intensity;
            animal.modelRoot.rotation.z = 0;
        }
    };"""
assert old_death in t, 'death line not found'
t = t.replace(old_death, new_death)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('PART1 OK', len(t))
