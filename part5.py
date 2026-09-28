import io
p = r'c:\xampp\htdocs\CAÇA-3D\src\world\animals.js'
t = io.open(p, encoding='utf-8').read()
bad = "    // Mantido p/ compat: a pose real usa o GROUP (pivo nos pes).\n    // Morte: tomba"
good = "    // Morte: tomba"
assert bad in t, 'dup not found'
t = t.replace(bad, good)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('FIX OK', len(t))
