// Usage: node fill/hover-add.js <file.json with {id: note}> ; merges into hover/ac9.json
const fs = require('fs'), p = require('path').join(__dirname, '..', 'hover', 'ac9.json');
const h = JSON.parse(fs.readFileSync(p, 'utf8')); Object.assign(h, JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
fs.writeFileSync(p, JSON.stringify(Object.fromEntries(Object.entries(h).sort()), null, 1)); console.log(Object.keys(h).length, 'notes');
