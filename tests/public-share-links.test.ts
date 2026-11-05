import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicShareOrigin, getPublicShareUrl, rememberPublicShare, readPublicShare, forgetPublicShare } from '../src/lib/public-share-links.ts';

const origin = 'https://brieflydocs.netlify.app';

test('local creation uses the configured deployment for document and folder links', () => {
  for (const [kind, path] of [['document', 'share'], ['folder', 'folder-share']] as const) {
    assert.equal(getPublicShareUrl({ token: 'same-token' }, kind, 'http://localhost:3000', origin), `${origin}/${path}/same-token`);
  }
});

test('old localhost URLs are repaired without creating a new share or changing its token', () => {
  assert.equal(getPublicShareUrl({ public_url: 'http://localhost:3000/share/existing-token?mode=preview' }, 'document', 'http://localhost:3000', origin), `${origin}/share/existing-token?mode=preview`);
  assert.equal(getPublicShareUrl({ public_url: 'http://192.168.1.2:3000/folder-share/existing-token' }, 'folder', 'http://localhost:3000', origin), `${origin}/folder-share/existing-token`);
});

test('local or invalid origins cannot silently produce unusable shared links', () => {
  for (const local of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.3:3000', 'http://10.0.0.3:3000', 'http://172.16.0.2', 'http://[::1]:3000']) {
    assert.equal(getPublicShareOrigin(local, ''), null);
    assert.equal(getPublicShareUrl({ token: 'token' }, 'document', local, ''), null);
  }
  assert.equal(getPublicShareOrigin(origin, 'not-a-url'), null);
  assert.equal(getPublicShareOrigin(origin, 'http://localhost:3000'), null);
  assert.equal(getPublicShareOrigin(origin, ''), origin);
});

test('document and folder tokens use the public routes, never the share record ID', () => {
  assert.equal(getPublicShareUrl({ id: 'record-id', token: 'public-token' }, 'document', origin), `${origin}/share/public-token`);
  assert.equal(getPublicShareUrl({ token: 'public-token' }, 'folder', origin), `${origin}/folder-share/public-token`);
  assert.equal(getPublicShareUrl({ id: 'record-id' }, 'document', origin), null);
  assert.equal(getPublicShareUrl({ token: 'undefined' }, 'document', origin), null);
  assert.equal(getPublicShareUrl({ token: '  ' }, 'document', origin), null);
});

test('public URLs are supported but unsafe or internal URLs cannot become public actions', () => {
  assert.equal(getPublicShareUrl({ public_url: '/share/token' }, 'document', origin), `${origin}/share/token`);
  assert.equal(getPublicShareUrl({ publicUrl: `${origin}/folder-share/token` }, 'folder', origin), `${origin}/folder-share/token`);
  assert.equal(getPublicShareUrl({ url: '/documents/record-id' }, 'document', origin), null);
  assert.equal(getPublicShareUrl({ url: 'javascript:alert(1)' }, 'document', origin), null);
  assert.equal(getPublicShareUrl({ url: '/folder-share/token' }, 'document', origin), null);
});

test('new links can be retrieved by the same user and organization and forgotten on revoke', () => {
  const scope = { userId: 'user-a', orgId: 'org-a', kind: 'document' as const };
  rememberPublicShare(scope, 'share-a', `${origin}/share/token`);
  assert.equal(readPublicShare(scope, 'share-a'), `${origin}/share/token`);
  assert.equal(readPublicShare({ ...scope, userId: 'user-b' }, 'share-a'), null);
  assert.equal(readPublicShare({ ...scope, orgId: 'org-b' }, 'share-a'), null);
  assert.equal(readPublicShare({ ...scope, kind: 'folder' }, 'share-a'), null);
  forgetPublicShare(scope, 'share-a');
  assert.equal(readPublicShare(scope, 'share-a'), null);
});
