(() => {
  'use strict';
  // ANALYSIS CONFIG: use the API's HTTPS URL here if it is hosted separately.
  const endpoint = '/api/analyze-rounds';
  const request = async (body, signal) => {
    let response;
    try { response = await fetch(endpoint, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, credentials: 'omit', cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(35000)]) }); }
    catch (error) { if (error.name === 'AbortError') throw error; throw new Error('The round-analysis service could not connect.'); }
    let data; try { data = await response.json(); } catch { throw new Error('Round analysis is not connected. Open Preview.cmd or connect the hosted API.'); }
    if (!response.ok) { const error = new Error(data.error || 'Round analysis could not finish.'); error.status = response.status; throw error; }
    return data;
  };
  const upload = async (file, duration, signal) => {
    const mime = file.type || (/\.(mov)$/i.test(file.name) ? 'video/quicktime' : /\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': mime, 'X-Video-Duration': String(duration) }, body: file, credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]) });
    let data; try { data = await response.json(); } catch { throw new Error('The upload did not finish. This host may limit video upload size.'); }
    if (!response.ok) throw new Error(data.error || 'The video upload could not finish.');
    return data.fileToken;
  };
  window.KixotRoundAnalysis = Object.freeze({ info: signal => request(null, signal), start: (videoId, duration, signal) => request({ action: 'start', videoId, duration }, signal), poll: (job, signal) => request({ action: 'poll', job }, signal), upload, startFile: (fileToken, signal) => request({ action: 'startFile', fileToken }, signal) });
})();
