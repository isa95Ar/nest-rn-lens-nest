import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCaller } from '../src/reporter.js';

describe('formatCaller', () => {
  it('shows source locations relative to the repo root', () => {
    assert.equal(formatCaller('/repo/apps/mobile/src/screens/orders.tsx:23', '/repo'), 'apps/mobile/src/screens/orders.tsx:23');
  });

  it('leaves web page paths as they are', () => {
    assert.equal(formatCaller('/orders/42', '/repo'), '/orders/42');
    assert.equal(formatCaller('/', '/repo'), '/');
  });
});
