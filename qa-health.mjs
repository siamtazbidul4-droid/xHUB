const r = await fetch('http://localhost:3000/api/health');
const d = await r.json();
console.log('health:', d.status);
