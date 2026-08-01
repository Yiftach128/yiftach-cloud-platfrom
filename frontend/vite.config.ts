import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // Backend has no CORS middleware; the dev server forwards API calls
            // instead. IPv4 literal on purpose — see CLAUDE.md on the WSL relay.
            '/api': 'http://127.0.0.1:3000',
        },
    },
});
