import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        host: '0.0.0.0',
        proxy: {
            '/api': 'http://127.0.0.1:8001',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('/node_modules/three/examples/jsm/')) return 'three-addons';
                    if (id.includes('/node_modules/three/')) return 'three-vendor';
                },
            },
        },
    },
});
