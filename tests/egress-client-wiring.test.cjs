'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadMediaRerender = () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const match = source.match(/const rerenderAfterMediaLoad = \(\) => \{[\s\S]*?\n\};\n\nconst requestMedia/);
  assert.ok(match, 'a rotina de atualizacao de midia deve existir');

  const events = [];
  const timers = [];
  const mediaRequests = new Map([['ainda-carregando', Promise.resolve()]]);
  const context = {
    state: { isFormActive: false },
    isCadastroFormOpen: () => false,
    mediaRequests,
    mediaRerenderTimer: null,
    Event: class Event { constructor(type) { this.type = type; } },
    window: { dispatchEvent: event => events.push(event.type) },
    setTimeout: callback => {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: timer => { timer.cancelled = true; }
  };
  vm.runInNewContext(`${match[0].replace(/\nconst requestMedia$/, '')}\nglobalThis.rerenderAfterMediaLoad = rerenderAfterMediaLoad;`, context);
  return { events, timers, mediaRequests, rerenderAfterMediaLoad: context.rerenderAfterMediaLoad };
};

const loadMediaRequester = () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const match = source.match(/const requestMedia = async \(tableName, id\) => \{[\s\S]*?\n\};\n\nconst invalidateMedia/);
  assert.ok(match, 'a rotina de busca de midia deve existir');

  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const context = {
    window: { EstatleticoSync: {
      MEDIA_COLUMN: { jogadores: 'foto' },
      mediaKey: (tableName, id) => `${tableName}:${id}`
    } },
    mediaValues: new Map(),
    mediaRequests: new Map(),
    getMediaPlaceholder: () => 'placeholder',
    idbCache: { get: async () => null, set: async () => true },
    supabaseClient: { from: () => ({
      select: () => ({ eq: () => ({ limit: () => response }) })
    }) },
    rerenderAfterMediaLoad: () => {}
  };
  vm.runInNewContext(`${match[0].replace(/\nconst invalidateMedia$/, '')}\nglobalThis.requestMedia = requestMedia;`, context);
  return { ...context, resolveResponse, requestMedia: context.requestMedia };
};

test('cliente Supabase usa projeções principais, diário e Broadcast privado', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(source, /CORE_SELECTS\[tableName\]/);
  assert.match(source, /from\('estatletico_change_log'\)/);
  assert.match(source, /channel\('estatletico:sync', \{ config: \{ private: true \} \}\)/);
  assert.match(source, /\.on\('broadcast', \{ event: 'change' \}/);
  assert.doesNotMatch(source, /from\(tableName\)\.select\('\*'\)/);
  assert.doesNotMatch(source, /'postgres_changes'/);
});

test('cliente busca mídia por demanda, com cache separado e invalidação', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(source, /const requestMedia = async \(tableName, id\)/);
  assert.match(source, /select\(syncTools\.MEDIA_COLUMN\[tableName\]\)/);
  assert.match(source, /const invalidateMedia = \(tableName, id\)/);
  assert.match(source, /mediaRequests\.has\(key\)/);
  assert.match(source, /invalidateMedia\(table, id\)/);
});

test('modo MySQL continua usando seu provider e servidor entrega o módulo de sync', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8');
  assert.match(source, /if \(window\.EstatleticoData\.source !== 'supabase'\) return;/);
  assert.match(server, /'data-sync-utils\.js'/);
});

test('atualiza a rota uma vez apenas quando a fila de midias termina', () => {
  const { events, timers, mediaRequests, rerenderAfterMediaLoad } = loadMediaRerender();

  rerenderAfterMediaLoad();
  assert.deepEqual(events, []);
  assert.equal(timers.length, 1);

  const firstTimer = timers[0];
  rerenderAfterMediaLoad();
  assert.equal(firstTimer.cancelled, true);
  assert.equal(timers.length, 2);

  timers[1].callback();
  assert.deepEqual(events, []);
  assert.equal(timers.length, 3);

  mediaRequests.clear();
  timers[2].callback();
  assert.deepEqual(events, ['hashchange']);
});

test('nao descarta uma nova busca quando a requisicao invalidada termina', async () => {
  const { mediaRequests, requestMedia, resolveResponse } = loadMediaRequester();
  const key = 'jogadores:7';
  const firstRequest = requestMedia('jogadores', 7);
  const replacementRequest = Promise.resolve('nova');
  mediaRequests.set(key, replacementRequest);

  resolveResponse({ data: [{ foto: 'foto-7' }], error: null });
  await firstRequest;

  assert.equal(mediaRequests.get(key), replacementRequest);
});
