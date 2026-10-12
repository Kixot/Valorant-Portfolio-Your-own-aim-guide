const { createHmac, timingSafeEqual } = require('node:crypto');
const { Transform } = require('node:stream');
const base = 'https://generativelanguage.googleapis.com';
const maxBytes = 2 * 1024 ** 3;
const fail = (status, message) => Object.assign(new Error(message), { status });
function createLocalVideos({ env, fetcher = fetch, now = Date.now }) {
  let day = '', bytesToday = 0, uploads = 0;
  const clients = new Map();
  const sign = value => {
    const text = Buffer.from(JSON.stringify(value)).toString('base64url');
    return text + '.' + createHmac('sha256', env.GEMINI_API_KEY).update(text).digest('base64url');
  };
  const verify = token => {
    if (typeof token !== 'string' || token.length > 2000) throw fail(400, 'Invalid uploaded video.');
    const parts = token.split('.'), expected = createHmac('sha256', env.GEMINI_API_KEY).update(parts[0] || '').digest(), actual = Buffer.from(parts[1] || '', 'base64url');
    if (parts.length !== 2 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw fail(400, 'Invalid uploaded video.');
    let value; try { value = JSON.parse(Buffer.from(parts[0], 'base64url')); } catch { throw fail(400, 'Invalid uploaded video.'); }
    if (!/^files\/[a-zA-Z0-9_-]{1,100}$/.test(value.name) || !Number.isFinite(value.duration) || value.duration <= 0 || value.duration > 7200 || value.expires < now()) throw fail(410, 'The uploaded video expired. Select and analyze the file again.');
    return value;
  };
  const check = async response => {
    if (!response.ok) {
      if (response.status === 429) throw fail(429, 'The free-tier quota is reached. Upload stopped; there is no paid fallback.');
      if ([401, 403].includes(response.status)) throw fail(503, 'The key cannot upload videos. Check your free-tier project.');
      throw fail(503, 'Google could not process this video file. Try again later.');
    }
    return response;
  };
  return {
    async upload(req, client) {
      if (!env.GEMINI_API_KEY || env.GEMINI_FREE_TIER_ONLY !== 'true') throw fail(503, 'Local analysis needs a free-tier server API key.');
      const size = Number(req.headers['content-length']), duration = Number(req.headers['x-video-duration']), mime = req.headers['content-type'];
      if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) throw fail(413, 'Choose a video smaller than 2 GB.');
      if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw fail(400, 'Choose a video no longer than two hours.');
      if (!/^video\/(?:mp4|webm|quicktime|mpeg|ogg|x-matroska|x-msvideo|x-flv|3gpp|mov)$/i.test(mime)) throw fail(415, 'Choose an MP4, WebM or another supported video format.');
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) { day = today; uploads = 0; bytesToday = 0; clients.clear(); }
      const clientKey = createHmac('sha256', env.GEMINI_API_KEY).update(client).digest('hex');
      const limit = clients.get(clientKey) || { count: 0, last: -Infinity };
      if (uploads >= 6 || bytesToday + size > 2 * maxBytes || limit.count >= 3 || now() - limit.last < 60000) throw fail(429, 'The local upload limit is reached. Try later.');
      uploads++; bytesToday += size; limit.count++; limit.last = now(); clients.set(clientKey, limit);
      const start = await check(await fetcher(base + '/upload/v1beta/files', { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { display_name: 'Gameplay recording' } }), signal: AbortSignal.timeout(25000) }));
      const uploadUrl = new URL(start.headers.get('x-goog-upload-url'));
      if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'generativelanguage.googleapis.com' || !uploadUrl.pathname.startsWith('/upload/')) throw fail(502, 'Google returned an invalid upload destination.');
      const controller = new AbortController();
      const aborted = () => controller.abort(); req.once('aborted', aborted);
      let received = 0;
      const bounded = new Transform({ transform(chunk, encoding, callback) { received += chunk.length; callback(received > size ? fail(413, 'Video upload exceeded its declared size.') : null, chunk); } });
      req.on('error', error => bounded.destroy(error));
      try {
        const response = await check(await fetcher(uploadUrl.href, { method: 'POST', headers: { 'Content-Type': mime, 'Content-Length': String(size), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: req.pipe(bounded), duplex: 'half', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]) }));
        const data = await response.json(), name = data.file?.name;
        if (received !== size || !/^files\/[a-zA-Z0-9_-]{1,100}$/.test(name)) throw fail(502, 'Google did not finish the video upload.');
        return { fileToken: sign({ name, duration, expires: now() + 3600000 }) };
      } finally { req.removeListener('aborted', aborted); req.unpipe(bounded); bounded.destroy(); }
    },
    async resolve(token) {
      const file = verify(token);
      const response = await check(await fetcher(base + '/v1beta/' + file.name, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(25000) }));
      const data = await response.json();
      if (data.state === 'PROCESSING') return { processing: true };
      if (data.state !== 'ACTIVE' || data.name !== file.name || !String(data.uri).startsWith(base + '/v1beta/files/') || !/^video\//.test(data.mimeType || data.mime_type || '')) throw fail(422, 'Google could not read this uploaded video. Select another recording.');
      return { id: file.name.slice(6), duration: file.duration, uri: data.uri, mime: data.mimeType || data.mime_type };
    }
  };
}
module.exports = { createLocalVideos };
