<?php
declare(strict_types=1);
$index = __DIR__ . '/dist/index.html';
if (is_file($index)) { readfile($index); exit; }
http_response_code(503);
echo 'Build ausente. Execute npm run build.';
