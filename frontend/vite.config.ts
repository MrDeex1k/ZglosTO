import { defineConfig, type Plugin } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicWhiteLabelConfig } from '@zglosto/contracts';
import {
  createWhiteLabelConfigReadiness,
  loadWhiteLabelConfigFile,
} from '@zglosto/white-label-config';

const defaultConfigPath = fileURLToPath(
  new URL('../config/white-label/zglosto.yaml', import.meta.url),
);
const configPath = process.env.WHITE_LABEL_CONFIG
  ? resolve(process.cwd(), process.env.WHITE_LABEL_CONFIG)
  : defaultConfigPath;
const loadedWhiteLabelConfig = loadWhiteLabelConfigFile(configPath);
const whiteLabelConfig = createPublicWhiteLabelConfig(loadedWhiteLabelConfig.config);
const configReadiness = createWhiteLabelConfigReadiness(loadedWhiteLabelConfig);
const whiteLabelReadinessPlugin = {
  name: 'white-label-readiness',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'health/ready.json',
      source: `${JSON.stringify({ status: 'ok', service: 'frontend', config: configReadiness })}\n`,
    });
  },
} satisfies Plugin;

function authorizationProxy(command: string, isPreview: boolean) {
  const base = {
    target: 'https://localhost:9956',
    changeOrigin: false,
    secure: true,
  };
  if (command !== 'serve' || isPreview || process.env.ZGLOSTO_STATIC_ANALYSIS === '1') {
    return base;
  }

  const serviceCertificates = fileURLToPath(new URL('../.certs/service/', import.meta.url));
  return {
    ...base,
    agent: new Agent({
      ca: readFileSync(resolve(serviceCertificates, 'ca.crt')),
      cert: readFileSync(resolve(serviceCertificates, 'nginx-client.crt')),
      key: readFileSync(resolve(serviceCertificates, 'nginx-client.key')),
      minVersion: 'TLSv1.3',
      rejectUnauthorized: true,
    }),
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    whiteLabelReadinessPlugin,
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  define: {
    WHITE_LABEL_CONFIG_BUILD: JSON.stringify(whiteLabelConfig),
  },
  server: {
    proxy: {
      // Keep the Better Auth path unchanged.
      '/api/auth': authorizationProxy(command, Boolean(isPreview)),
      // The backend mounts routes without the public `/api` prefix.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/llm': {
        target: 'http://localhost:8123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm/, ''),
      },
    },
  },
}));
