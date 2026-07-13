const fs = require('fs');
const lines = fs.readFileSync('index.js', 'utf8').split('\n');
console.log(lines.findIndex(l => l.includes("customId.startsWith('claim:")));
