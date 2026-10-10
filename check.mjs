import { readFileSync } from 'fs';
const j = JSON.parse(readFileSync('check.json', 'utf8'));
console.log('count=' + j.videos.length);
console.log('first title=' + j.videos[0].title);
console.log('first channel=' + j.videos[0].channel.name);
