import assert from 'node:assert/strict';
import { hasWorkspaceAccess } from '../lib/access.ts';

const password = 'test-password:with-punctuation';
const basic = (value) => `Basic ${Buffer.from(value).toString('base64')}`;
assert.equal(hasWorkspaceAccess(null, password), false);
assert.equal(hasWorkspaceAccess('', password), false);
assert.equal(hasWorkspaceAccess('Bearer something', password), false);
assert.equal(hasWorkspaceAccess(basic(`freeze:${password}`), ''), false);
assert.equal(hasWorkspaceAccess(basic(`someone:${password}`), password), false);
assert.equal(hasWorkspaceAccess(basic('freeze:wrong'), password), false);
assert.equal(hasWorkspaceAccess(basic(`freeze:${password}`), password), true);
console.log(
  'PASS workspace access: correct credentials only, empty configuration denied',
);
