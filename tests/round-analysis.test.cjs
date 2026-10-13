const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService, normalize } = require('../server/round-analysis.cjs');
const env = { GEMINI_API_KEY: 'fake-key-for-offline-tests-only', GEMINI_FREE_TIER_ONLY: 'true' };
const input = { action: 'start', videoId: 'M7lc1UVf-VE', duration: 600 };
const rounds = [{ map: 1, round: 1, start: 71.5, end: 148.25, confidence: 'high', evidence: 'Barriers drop; round winner banner appears.' }, { map: 1, round: 2, start: 180, end: 235, confidence: 'low', evidence: 'Score changes after an obscured last elimination.' }];
const complete = () => ({ id: 'job_example', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ rounds }) }] }] });
const response = data => ({ ok: true, status: 200, json: async () => data });
test('unconfigured or unconfirmed free-tier setup makes no provider calls', async () => {
  let calls = 0;
  for (const config of [{}, { GEMINI_API_KEY: env.GEMINI_API_KEY }]) {
    const service = createService({ env: config, fetcher: async () => { calls++; } });
    assert.equal(service.info().configured, false); await assert.rejects(service.run(input), /billing disabled/);
  }
  assert.equal(calls, 0);
});
test('starts one background video job, authenticates polling and parses actual irregular boundaries', async () => {
  const requests = [];
  const service = createService({ env, fetcher: async (url, options) => { requests.push({ url, options }); return response(options.method === 'POST' ? { id: 'job_example', status: 'in_progress' } : complete()); } });
  const started = await service.run(input);
  assert.equal(started.status, 'processing'); assert.equal(started.job.includes(env.GEMINI_API_KEY), false);
  assert.equal((await service.run(input)).job, started.job); assert.equal(requests.length, 1);
  await assert.rejects(service.run({ action: 'poll', job: started.job + 'tampered' }), /Invalid analysis job/);
  const result = await service.run({ action: 'poll', job: started.job });
  assert.deepEqual(result.rounds.map(item => [item.start, item.end]), [[71.5, 148.25], [180, 235]]);
  assert.equal(result.rounds[1].confirmed, false);
  const sent = JSON.parse(requests[0].options.body);
  assert.equal(sent.background, true); assert.equal(sent.model, 'gemini-3.5-flash-lite'); assert.equal(sent.input[0].processing, undefined); assert.equal(sent.input[0].uri, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  assert.match(sent.system_instruction, /never from regular time intervals/);
  assert.equal(JSON.stringify(sent).includes('note'), false);
  assert.equal((await service.run(input)).status, 'completed'); assert.equal(requests.length, 2);
});
test('quota exhaustion stops, without retries or paid model fallback', async () => {
  let calls = 0;
  const service = createService({ env, fetcher: async () => { calls++; return { ok: false, status: 429 }; } });
  await assert.rejects(service.run(input), /no paid fallback/); assert.equal(calls, 1);
});

test('temporary busy polling preserves the accepted job without submitting another video', async () => {
  let calls = 0, starts = 0;
  const service = createService({ env, fetcher: async (url, options) => {
    calls++;
    if (options.method === 'POST') { starts++; return response({ id: 'job_example', status: 'in_progress' }); }
    if (calls === 2) return { ok: false, status: 503 };
    return response(complete());
  } });
  const started = await service.run(input);
  const busy = await service.run({ action: 'poll', job: started.job });
  assert.equal(busy.status, 'processing'); assert.equal(busy.job, started.job); assert.equal(busy.pollAfter, 30); assert.match(busy.message, /Google is busy/);
  const result = await service.run({ action: 'poll', job: busy.job });
  assert.equal(result.status, 'completed'); assert.equal(starts, 1);
});

test('quota errors while polling stop immediately and failed busy jobs are not retried', async () => {
  for (const failure of [{ ok: false, status: 429 }, response({ status: 'failed', error: { code: 'service_unavailable' } })]) {
    let calls = 0;
    const service = createService({ env, fetcher: async (url, options) => { calls++; return options.method === 'POST' ? response({ id: 'job_example', status: 'in_progress' }) : failure; } });
    const started = await service.run(input);
    await assert.rejects(service.run({ action: 'poll', job: started.job }), /no paid fallback|stopped this job/i);
    assert.equal(calls, 2);
  }
});
test('background error arrays distinguish quota exhaustion from video processor failures', async () => {
  for (const [code, status] of [['RESOURCE_EXHAUSTED', 429], ['INTERNAL', 502]]) {
    const service = createService({ env, fetcher: async () => response({ id: 'job_example', status: 'failed', errors: [{ code, message: 'Provider failure' }] }) });
    await assert.rejects(service.run(input), error => error.status === status);
  }
});
test('malformed sources, duration limits and unavailable output do not generate markers', async () => {
  let calls = 0; const service = createService({ env, fetcher: async () => { calls++; return response({ id: 'job_example', status: 'incomplete' }); } });
  await assert.rejects(service.run({ ...input, videoId: 'https://evil.example' }), /loaded video/);
  await assert.rejects(service.run({ ...input, duration: 7201 }), /loaded video/); assert.equal(calls, 0);
  await assert.rejects(service.run(input), /No markers were changed/);
});
test('invalid or overlapping model output is rejected rather than repaired into a pattern', () => {
  for (const values of [[{ ...rounds[0], end: 900 }], [{ ...rounds[0], start: 150, end: 100 }], [{ ...rounds[0], start: 600.5, end: 600.7 }], [rounds[0], { ...rounds[1], start: 100 }], [rounds[0], rounds[0]], [{ ...rounds[0], confidence: 'certain' }]]) assert.throws(() => normalize({ rounds: values }, 600));
  assert.deepEqual(normalize({ rounds: [] }, 600), []);
});
test('signed jobs expire; failed requests still count against protective limits', async () => {
  let now = 0, calls = 0;
  const service = createService({ env, now: () => now, fetcher: async () => { calls++; return response({ id: 'job_example', status: 'in_progress' }); } });
  const job = await service.run(input);
  await assert.rejects(service.run({ ...input, videoId: 'aqz-KE-bpKQ' }), /local analysis limit/);
  now = 1800001; await assert.rejects(service.run({ action: 'poll', job: job.job }), /expired/); assert.equal(calls, 1);
});
