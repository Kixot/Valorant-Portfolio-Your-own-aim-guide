// A generated test recording contains no user media.
module.exports = async page => Buffer.from(await page.evaluate(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
  const context = canvas.getContext('2d'), stream = canvas.captureStream(10), chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  recorder.ondataavailable = event => chunks.push(event.data);
  const done = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
  const paint = () => { context.fillStyle = '#111'; context.fillRect(0, 0, 320, 180); context.fillStyle = '#fff'; context.fillText(String(performance.now()), 12, 90); };
  paint(); recorder.start(); const timer = setInterval(paint, 100);
  await new Promise(resolve => setTimeout(resolve, 4500)); clearInterval(timer); recorder.stop(); stream.getTracks().forEach(track => track.stop()); return done;
}));
