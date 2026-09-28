import io
p = r'c:\xampp\htdocs\CAÇA-3D\src\world\animals.js'
t = io.open(p, encoding='utf-8').read()
old = "        group.add(model);\n        animal.modelRoot = model;"
new = "        group.add(model);\n        animal.modelRoot = model;\n        animal.modelBaseY = -bounds.min.y * scale;"
assert old in t, 'modelRoot not found'
t = t.replace(old, new)
old2 = "    // Pose de \"ca"
assert "ca" in t
# limpa comentario duplicado antigo
oldc = "    // e encosta a lateral no ch"
if oldc in t:
    t = t.replace("    // Pose de \"ca\u00eddo de lado\": roda o MODELO (n\u00e3o o group, para n\u00e3o quebrar o tiro/coleta)\n    // e encosta a lateral no ch\u00e3o. t vai de 0 (em p\u00e9) a 1 (deitado).", "    // Mantido p/ compat: a pose real usa o GROUP (pivo nos pes).")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('PART4 OK', len(t))
