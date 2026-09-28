import './style.css';
import './overrides.css';
import './gameplay.css';
import { createGame } from './world/game.js';

const app = document.querySelector('#app');
const game = createGame(app, {
    onAdmin: () => openAdmin(),
});
let admin = null;
let openingAdmin = false;

async function openAdmin() {
    if (openingAdmin) return;
    openingAdmin = true;
    game.pause();
    admin?.dispose();
    try {
        const { createAdmin } = await import('./admin/admin.js');
        admin = createAdmin(app, {
            onClose: () => {
                admin?.dispose();
                admin = null;
                openingAdmin = false;
                game.show();
            },
        });
    } catch (error) {
        openingAdmin = false;
        game.show();
        console.error('Falha ao abrir o painel administrativo:', error);
    }
}

game.show();
