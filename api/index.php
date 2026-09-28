<?php
declare(strict_types=1);
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DB_PATH = __DIR__ . '/../data/game.sqlite';
const UPLOAD_DIR = __DIR__ . '/../uploads/models';
const AUDIO_UPLOAD_DIR = __DIR__ . '/../uploads/audio';

function database(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    if (!is_dir(dirname(DB_PATH))) mkdir(dirname(DB_PATH), 0775, true);
    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS animals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, species TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", model_path TEXT NOT NULL DEFAULT "", scale REAL NOT NULL DEFAULT 1, height REAL NOT NULL DEFAULT 2.1, speed REAL NOT NULL DEFAULT 1.25, run_speed REAL NOT NULL DEFAULT 7.6, health INTEGER NOT NULL DEFAULT 100, weight REAL NOT NULL DEFAULT 75, detection_distance REAL NOT NULL DEFAULT 80, flee_distance REAL NOT NULL DEFAULT 35, behavior TEXT NOT NULL DEFAULT "Fugir do jogador", habitat TEXT NOT NULL DEFAULT "Floresta", min_count INTEGER NOT NULL DEFAULT 2, max_count INTEGER NOT NULL DEFAULT 8, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $existingColumns = array_column($pdo->query('PRAGMA table_info(animals)')->fetchAll(), 'name');
    $animalMigrations = ['height' => 'REAL NOT NULL DEFAULT 2.1', 'run_speed' => 'REAL NOT NULL DEFAULT 7.6', 'flee_speed' => 'REAL NOT NULL DEFAULT 7.6', 'detection_distance' => 'REAL NOT NULL DEFAULT 80', 'flee_distance' => 'REAL NOT NULL DEFAULT 35', 'behavior' => 'TEXT NOT NULL DEFAULT "Fugir do jogador"', 'habitat' => 'TEXT NOT NULL DEFAULT "Floresta"', 'min_count' => 'INTEGER NOT NULL DEFAULT 2', 'max_count' => 'INTEGER NOT NULL DEFAULT 8', 'animation_config' => 'TEXT NOT NULL DEFAULT "{}"', 'sound_path' => 'TEXT NOT NULL DEFAULT ""'];
    foreach ($animalMigrations as $column => $definition) if (!in_array($column, $existingColumns, true)) $pdo->exec("ALTER TABLE animals ADD COLUMN $column $definition");
    $pdo->exec('CREATE TABLE IF NOT EXISTS animation_presets (name TEXT PRIMARY KEY, config TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS spawns (id INTEGER PRIMARY KEY AUTOINCREMENT, animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, rotation_x REAL NOT NULL DEFAULT 0, rotation_y REAL NOT NULL DEFAULT 0, rotation_z REAL NOT NULL DEFAULT 0, scale REAL NOT NULL DEFAULT 1, count INTEGER NOT NULL DEFAULT 1, radius REAL NOT NULL DEFAULT 120, start_time TEXT NOT NULL DEFAULT "06:00", end_time TEXT NOT NULL DEFAULT "18:00", habitat TEXT NOT NULL DEFAULT "Floresta", created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $defaultSpawnSites = [
        [-300, -300], [-3300, -3300], [300, -300], [3300, 3300], [-300, 300], [3300, -3300], [300, 300], [-3300, 3300],
        [-3300, -1650], [3300, -1650], [-3300, 1650], [3300, 1650], [0, -3300], [0, 3300], [-1650, -3300], [1650, 3300],
        [-1650, 3300], [1650, -3300], [-1650, -1650], [1650, 1650], [-1650, 1650], [1650, -1650], [0, -1650], [0, 1650],
    ];
    $animalsForSpawnSeed = $pdo->query('SELECT id FROM animals WHERE active=1 ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($animalsForSpawnSeed as $animalIndex => $animalId) {
        $seedKey = 'default_spawn_sites_v1_animal_' . (int)$animalId;
        $seedCheck = $pdo->prepare('SELECT 1 FROM app_meta WHERE key=?'); $seedCheck->execute([$seedKey]);
        if (!$seedCheck->fetchColumn()) {
            $existing = $pdo->prepare('SELECT COUNT(*) FROM spawns WHERE animal_id=?'); $existing->execute([(int)$animalId]);
            if ((int)$existing->fetchColumn() === 0) {
                $insert = $pdo->prepare('INSERT INTO spawns(animal_id,x,y,z,count,radius,habitat) VALUES(?,?,?,?,?,?,?)');
                for ($siteIndex = 0; $siteIndex < 6; $siteIndex++) {
                    [$x, $z] = $defaultSpawnSites[($siteIndex * count($animalsForSpawnSeed) + $animalIndex) % count($defaultSpawnSites)];
                    $habitat = abs($z) > 2400 ? 'Montanha' : ($z > 1200 ? 'Campo' : 'Floresta');
                    $insert->execute([(int)$animalId, $x, 0, $z, 2, 220, $habitat]);
                }
            }
            $markSeeded = $pdo->prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)'); $markSeeded->execute([$seedKey, 'done']);
        }
        $nearSeedKey = 'default_spawn_sites_v2_center_animal_' . (int)$animalId;
        $nearSeedCheck = $pdo->prepare('SELECT 1 FROM app_meta WHERE key=?'); $nearSeedCheck->execute([$nearSeedKey]);
        if (!$nearSeedCheck->fetchColumn()) {
            $nearby = $pdo->prepare('SELECT COUNT(*) FROM spawns WHERE animal_id=? AND x BETWEEN -500 AND 500 AND z BETWEEN -500 AND 500'); $nearby->execute([(int)$animalId]);
            if ((int)$nearby->fetchColumn() === 0) {
                $centerSites = [[-300, -300], [300, -300], [0, 350], [300, 300]];
                [$centerX, $centerZ] = $centerSites[$animalIndex % count($centerSites)];
                $insertCenter = $pdo->prepare('INSERT INTO spawns(animal_id,x,y,z,count,radius,habitat) VALUES(?,?,?,?,?,?,?)');
                $insertCenter->execute([(int)$animalId, $centerX, 0, $centerZ, 2, 220, 'Floresta']);
            }
            $markCenterSeeded = $pdo->prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)'); $markCenterSeeded->execute([$nearSeedKey, 'done']);
        }
    }
    $pdo->exec('CREATE TABLE IF NOT EXISTS animal_deaths (instance_id TEXT PRIMARY KEY, spawn_id INTEGER, animal_id INTEGER, name TEXT NOT NULL, model_path TEXT NOT NULL DEFAULT "", x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, rotation_y REAL NOT NULL DEFAULT 0, scale REAL NOT NULL DEFAULT 1, height REAL NOT NULL DEFAULT 2.1, weight REAL NOT NULL DEFAULT 75, hit_region TEXT NOT NULL DEFAULT "Corpo", hit_distance REAL NOT NULL DEFAULT 0, animation_config TEXT NOT NULL DEFAULT "{}", dead_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS weapons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, weapon_type TEXT NOT NULL DEFAULT "rifle", model_path TEXT NOT NULL DEFAULT "", damage REAL NOT NULL DEFAULT 65, range_m REAL NOT NULL DEFAULT 650, fire_rate REAL NOT NULL DEFAULT 1.15, magazine_size INTEGER NOT NULL DEFAULT 5, reserve_ammo INTEGER NOT NULL DEFAULT 25, reload_time REAL NOT NULL DEFAULT 2.2, recoil_vertical REAL NOT NULL DEFAULT 0.032, recoil_horizontal REAL NOT NULL DEFAULT 0.009, recoil_recovery REAL NOT NULL DEFAULT 7, zoom REAL NOT NULL DEFAULT 1.45, model_scale REAL NOT NULL DEFAULT 1, position_x REAL NOT NULL DEFAULT 0.31, position_y REAL NOT NULL DEFAULT -0.3, position_z REAL NOT NULL DEFAULT -0.57, rotation_x REAL NOT NULL DEFAULT -0.02, rotation_y REAL NOT NULL DEFAULT 0, rotation_z REAL NOT NULL DEFAULT 0, muzzle_x REAL NOT NULL DEFAULT 0, muzzle_y REAL NOT NULL DEFAULT 0.07, muzzle_z REAL NOT NULL DEFAULT -1.07, active INTEGER NOT NULL DEFAULT 0, author TEXT NOT NULL DEFAULT "", license TEXT NOT NULL DEFAULT "", source_url TEXT NOT NULL DEFAULT "", created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    if ((int)$pdo->query('SELECT COUNT(*) FROM weapons')->fetchColumn() === 0) {
        $stmt = $pdo->prepare('INSERT INTO weapons(name, weapon_type, active, author, license, source_url) VALUES(?,?,?,?,?,?)');
        $stmt->execute(['Hunting Rifle', 'rifle', 1, 'Tylukex / Wicked_Vixx', 'CC BY 4.0', 'https://sketchfab.com/3d-models/hunting-rifle-fortnite-pbr-2d6cb620d5a8478b9ac83782d1319d47']);
    }
    $check = $pdo->query('SELECT COUNT(*) FROM admins WHERE username = "admin"')->fetchColumn();
    if (!$check) {
        $password = getenv('ADMIN_PASSWORD') ?: 'paulo1212';
        $stmt = $pdo->prepare('INSERT INTO admins(username, password_hash) VALUES (?, ?)');
        $stmt->execute(['admin', password_hash($password, PASSWORD_DEFAULT)]);
    }
    return $pdo;
}
function respond(array $data, int $status = 200): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function body(): array { $data = json_decode(file_get_contents('php://input') ?: '[]', true); return is_array($data) ? $data : []; }
function requireAdmin(): void { if (empty($_SESSION['admin'])) respond(['error' => 'Autenticação necessária'], 401); }
function animalRow(array $row): array { return ['id' => (int)$row['id'], 'name' => $row['name'], 'species' => $row['species'], 'description' => $row['description'], 'modelPath' => $row['model_path'], 'soundPath' => $row['sound_path'] ?? '', 'scale' => (float)$row['scale'], 'height' => (float)$row['height'], 'speed' => (float)$row['speed'], 'runSpeed' => (float)$row['run_speed'], 'fleeSpeed' => (float)$row['flee_speed'], 'health' => (int)$row['health'], 'weight' => (float)$row['weight'], 'detectionDistance' => (float)$row['detection_distance'], 'fleeDistance' => (float)$row['flee_distance'], 'behavior' => $row['behavior'], 'habitat' => $row['habitat'], 'minCount' => (int)$row['min_count'], 'maxCount' => (int)$row['max_count'], 'animationConfig' => json_decode($row['animation_config'] ?? '{}', true) ?: [], 'active' => (bool)$row['active']]; }
try {
    $pdo = database();
    $action = $_GET['action'] ?? '';
    if ($action === 'profile') {
        $input = $_SERVER['REQUEST_METHOD'] === 'POST' ? body() : [];
        $code = (string)($_GET['code'] ?? $input['code'] ?? '');
        if (!preg_match('/^\d{3}$/', $code)) respond(['error' => 'O código do perfil deve ter 3 dígitos'], 400);
        $profilePath = __DIR__ . '/../data/player-profiles.json';
        $handle = fopen($profilePath, 'c+');
        if (!$handle) respond(['error' => 'Não foi possível abrir o arquivo de perfis'], 500);
        if (!flock($handle, LOCK_EX)) { fclose($handle); respond(['error' => 'Não foi possível bloquear o arquivo de perfis'], 500); }
        rewind($handle);
        $profiles = json_decode(stream_get_contents($handle) ?: '{}', true);
        if (!is_array($profiles)) $profiles = [];
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $profile = $profiles[$code] ?? null;
            flock($handle, LOCK_UN); fclose($handle);
            respond(['exists' => is_array($profile), 'profile' => is_array($profile) ? $profile : null]);
        }
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { flock($handle, LOCK_UN); fclose($handle); respond(['error' => 'Método não permitido'], 405); }
        if ((string)($input['code'] ?? '') !== $code || !is_array($input['profile'] ?? null)) { flock($handle, LOCK_UN); fclose($handle); respond(['error' => 'Dados de perfil inválidos'], 400); }
        $source = $input['profile'];
        $number = static fn($value, float $min, float $max): float => max($min, min($max, is_numeric($value) ? (float)$value : $min));
        $integer = static fn($value, int $max): int => (int)$number($value, 0, $max);
        $needs = is_array($source['needs'] ?? null) ? $source['needs'] : [];
        $position = is_array($source['position'] ?? null) ? $source['position'] : [];
        $decoySource = is_array($source['decoys'] ?? null) ? $source['decoys'] : [];
        $decoys = [];
        foreach (['deer', 'boar', 'bird'] as $decoyType) $decoys[$decoyType] = $integer($decoySource[$decoyType] ?? 0, 999);
        $profile = [
            'money' => $number($source['money'] ?? 0, 0, 1000000000),
            'totalEarned' => $number($source['totalEarned'] ?? 0, 0, 1000000000),
            'kills' => $integer($source['kills'] ?? 0, 1000000),
            'animalsCollected' => $integer($source['animalsCollected'] ?? 0, 1000000),
            'distance' => $number($source['distance'] ?? 0, 0, 1000000000),
            'decoys' => $decoys,
            'equippedDecoy' => in_array(($source['equippedDecoy'] ?? ''), ['deer', 'boar', 'bird'], true) ? $source['equippedDecoy'] : '',
            'needs' => ['hunger' => $number($needs['hunger'] ?? 100, 0, 100), 'thirst' => $number($needs['thirst'] ?? 100, 0, 100), 'energy' => $number($needs['energy'] ?? 100, 0, 100), 'meat' => $integer($needs['meat'] ?? 0, 100000)],
            'position' => ['x' => $number($position['x'] ?? 0, -3950, 3950), 'z' => $number($position['z'] ?? 18, -3950, 3950)],
            'yaw' => $number($source['yaw'] ?? 0, -100000, 100000),
            'pitch' => $number($source['pitch'] ?? 0, -1.35, 1.35),
            'updatedAt' => gmdate('c'),
        ];
        $profiles[$code] = $profile;
        rewind($handle); ftruncate($handle, 0);
        $saved = fwrite($handle, json_encode($profiles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        fflush($handle); flock($handle, LOCK_UN); fclose($handle);
        if ($saved === false) respond(['error' => 'Falha ao gravar o perfil'], 500);
        respond(['ok' => true, 'profile' => $profile]);
    }
    if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = body(); $stmt = $pdo->prepare('SELECT password_hash FROM admins WHERE username = ?'); $stmt->execute([$input['username'] ?? '']); $hash = $stmt->fetchColumn();
        if (!$hash || !password_verify((string)($input['password'] ?? ''), $hash)) respond(['error' => 'Usuário ou senha inválidos'], 401);
        session_regenerate_id(true); $_SESSION['admin'] = true; respond(['authenticated' => true]);
    }
    if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') { $_SESSION = []; session_destroy(); respond(['ok' => true]); }
    if ($action === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $file = $_FILES['model'] ?? null;
        $extension = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || !in_array($extension, ['glb', 'zip'], true)) respond(['error' => 'Envie um arquivo .glb ou pacote .zip do Sketchfab'], 400);
        if ($file['size'] > 80 * 1024 * 1024) respond(['error' => 'O arquivo excede o limite de 80 MB'], 413);
        if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0775, true);
        if ($extension === 'glb') {
            $handle = fopen($file['tmp_name'], 'rb'); $magic = $handle ? fread($handle, 4) : ''; if ($handle) fclose($handle);
            if ($magic !== 'glTF') respond(['error' => 'O arquivo não possui cabeçalho GLB válido'], 400);
            $name = bin2hex(random_bytes(16)) . '.glb';
            if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $name)) respond(['error' => 'Não foi possível salvar o arquivo'], 500);
            respond(['path' => 'uploads/models/' . $name]);
        }
        if (!class_exists(ZipArchive::class)) respond(['error' => 'Habilite a extensão ZIP do PHP para importar pacotes Sketchfab'], 500);
        $zip = new ZipArchive();
        if ($zip->open($file['tmp_name']) !== true) respond(['error' => 'O arquivo ZIP está inválido'], 400);
        $safe = []; $mainGltf = ''; $total = 0; $glbData = null;
        $allowed = ['gltf','bin','png','jpg','jpeg','webp','ktx2','avif'];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entry = $zip->getNameIndex($i);
            if (!is_string($entry) || str_ends_with($entry, '/')) continue;
            $entry = str_replace('\\', '/', $entry);
            if (str_starts_with($entry, '/') || preg_match('/(^|\/)\.\.(\/|$)|:|\x00/', $entry)) { $zip->close(); respond(['error' => 'O ZIP contém um caminho inválido'], 400); }
            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
            if (!in_array($ext, [...$allowed, 'glb'], true)) continue;
            $stat = $zip->statIndex($i); $size = (int)($stat['size'] ?? 0); $total += $size;
            if ($size > 80 * 1024 * 1024 || $total > 200 * 1024 * 1024) { $zip->close(); respond(['error' => 'O pacote descompactado excede 200 MB'], 413); }
            if ($ext === 'glb') { $stream = $zip->getStream($entry); $candidate = $stream ? stream_get_contents($stream, 80 * 1024 * 1024 + 1) : false; if ($stream) fclose($stream); if (is_string($candidate) && str_starts_with($candidate, 'glTF')) $glbData ??= $candidate; }
            if ($ext === 'gltf' && $mainGltf === '') $mainGltf = $entry;
            if ($ext !== 'glb') $safe[] = [$entry, $i];
        }
        if ($glbData !== null) {
            $zip->close(); $name = bin2hex(random_bytes(16)) . '.glb';
            if (file_put_contents(UPLOAD_DIR . '/' . $name, $glbData, LOCK_EX) === false) respond(['error' => 'Não foi possível salvar o modelo'], 500);
            respond(['path' => 'uploads/models/' . $name]);
        }
        if ($mainGltf === '') { $zip->close(); respond(['error' => 'ZIP sem arquivo GLB ou GLTF reconhecido'], 400); }
        $folder = bin2hex(random_bytes(16)); $root = UPLOAD_DIR . '/' . $folder;
        if (!mkdir($root, 0775, true)) { $zip->close(); respond(['error' => 'Não foi possível criar a pasta do modelo'], 500); }
        foreach ($safe as [$entry, $index]) {
            $destination = $root . '/' . $entry; $directory = dirname($destination);
            if (!is_dir($directory) && !mkdir($directory, 0775, true)) { $zip->close(); respond(['error' => 'Falha ao extrair os arquivos do modelo'], 500); }
            $stream = $zip->getStream($zip->getNameIndex($index)); $out = fopen($destination, 'wb');
            if (!$stream || !$out) { if ($stream) fclose($stream); if ($out) fclose($out); $zip->close(); respond(['error' => 'Falha ao extrair o pacote'], 500); }
            stream_copy_to_stream($stream, $out); fclose($stream); fclose($out);
        }
        $zip->close();
        respond(['path' => 'uploads/models/' . $folder . '/' . $mainGltf]);
    }
    if ($action === 'audio-upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $file = $_FILES['audio'] ?? null;
        $extension = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        $allowed = ['mp3' => 'mp3', 'mpeg' => 'mp3', 'wav' => 'wav', 'ogg' => 'ogg', 'oga' => 'ogg', 'm4a' => 'm4a', 'mp4' => 'm4a'];
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || !isset($allowed[$extension])) respond(['error' => 'Envie um áudio MP3, WAV, OGG ou M4A válido'], 400);
        if ($file['size'] > 12 * 1024 * 1024) respond(['error' => 'O áudio excede o limite de 12 MB'], 413);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!is_string($mime) || !str_starts_with($mime, 'audio/') && !in_array($mime, ['application/ogg', 'video/mp4'], true)) respond(['error' => 'O arquivo enviado não parece ser um áudio válido'], 400);
        if (!is_dir(AUDIO_UPLOAD_DIR)) mkdir(AUDIO_UPLOAD_DIR, 0775, true);
        $name = bin2hex(random_bytes(16)) . '.' . $allowed[$extension];
        if (!move_uploaded_file($file['tmp_name'], AUDIO_UPLOAD_DIR . '/' . $name)) respond(['error' => 'Não foi possível salvar o áudio'], 500);
        respond(['path' => 'uploads/audio/' . $name]);
    }
    if ($action === 'vegetation' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin();
        $input = body();
        $kind = (string)($input['kind'] ?? '');
        $modelPath = trim((string)($input['modelPath'] ?? ''));
        if (!in_array($kind, ['pine', 'oak'], true)) respond(['error' => 'Tipo de árvore inválido'], 400);
        $validPath = preg_match('#^uploads/models/[a-f0-9]{32}\.glb$#', $modelPath) || preg_match('#^uploads/models/[a-f0-9]{32}/[A-Za-z0-9_./ -]+\.gltf$#', $modelPath);
        if ($modelPath !== '' && (!$validPath || str_contains($modelPath, '..') || !is_file(__DIR__ . '/../' . $modelPath))) respond(['error' => 'O modelo enviado não foi encontrado'], 400);
        $stmt = $pdo->prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
        $stmt->execute(['tree_model_' . $kind, $modelPath]);
        respond(['ok' => true, 'kind' => $kind, 'modelPath' => $modelPath]);
    }
    if ($action === 'animation-preset' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $input = body(); $name = trim((string)($input['name'] ?? ''));
        if ($name === '' || !is_array($input['config'] ?? null)) respond(['error' => 'Nome e configurações do preset são obrigatórios'], 400);
        $stmt = $pdo->prepare('INSERT INTO animation_presets(name,config,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(name) DO UPDATE SET config=excluded.config,updated_at=CURRENT_TIMESTAMP');
        $stmt->execute([substr($name, 0, 80), json_encode($input['config'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        respond(['name' => substr($name, 0, 80), 'config' => $input['config']]);
    }
    if ($action === 'animation-preset' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
        requireAdmin(); $stmt = $pdo->prepare('DELETE FROM animation_presets WHERE name=?'); $stmt->execute([(string)($_GET['name'] ?? '')]); respond(['ok' => true]);
    }
    if ($action === 'animal' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $input = body(); $name = trim((string)($input['name'] ?? ''));
        if ($name === '') respond(['error' => 'O nome do animal é obrigatório'], 400);
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $minCount = max(0, min(50, (int)($input['minCount'] ?? 2)));
        $maxCount = max($minCount, min(50, (int)($input['maxCount'] ?? 8)));
        $config = is_array($input['animationConfig'] ?? null) ? json_encode($input['animationConfig'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '{}';
        $soundPath = substr((string)($input['soundPath'] ?? ''), 0, 500);
        if ($id && !array_key_exists('soundPath', $input)) { $existing = $pdo->prepare('SELECT sound_path FROM animals WHERE id=?'); $existing->execute([$id]); $soundPath = (string)($existing->fetchColumn() ?: ''); }
        $values = [$name, trim((string)($input['species'] ?? '')), trim((string)($input['description'] ?? '')), (string)($input['modelPath'] ?? ''), max(0.1, (float)($input['scale'] ?? 1)), max(0.1, (float)($input['height'] ?? 2.1)), max(0, (float)($input['speed'] ?? 1.25)), max(0, (float)($input['runSpeed'] ?? 7.6)), max(0, (float)($input['fleeSpeed'] ?? $input['runSpeed'] ?? 7.6)), max(1, (int)($input['health'] ?? 100)), max(1, (float)($input['weight'] ?? 75)), max(1, (float)($input['detectionDistance'] ?? 80)), max(1, (float)($input['fleeDistance'] ?? 35)), substr(trim((string)($input['behavior'] ?? 'Fugir do jogador')), 0, 100), substr(trim((string)($input['habitat'] ?? 'Floresta')), 0, 100), $minCount, $maxCount, !empty($input['active']) ? 1 : 0, $config, $soundPath];
        if ($id) { $stmt = $pdo->prepare('UPDATE animals SET name=?, species=?, description=?, model_path=?, scale=?, height=?, speed=?, run_speed=?, flee_speed=?, health=?, weight=?, detection_distance=?, flee_distance=?, behavior=?, habitat=?, min_count=?, max_count=?, active=?, animation_config=?, sound_path=? WHERE id=?'); $stmt->execute([...$values, $id]); }
        else { $stmt = $pdo->prepare('INSERT INTO animals(name,species,description,model_path,scale,height,speed,run_speed,flee_speed,health,weight,detection_distance,flee_distance,behavior,habitat,min_count,max_count,active,animation_config,sound_path) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'); $stmt->execute($values); $id = (int)$pdo->lastInsertId(); }
        $stmt = $pdo->prepare('SELECT * FROM animals WHERE id=?'); $stmt->execute([$id]); respond(animalRow($stmt->fetch()));
    }
    if ($action === 'spawn' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $input = body();
        foreach (['animalId','x','y','z'] as $key) if (!isset($input[$key]) || !is_numeric($input[$key])) respond(['error' => 'Coordenadas e animal são obrigatórios'], 400);
        $stmt = $pdo->prepare('INSERT INTO spawns(animal_id,x,y,z,rotation_x,rotation_y,rotation_z,scale,count,radius,start_time,end_time,habitat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([(int)$input['animalId'],(float)$input['x'],(float)$input['y'],(float)$input['z'],(float)($input['rotationX']??0),(float)($input['rotationY']??0),(float)($input['rotationZ']??0),(float)($input['scale']??1),max(1,min(50,(int)($input['count']??1))),max(10,min(3000,(float)($input['radius']??120))),(string)($input['startTime']??'06:00'),(string)($input['endTime']??'18:00'),substr((string)($input['habitat']??'Floresta'),0,100)]);
        respond(['id' => (int)$pdo->lastInsertId()]);
    }
    if ($action === 'spawn' && $_SERVER['REQUEST_METHOD'] === 'DELETE') { requireAdmin(); $stmt = $pdo->prepare('DELETE FROM spawns WHERE id=?'); $stmt->execute([(int)($_GET['id']??0)]); respond(['ok'=>true]); }
    if ($action === 'death' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = body();
        $instanceId = trim((string)($input['instanceId'] ?? ''));
        if ($instanceId === '' || strlen($instanceId) > 120 || trim((string)($input['name'] ?? '')) === '') respond(['error' => 'ID e nome do animal sÃ£o obrigatÃ³rios'], 400);
        foreach (['x','y','z'] as $key) if (!isset($input[$key]) || !is_numeric($input[$key]) || !is_finite((float)$input[$key])) respond(['error' => 'PosiÃ§Ã£o invÃ¡lida'], 400);
        $config = is_array($input['animationConfig'] ?? null) ? json_encode($input['animationConfig'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '{}';
        $stmt = $pdo->prepare('INSERT INTO animal_deaths(instance_id,spawn_id,animal_id,name,model_path,x,y,z,rotation_y,scale,height,weight,hit_region,hit_distance,animation_config,dead_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(instance_id) DO UPDATE SET spawn_id=excluded.spawn_id,animal_id=excluded.animal_id,name=excluded.name,model_path=excluded.model_path,x=excluded.x,y=excluded.y,z=excluded.z,rotation_y=excluded.rotation_y,scale=excluded.scale,height=excluded.height,weight=excluded.weight,hit_region=excluded.hit_region,hit_distance=excluded.hit_distance,animation_config=excluded.animation_config,dead_at=CURRENT_TIMESTAMP');
        $stmt->execute([$instanceId, isset($input['spawnId']) ? (int)$input['spawnId'] : null, isset($input['animalId']) ? (int)$input['animalId'] : null, substr(trim((string)$input['name']), 0, 120), substr((string)($input['modelPath'] ?? ''), 0, 500), (float)$input['x'], (float)$input['y'], (float)$input['z'], (float)($input['rotationY'] ?? 0), max(0.1, (float)($input['scale'] ?? 1)), max(0.1, (float)($input['height'] ?? 2.1)), max(1, (float)($input['weight'] ?? 75)), substr((string)($input['hitRegion'] ?? 'Corpo'), 0, 40), max(0, (float)($input['hitDistance'] ?? 0)), $config]);
        respond(['ok' => true, 'instanceId' => $instanceId]);
    }
    if ($action === 'death' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM animal_deaths WHERE instance_id=?');
        $stmt->execute([substr((string)($_GET['id'] ?? ''), 0, 120)]);
        respond(['ok' => true]);
    }
    if ($action === 'weapon' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdmin(); $input = body(); $name = trim((string)($input['name'] ?? ''));
        if ($name === '') respond(['error' => 'O nome da arma é obrigatório'], 400);
        $values = [$name, substr((string)($input['weaponType'] ?? 'rifle'), 0, 40), (string)($input['modelPath'] ?? ''), max(1, (float)($input['damage'] ?? 65)), max(1, (float)($input['range'] ?? 650)), max(0.1, (float)($input['fireRate'] ?? 1.15)), max(1, min(200, (int)($input['magazineSize'] ?? 5))), max(0, min(1000, (int)($input['reserveAmmo'] ?? 25))), max(0.1, (float)($input['reloadTime'] ?? 2.2)), max(0, (float)($input['recoilVertical'] ?? 0.032)), max(0, (float)($input['recoilHorizontal'] ?? 0.009)), max(0.1, (float)($input['recoilRecovery'] ?? 7)), max(1, (float)($input['zoom'] ?? 1.45)), max(0.05, (float)($input['modelScale'] ?? 1)), (float)($input['positionX'] ?? 0.31), (float)($input['positionY'] ?? -0.3), (float)($input['positionZ'] ?? -0.57), (float)($input['rotationX'] ?? -0.02), (float)($input['rotationY'] ?? 0), (float)($input['rotationZ'] ?? 0), (float)($input['muzzleX'] ?? 0), (float)($input['muzzleY'] ?? 0.07), (float)($input['muzzleZ'] ?? -1.07), substr((string)($input['author'] ?? ''), 0, 180), substr((string)($input['license'] ?? ''), 0, 80), substr((string)($input['sourceUrl'] ?? ''), 0, 500)];
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $pdo->beginTransaction();
        try {
            if (!empty($input['active'])) $pdo->exec('UPDATE weapons SET active=0');
            if ($id) { $stmt = $pdo->prepare('UPDATE weapons SET name=?,weapon_type=?,model_path=?,damage=?,range_m=?,fire_rate=?,magazine_size=?,reserve_ammo=?,reload_time=?,recoil_vertical=?,recoil_horizontal=?,recoil_recovery=?,zoom=?,model_scale=?,position_x=?,position_y=?,position_z=?,rotation_x=?,rotation_y=?,rotation_z=?,muzzle_x=?,muzzle_y=?,muzzle_z=?,active=?,author=?,license=?,source_url=? WHERE id=?'); $stmt->execute([...array_slice($values,0,23), !empty($input['active'])?1:0, ...array_slice($values,23), $id]); }
            else { $stmt = $pdo->prepare('INSERT INTO weapons(name,weapon_type,model_path,damage,range_m,fire_rate,magazine_size,reserve_ammo,reload_time,recoil_vertical,recoil_horizontal,recoil_recovery,zoom,model_scale,position_x,position_y,position_z,rotation_x,rotation_y,rotation_z,muzzle_x,muzzle_y,muzzle_z,active,author,license,source_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'); $stmt->execute([...array_slice($values,0,23), !empty($input['active'])?1:0, ...array_slice($values,23)]); $id=(int)$pdo->lastInsertId(); }
            $pdo->commit();
        } catch (Throwable $error) { $pdo->rollBack(); throw $error; }
        respond(['id'=>$id]);
    }
    if ($action === 'weapon' && $_SERVER['REQUEST_METHOD'] === 'DELETE') { requireAdmin(); $stmt=$pdo->prepare('DELETE FROM weapons WHERE id=?'); $stmt->execute([(int)($_GET['id']??0)]); respond(['ok'=>true]); }
    if (in_array($_SERVER['REQUEST_METHOD'], ['PUT','DELETE'], true) && $action === 'animal') {
        requireAdmin(); $id = (int)($_GET['id']??0); if ($_SERVER['REQUEST_METHOD'] === 'DELETE') { $stmt=$pdo->prepare('DELETE FROM animals WHERE id=?'); $stmt->execute([$id]); respond(['ok'=>true]); }
        $input=body(); $stmt=$pdo->prepare('UPDATE animals SET active=? WHERE id=?'); $stmt->execute([!empty($input['active'])?1:0,$id]); respond(['ok'=>true]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error'=>'Rota não encontrada'],404);
    $pdo->exec("DELETE FROM animal_deaths WHERE dead_at <= datetime('now','-120 seconds')");
    $animals = array_map('animalRow', $pdo->query('SELECT * FROM animals ORDER BY id')->fetchAll());
    $spawns = $pdo->query('SELECT s.*,a.name FROM spawns s JOIN animals a ON a.id=s.animal_id ORDER BY s.id')->fetchAll();
    foreach ($spawns as &$spawn) foreach (['id','animal_id','count'] as $field) $spawn[$field]=(int)$spawn[$field];
    foreach ($spawns as &$spawn) foreach (['x','y','z','radius','scale','rotation_x','rotation_y','rotation_z'] as $field) $spawn[$field]=(float)$spawn[$field];
    $weapons = $pdo->query('SELECT * FROM weapons ORDER BY id')->fetchAll();
    $weaponFields = ['damage'=>'float','range_m'=>'float','fire_rate'=>'float','magazine_size'=>'int','reserve_ammo'=>'int','reload_time'=>'float','recoil_vertical'=>'float','recoil_horizontal'=>'float','recoil_recovery'=>'float','zoom'=>'float','model_scale'=>'float','position_x'=>'float','position_y'=>'float','position_z'=>'float','rotation_x'=>'float','rotation_y'=>'float','rotation_z'=>'float','muzzle_x'=>'float','muzzle_y'=>'float','muzzle_z'=>'float','id'=>'int','active'=>'bool'];
    foreach ($weapons as &$weapon) {
        foreach ($weaponFields as $field=>$type) $weapon[$field] = $type==='float' ? (float)$weapon[$field] : ($type==='int' ? (int)$weapon[$field] : (bool)$weapon[$field]);
        $weapon = ['id'=>$weapon['id'],'name'=>$weapon['name'],'weaponType'=>$weapon['weapon_type'],'modelPath'=>$weapon['model_path'],'damage'=>$weapon['damage'],'range'=>$weapon['range_m'],'fireRate'=>$weapon['fire_rate'],'magazineSize'=>$weapon['magazine_size'],'reserveAmmo'=>$weapon['reserve_ammo'],'reloadTime'=>$weapon['reload_time'],'recoilVertical'=>$weapon['recoil_vertical'],'recoilHorizontal'=>$weapon['recoil_horizontal'],'recoilRecovery'=>$weapon['recoil_recovery'],'zoom'=>$weapon['zoom'],'modelScale'=>$weapon['model_scale'],'positionX'=>$weapon['position_x'],'positionY'=>$weapon['position_y'],'positionZ'=>$weapon['position_z'],'rotationX'=>$weapon['rotation_x'],'rotationY'=>$weapon['rotation_y'],'rotationZ'=>$weapon['rotation_z'],'muzzleX'=>$weapon['muzzle_x'],'muzzleY'=>$weapon['muzzle_y'],'muzzleZ'=>$weapon['muzzle_z'],'active'=>$weapon['active'],'author'=>$weapon['author'],'license'=>$weapon['license'],'sourceUrl'=>$weapon['source_url']];
    }
    $presets = array_map(static fn($row) => ['name' => $row['name'], 'config' => json_decode($row['config'], true) ?: []], $pdo->query('SELECT name,config FROM animation_presets ORDER BY name')->fetchAll());
    $deadAnimals = array_map(static fn($row) => ['instanceId'=>$row['instance_id'],'spawnId'=>$row['spawn_id'] === null ? null : (int)$row['spawn_id'],'animalId'=>$row['animal_id'] === null ? null : (int)$row['animal_id'],'name'=>$row['name'],'modelPath'=>$row['model_path'],'x'=>(float)$row['x'],'y'=>(float)$row['y'],'z'=>(float)$row['z'],'rotationY'=>(float)$row['rotation_y'],'scale'=>(float)$row['scale'],'height'=>(float)$row['height'],'weight'=>(float)$row['weight'],'hitRegion'=>$row['hit_region'],'hitDistance'=>(float)$row['hit_distance'],'animationConfig'=>json_decode($row['animation_config'], true) ?: [],'ageSeconds'=>max(0,(int)$row['age_seconds'])], $pdo->query("SELECT *,CAST((julianday('now')-julianday(dead_at))*86400 AS INTEGER) AS age_seconds FROM animal_deaths ORDER BY dead_at")->fetchAll());
    $vegetation = ['pine' => '', 'oak' => ''];
    foreach (array_keys($vegetation) as $kind) { $stmt = $pdo->prepare('SELECT value FROM app_meta WHERE key=?'); $stmt->execute(['tree_model_' . $kind]); $vegetation[$kind] = (string)($stmt->fetchColumn() ?: ''); }
    respond(['authenticated'=>!empty($_SESSION['admin']),'animals'=>$animals,'spawns'=>$spawns,'deadAnimals'=>$deadAnimals,'weapons'=>$weapons,'animationPresets'=>$presets,'vegetation'=>$vegetation,'map'=>['width'=>8000,'depth'=>8000,'areaKm2'=>64]]);
} catch (Throwable $error) { error_log($error->getMessage()); respond(['error'=>'Falha interna da API. Verifique a configuração do PHP/SQLite.'],500); }
