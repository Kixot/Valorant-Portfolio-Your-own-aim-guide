const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createService } = require('../server/round-analysis.cjs');
const env = { GEMINI_API_KEY: 'fake-key-for-offline-tests-only', GEMINI_FREE_TIER_ONLY: 'true' };
const request = (size = 4) => Object.assign(Readable.from([Buffer.alloc(Math.min(size, 4), 7)]), { headers: { 'content-length': String(size), 'content-type': 'video/mp4', 'x-video-duration': '600' } });
const good = value => ({ ok: true, status: 200, json: async () => value });
test('local upload streams only selected bytes, uses a generic filename and signs its reference', async () => {
  let bytes = 0, metadata = 0, starts = 0;
  const calls = [];
  const service = createService({ env, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/upload/v1beta/files')) return { ...good({}), headers: new Headers({ 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/v1beta/files/session1' }) };
    if (url.includes('/upload/')) { for await (const chunk of options.body) bytes += chunk.length; return good({ file: { name: 'files/recording1' } }); }
    if (url.endsWith('/files/recording1')) {
      metadata++;
      return good(metadata === 1 ? { state: 'PROCESSING' } : { state: 'ACTIVE', name: 'files/recording1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/recording1', mimeType: 'video/mp4' });
    }
    if (options.method === 'POST') { starts++; return good({ id: 'file_job', status: 'in_progress' }); }
    return good({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"rounds":[]}' }] }] });
  } });
  const uploaded = await service.upload(request(), 'test'); assert.equal(bytes, 4); assert.equal(uploaded.fileToken.includes(env.GEMINI_API_KEY), false);
  assert.equal(JSON.parse(calls[0].options.body).file.display_name, 'Gameplay recording');
  await assert.rejects(service.run({ action: 'startFile', fileToken: uploaded.fileToken + 'x' }), /Invalid uploaded/);
  assert.equal((await service.run({ action: 'startFile', fileToken: uploaded.fileToken })).status, 'file_processing'); assert.equal(starts, 0);
  const started = await service.run({ action: 'startFile', fileToken: uploaded.fileToken }); assert.equal(started.status, 'processing'); assert.equal(starts, 1);
  const video = JSON.parse(calls.find(item => item.url.endsWith('/interactions')).options.body).input[0];
  assert.equal(video.uri, 'https://generativelanguage.googleapis.com/v1beta/files/recording1'); assert.equal(video.mime_type, 'video/mp4');
  assert.equal((await service.run({ action: 'poll', job: started.job })).status, 'completed');
});
test('oversized, missing-length and wrong-format uploads make no Google request', async () => {
  let calls = 0; const service = createService({ env, fetcher: async () => { calls++; } });
  for (const req of [request(2 * 1024 ** 3 + 1), request(0), Object.assign(request(), { headers: { 'content-length': '4', 'content-type': 'text/plain', 'x-video-duration': '600' } })]) await assert.rejects(service.upload(req, 'test'));
  assert.equal(calls, 0);
});
test('unsafe upload destinations and Google quota errors stop without forwarding video bytes', async () => {
  for (const result of [{ ok: false, status: 429 }, { ...good({}), headers: new Headers({ 'x-goog-upload-url': 'https://evil.example/upload/x' }) }]) {
    let calls = 0; const service = createService({ env, fetcher: async () => { calls++; return result; } });
    await assert.rejects(service.upload(request(), 'test'), /quota|invalid upload destination/); assert.equal(calls, 1);
  }
});
