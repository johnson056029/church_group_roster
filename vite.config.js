import { defineConfig, loadEnv } from 'vite';
import { requireDatabaseConfig } from './src/config.js';

export default defineConfig(({command, mode}) => {
  // Refuse to publish a site without a database. Dev mode shows the same error
  // in the page so users can diagnose configuration without a blank screen.
  if (command === 'build') requireDatabaseConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return {};
});
