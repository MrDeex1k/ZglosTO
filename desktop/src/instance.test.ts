import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOperationsNavigation, operationsURL } from './instance.js';

test('a release targets the operations page of a specific HTTPS instance', () => {
  assert.equal(
    operationsURL('https://city.example.com:8443').href,
    'https://city.example.com:8443/operacje',
  );
  assert.throws(() => operationsURL('http://localhost:1235'));
  assert.throws(() => operationsURL('https://login@city.example.com'));
  assert.throws(() => operationsURL('https://city.example.com/dashboard'));
  assert.throws(() => operationsURL('https://city.example.com/?untrusted=true'));
});

test('development HTTP is restricted to loopback', () => {
  assert.equal(operationsURL('http://localhost:1235', true).pathname, '/operacje');
  assert.throws(() => operationsURL('http://city.example.com', true));
});

test('window navigation stays on the operations route of the configured origin', () => {
  const entry = operationsURL('https://city.example.com');
  assert.ok(isOperationsNavigation('https://city.example.com/operacje/', entry));
  assert.ok(!isOperationsNavigation('https://city.example.com/dashboard/mieszkaniec', entry));
  assert.ok(!isOperationsNavigation('https://other.example.com/operacje', entry));
  assert.ok(!isOperationsNavigation('blob:https://city.example.com/operacje', entry));
});
