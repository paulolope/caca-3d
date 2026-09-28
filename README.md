# Terras Altas · Caça 3D

Jogo de caça em primeira pessoa para navegador, com terreno procedural em coordenadas métricas (8.000 × 8.000 m), vegetação instanciada, relevo, água, animais com estados básicos, rifle por raycast e ferramentas de administração com importação GLB.

## Requisitos

- Node.js 20.19+ e npm
- XAMPP com PHP 8.0+ e extensões PDO_SQLite, fileinfo e sessões habilitadas

## Executar em desenvolvimento

1. `npm install`
2. Inicie o backend PHP em um terminal: `C:\xampp\php\php.exe -S 127.0.0.1:8001 -t .`
3. Inicie o frontend em outro terminal: `npm run dev -- --host 0.0.0.0`
4. Abra o endereço local informado pelo Vite.

O Vite encaminha `/api` para o backend PHP local.

Para GLBs acima do limite padrão do PHP, ajuste `upload_max_filesize` e `post_max_size` no `php.ini` para valores maiores que 80 MB e reinicie o PHP/Apache.

## Publicar pelo Apache do XAMPP

Execute `npm run build` e acesse a pasta do projeto pelo Apache, por exemplo `http://localhost/CA%C3%87A-3D/`. A configuração `.htaccess` encaminha os assets compilados e a API. O diretório `data/` guarda o SQLite e `uploads/models/` recebe os GLBs; ambos são criados quando necessários.

## Acesso administrativo

Entre pelo botão de engrenagem no jogo. O primeiro acesso usa `admin` / `paulo1212`. A senha é verificada no backend com `password_hash`/`password_verify`, não existe no bundle frontend. Para definir uma senha diferente antes de inicializar o banco, configure a variável de ambiente `ADMIN_PASSWORD`.

## Controles

- `WASD`: andar; `Shift`: correr; `Ctrl`: agachar; `Espaço`: pular
- Mouse: olhar; clique esquerdo: disparar; `R`: recarregar; `E`: inspecionar animal abatido
- `Esc`: liberar o mouse

## Escopo atual

O relevo e os elementos naturais são gerados proceduralmente; a reserva possui coordenadas completas de 8 × 8 km, enquanto a vegetação detalhada é carregada em torno da área inicial para manter o custo do navegador limitado. GLBs usam o carregador glTF do Three.js, incluindo materiais, texturas embutidas, animações, skeletons e morph targets. Texturas externas precisam estar acessíveis por URL relativa ao arquivo enviado. Os assets de terceiros não são distribuídos; créditos indicam explicitamente quando um asset foi importado pelo administrador.

Esta entrega é uma base jogável, não a implementação final de todas as mecânicas descritas no briefing: ainda não há navegação por pathfinding, ciclo completo de necessidades (comer/beber/descansar), simulação de horário dos spawns, respawn automático, colisão balística com obstáculos, áudio ambiental completo, persistência de save do jogador ou streaming de vegetação por todo o mapa. A vegetação detalhada está concentrada na região inicial; o terreno e as coordenadas cobrem os 64 km². O comportamento “defender território” ainda usa o estado de alerta como fallback.
