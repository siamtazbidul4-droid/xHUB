const base = 'http://localhost:3000/api';

async function req(method, p, token, body) {
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(base + p, opts);
  const ct = r.headers.get('content-type') || '';
  const txt = await r.text();
  return { status: r.status, ok: r.ok, data: ct.includes('json') ? JSON.parse(txt) : txt };
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
}

// Register fresh user
let r = await req('POST', '/auth/register', null, {
  name: 'Threshold Test User',
  email: 'threshold' + Date.now() + '@test.io',
  password: 'Pass1234',
  handle: 'thresholduser'
});
check('register 201', r.status === 201, JSON.stringify(r.data).slice(0, 100));
const uid = r.data.user._id;
const token = r.data.token;

// Get a video to test with
r = await req('GET', '/videos', null);
check('videos list 200', r.status === 200 && Array.isArray(r.data.videos) && r.data.videos.length > 0,
  'count=' + r.data.videos?.length);
const testVideoId = r.data.videos[0]._id;

// Clean history for this video first
await req('DELETE', '/library/history/' + testVideoId, token);

// --- Boundary case: 2.9 seconds (should NOT create history) ---
r = await req('POST', '/library/history', token, { videoId: testVideoId, progressSeconds: 2.9, completed: false });
check('2.9s: server rejects below-threshold request', r.status === 400, JSON.stringify(r.data).slice(0, 80));
r = await req('GET', '/library/history', token);
const count29 = r.data.history.filter(h => h.videoId === testVideoId).length;
check('2.9s: no history entry created', count29 === 0, 'count=' + count29);

// --- Boundary case: exactly 3 seconds (should create history) ---
r = await req('POST', '/library/history', token, { videoId: testVideoId, progressSeconds: 3, completed: false });
check('3s: server accepts request (>= 3 threshold, inclusive)', r.status === 200, JSON.stringify(r.data).slice(0, 80));
r = await req('GET', '/library/history', token);
const count3 = r.data.history.filter(h => h.videoId === testVideoId).length;
check('3s: history entry created', count3 === 1, 'count=' + count3);

// --- Boundary case: 3.1 seconds (should update existing entry, not duplicate) ---
r = await req('POST', '/library/history', token, { videoId: testVideoId, progressSeconds: 3.1, completed: false });
check('3.1s: server accepts request', r.status === 200, JSON.stringify(r.data).slice(0, 80));
r = await req('GET', '/library/history', token);
const count31 = r.data.history.filter(h => h.videoId === testVideoId).length;
check('3.1s: no duplicate entry (update instead)', count31 === 1, 'count=' + count31);

// --- Verify the entry persists on page refresh (GET again) ---
r = await req('GET', '/library/history', token);
const persisted = r.data.history.filter(h => h.videoId === testVideoId);
check('history survives refresh', persisted.length === 1 && persisted[0].progressSeconds >= 3,
  JSON.stringify(persisted));

// --- Verify user isolation: register another user, check they don't see the first user's history ---
r = await req('POST', '/auth/register', null, {
  name: 'Other User',
  email: 'other' + Date.now() + '@test.io',
  password: 'Pass1234',
  handle: 'otheruser'
});
check('register other user 201', r.status === 201, JSON.stringify(r.data).slice(0, 100));
const otherToken = r.data.token;
r = await req('GET', '/library/history', otherToken);
const otherCount = r.data.history.filter(h => h.videoId === testVideoId).length;
check('other user sees no history for this video', otherCount === 0, 'count=' + otherCount);

// --- Verify history deletion still works ---
r = await req('DELETE', '/library/history/' + testVideoId, token);
check('history delete 200', r.status === 200, JSON.stringify(r.data).slice(0, 80));
r = await req('GET', '/library/history', token);
const afterDelete = r.data.history.filter(h => h.videoId === testVideoId).length;
check('history removed after delete', afterDelete === 0, 'count=' + afterDelete);

// --- Verify clear-all works ---
r = await req('POST', '/library/history', token, { videoId: testVideoId, progressSeconds: 30, completed: false });
r = await req('GET', '/library/history', token);
check('history has 1 item before clear-all', r.data.history.length === 1, 'count=' + r.data.history.length);
r = await req('DELETE', '/library/history/clear-all', token);
check('clear-all 200', r.status === 200, JSON.stringify(r.data).slice(0, 80));
r = await req('GET', '/library/history', token);
check('history empty after clear-all', r.data.history.length === 0, 'count=' + r.data.history.length);

// --- Verify resume-progress behavior: video detail endpoint returns progressSeconds ---
r = await req('POST', '/library/history', token, { videoId: testVideoId, progressSeconds: 45, completed: false });
r = await req('GET', '/videos/' + testVideoId, token);
check('video detail includes progressSeconds', r.status === 200 && r.data.video.progressSeconds === 45,
  JSON.stringify(r.data.video).slice(0, 200));

console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);