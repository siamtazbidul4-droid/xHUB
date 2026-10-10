const base = 'http://localhost:3000/api';

async function req(method, p, body) {
  const opts = { method, headers: {} };
  if (body !== undefined && !body instanceof FormData) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(base + p, opts);
  const ct = r.headers.get('content-type') || '';
  const txt = await r.text();
  return { status: r.status, ok: r.ok, data: ct.includes('json') ? JSON.parse(txt) : txt };
}

let pass = 0, fail = 0;
function check(name, cond, extra='') { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } }

// Register fresh user
let r = await req('POST', '/auth/register', { name: 'Verify User', email: 'verify' + Date.now() + '@test.io', password: 'Pass1234', handle: 'verifyuser' });
check('register 201', r.status === 201, JSON.stringify(r.data).slice(0,100));
const uid = r.data.user._id; const token = r.data.token;

// Login
r = await req('POST', '/auth/login', { email: r.data.user.email, password: 'Pass1234' });
check('login 200', r.status === 200 && r.data.token, JSON.stringify(r.data).slice(0,80));

// Auth me
r = await req('GET', '/auth/me', token);
check('auth/me 200', r.status === 200 && r.data.user._id === uid, JSON.stringify(r.data).slice(0,80));

// Videos list
r = await req('GET', '/videos');
check('videos list 200 count>0', r.status === 200 && Array.isArray(r.data.videos) && r.data.videos.length > 0, 'count=' + r.data.videos?.length);

// Watch history: get (empty), save, get, remove single, get
r = await req('GET', '/library/history', token);
check('history empty', Array.isArray(r.data.history) && r.data.history.length === 0, 'count=' + r.data.history?.length);

r = await req('POST', '/library/history', token, { videoId: r.data.videos[0]._id, progressSeconds: 30, completed: false });
check('history save 200', r.status === 200 && r.data.success, JSON.stringify(r.data).slice(0,80));

r = await req('GET', '/library/history', token);
check('history get 1 item', Array.isArray(r.data.history) && r.data.history.length === 1, 'count=' + r.data.history?.length);

r = await req('DELETE', '/library/history/' + encodeURIComponent(r.data.videos[0]._id), token);
check('history remove 200', r.status === 200, JSON.stringify(r.data).slice(0,80));

r = await req('GET', '/library/history', token);
check('history cleared after remove', Array.isArray(r.data.history) && r.data.history.length === 0, 'count=' + r.data.history?.length);

// History clear all
r = await req('POST', '/library/history', token, { videoId: r.data.videos[0]._id, progressSeconds: 60, completed: true });
r = await req('GET', '/library/history', token);
r = await req('DELETE', '/library/history/clear-all', token);
check('clear-all 200', r.status === 200, JSON.stringify(r.data).slice(0,80));

// Comments
r = await req('GET', '/videos');
const v = r.data.videos[0];
const commentText = 'API comment ' + Date.now();
r = await req('POST', '/comments/video/' + v._id, token, { content: commentText });
check('post comment 201', r.status === 201 && r.data.comment, 'status=' + r.status);
const cid = r.data.comment._id;

r = await req('GET', '/comments/video/' + v._id, token);
check('get comments get 200', r.status === 200 && Array.isArray(r.data.comments) && r.data.comments.length >= 1, 'count=' + r.data.comments?.length);

r = await req('POST', '/comments/' + cid + '/like', token);
check('comment like 200', r.status === 200 && r.data.isLiked, JSON.stringify(r.data).slice(0,80));

r = await req('PUT', '/comments/' + cid, token, { content: 'edited ' + Date.now() });
check('edit comment 200', r.status === 200 && r.data.comment && r.data.comment.content.includes('edited'), JSON.stringify(r.data).slice(0,80));

r = await req('DELETE', '/comments/' + cid, token);
check('delete comment 200', r.status === 200 && r.data.message, JSON.stringify(r.data).slice(0,80));

// Subscribe
r = await req('GET', '/videos');
const ch = r.data.videos[0].channel._id;
r = await req('POST', '/channels/' + ch + '/subscribe', token);
check('subscribe 200', r.status === 200 && r.data.isSubscribed === true, JSON.stringify(r.data).slice(0,80));

r = await req('POST', '/channels/' + ch + '/subscribe', token);
check('unsubscribe 200', r.status === 200 && r.data.isSubscribed === false, JSON.stringify(r.data).slice(0,80));

// Category
r = await req('GET', '/categories');
check('categories 200', r.status === 200 && Array.isArray(r.data.categories), 'count=' + r.data.categories?.length);

// Watch later
r = await req('POST', '/library/watch-later/' + v._id, token);
check('watch-later 200', r.status === 200 && r.data.isSaved === true, JSON.stringify(r.data).slice(0,80));

r = await req('POST', '/library/watch-later/' + v._id, token);
check('watch-later toggle off', r.status === 200 && r.data.isSaved === false, JSON.stringify(r.data).slice(0,80));

// Notifications
r = await req('GET', '/notifications', token);
check('notifications 200', r.status === 200 && Array.isArray(r.data.notifications), 'count=' + r.data.notifications?.length);

// Like a video
r = await req('POST', '/videos/' + v._id + '/like', token);
check('video like 200', r.status === 200 && r.data.isLiked === true, JSON.stringify(r.data).slice(0,80));

r = await req('GET', '/library/liked', token);
check('liked list 200', r.status === 200 && Array.isArray(r.data.videos) && r.data.videos.some(x => x._id === v._id), 'count=' + r.data.videos?.length);

// View
r = await req('POST', '/videos/' + v._id + '/view', token, { secondsWatched: 5 });
check('view 200', r.status === 200 && r.data.views >= 0, JSON.stringify(r.data).slice(0,80));

console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
