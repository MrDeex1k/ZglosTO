import { mobile } from '@e2e-dev/mobile';
import type { E2EConfig } from 'e2e';

function credential(role: 'RESIDENT' | 'SERVICE' | 'ADMIN') {
  const username = process.env[`DEMO_${role}_EMAIL`];
  const password = process.env[`DEMO_${role}_PASSWORD`];
  if (!username || !password) throw new Error(`Missing synthetic account DEMO_${role}.`);
  return { username, password };
}

const app = { bundleId: 'pl.zglosto.app' };
const { AGENT_DEVICE_PLATFORM, AGENT_DEVICE_DEVICE } = process.env;

export default {
  tests: 'e2e/*.e2e.ts',
  targets: [
    {
      name: 'ios',
      engine: mobile({
        platform: 'ios',
        device: AGENT_DEVICE_PLATFORM === 'ios' ? AGENT_DEVICE_DEVICE : void 0,
      }),
      app,
    },
    {
      name: 'android',
      engine: mobile({
        platform: 'android',
        device: AGENT_DEVICE_PLATFORM === 'android' ? AGENT_DEVICE_DEVICE : void 0,
      }),
      app,
    },
  ],
  credentials: {
    resident: credential('RESIDENT'),
    service: credential('SERVICE'),
    admin: credential('ADMIN'),
  },
  workers: 1,
  timeout: 180_000,
  assertionTimeout: 15_000,
  cache: 'off',
} satisfies E2EConfig;
