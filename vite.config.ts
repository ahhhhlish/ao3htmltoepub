import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import process from 'node:process';

export default defineConfig({
    plugins: [
        tailwindcss()
    ],
    base: process.argv.includes('dev') ? '' : process.env.BASE_PATH
})