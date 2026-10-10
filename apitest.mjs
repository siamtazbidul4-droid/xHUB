import { readFileSync } from 'fs';
const base = 'http://localhost:3000/api';

async function jget(p) {
  const r = await fetch(base + p);
  const ct = r.headers.get('content-type') || '';
  const txt = await r.text();
  return { status: r.status, ok: r.ok, ct, data: ct.includes('json') ? JSON.parse(txt) : txt };
}

async function jpost(p, body) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  const txt = await r.text();
  return { status: r.status, ok: r.ok, ct, data: ct.includes('json') ? JSON.parse(txt) : txt };
}

// 1. Health
const h = await jget('/health');
console.log('1 health', h.status, h.ok, h.data.status);

// 2. Register a fresh test user
const reg = await jpost('/auth/register', { name: 'Test User', email: 'test' + Date.now() + '@kinetix.io', password: 'Pass1234', handle: 'testuser' });
console.log('2 register', reg.status, reg.ok, reg.data?.user?.email);
const uid = reg.data?.user?._id;
const token = reg.data?.token;

// 3. Login
const lg = await jpost('/auth/login', { email: reg.data.user.email, password: 'Pass1234' });
console.log('3 login', lg.status, lg.ok, lg.data?.token?.length);

// 4. Auth me
const me = await jget('/auth/me', token);
console.log('4 auth/me', me.status, me.ok, me.data?.user?.name);

// 5. Videos list
const vs = await jget('/videos');
console.log('5 videos', vs.status, vs.ok, 'count=' + vs.data.videos.length);

// 6. Watch history with our user
const hl = await jget('/library/history', token);
console.log('6 history', hl.status, hl.ok, 'count=' + hl.data.history.length);

// 7. History save
const hv = await jpost('/library/history', token, { videoId: vs.data.videos[0]._id, progressSeconds: 30, completed: false });
console.log('7 history save', hv.status, hv.ok, hv.data.success);

// 8. History get again
const hl2 = await jget('/library/history', token);
console.log('8 history get', hl2.status, hl2.ok, 'count=' + hl2.data.history.length);

// 9. History delete (remove single)
const hd = await jget('/library/history/' + vs.data.videos[0]._id, token);
console.log('9 history delete', hd.status, hd.ok, hd.data.message);

// 10. Videos count after history ops (should be same 12)
const vf = await jget('/videos');
console.log('10 videos count', vf.status, vf.ok, 'count=' + vf.data.videos.length);

// 11. Post comment
const cm = await jpost('/comments/video/' + vs.data.videos[0]._id, token, { content: 'API test comment ' + Date.now() });
console.log('11 post comment', cm.status, cm.ok, cm.data?.comment?._id, cm.data?.comment?.content);
const cid = cm.data?.comment?._id;

// 12. Get comments
const cg = await jget('/comments/video/' + vs.data.videos[0]._id, token);
console.log('12 get comments', cg.status, cg.ok, 'count=' + cg.data.comments.length, cg.data.total);

// 13. Comment like
const cl = await jpost('/comments/' + cid + '/like', token);
console.log('13 comment like', cl.status, cl.ok, cl.data?.isLiked, cl.data?.likesCount);

// 14. Reply
const rr = await jpost('/comments/video/' + vs.data.videos[0]._id, token, { content: 'API reply', parentId: cid });
console.log('14 reply', rr.status, rr.ok, rr.data?.comment?._id, rr.data?.comment?.replyCount);

// 15. Edit comment
const ce = await jput('/comments/' + cid, token, { content: 'API edited' });
console.log('15 edit comment', ce.status, ce.ok, ce.data?.comment?.content);

// 16. Delete comment
const cd = await jdel('/comments/' + cid, token);
console.log('16 delete comment', cd.status, cd.ok, cd.data?.message);

// 17. Category get
const cat = await jget('/categories');
console.log('17 categories', cat.status, cat.ok, 'count=' + cat.data.categories.length);

// Done
console.log('DONE');
