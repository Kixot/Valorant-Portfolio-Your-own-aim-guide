const fs = require('node:fs');
const path = require('node:path');
exports.withoutGoogleAnalytics = async target => {
  await target.route('**/_vercel/insights/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  const source = fs.readFileSync(path.join(__dirname, '../js/analytics.js'), 'utf8').replace(/const GA_MEASUREMENT_ID = '[^']*';/, "const GA_MEASUREMENT_ID = '';");
  await target.route('**/js/analytics.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
};
exports.artifacts = '.task-test-output';
