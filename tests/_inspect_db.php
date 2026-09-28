<?php
$pdo = new PDO('sqlite:' . __DIR__ . '/../data/game.sqlite');
echo "=== TABLES ===\n";
foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table'") as $r) echo $r['name'], "\n";
echo "=== WEAPONS ===\n";
foreach ($pdo->query('SELECT * FROM weapons') as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
echo "=== ANIMALS ===\n";
foreach ($pdo->query('SELECT id,name,model_path,active FROM animals') as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";
