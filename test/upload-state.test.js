const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCoverUpdater, createStateWriter } = require('../image-upload');

test('capa proposta não fica visível antes da confirmação da persistência assíncrona', async () => {
  const game = { id: '1', cover: 'old-url', coverPublicId: 'old-id' };
  const state = { games: [game] };
  let release, entered;
  const saving = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const update = createCoverUpdater({
    findGame: () => game, currentState: () => state, withStateWrite: operation => operation(),
    save: async proposed => { entered(proposed); await pending; },
    images: { upload: async () => ({ url: 'new-url', publicId: 'new-id' }), remove: async () => {} }
  });
  const result = update('1', Buffer.from('image'));
  try {
    const proposed = await saving;
    assert.equal(game.cover, 'old-url');
    assert.equal(proposed.games[0].cover, 'new-url');
  } finally { release(); await result; }
  assert.equal(game.cover, 'new-url');
});

test('outras mutações aguardam gravação da capa e não copiam URL de mídia removida em falha', async () => {
  const withStateWrite = createStateWriter();
  const game = { id: '1', title: 'original', cover: 'old-url', coverPublicId: 'old-id' };
  const state = { games: [game] };
  let entered, rejectSave;
  const saving = new Promise(resolve => { entered = resolve; });
  const pending = new Promise((resolve, reject) => { rejectSave = reject; });
  const removed = [];
  const update = createCoverUpdater({
    findGame: () => state.games[0], currentState: () => state, withStateWrite,
    save: async () => { entered(); await pending; },
    images: { upload: async () => ({ url: 'new-url', publicId: 'new-id' }), remove: async id => { removed.push(id); } }
  });
  const uploaded = update('1', Buffer.from('image'));
  const rejection = assert.rejects(uploaded, error => error.status === 500);
  await saving;
  let edited = false;
  const edit = withStateWrite(async () => { edited = true; state.games[0] = { ...state.games[0], title: 'editado' }; });
  await Promise.resolve();
  assert.equal(edited, false);
  rejectSave(new Error('database unavailable'));
  await rejection;
  await edit;
  assert.equal(state.games[0].cover, 'old-url');
  assert.equal(state.games[0].coverPublicId, 'old-id');
  assert.deepEqual(removed, ['new-id']);
});
