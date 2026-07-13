const fs = require('fs');
const lines = fs.readFileSync('index.js', 'utf8').split('\n');
console.log('gacha:', lines.findIndex(l => l.includes("=== 'gacha'")));
console.log('daily:', lines.findIndex(l => l.includes("=== 'daily'")));
console.log('coinflip:', lines.findIndex(l => l.includes("=== 'coinflip'")));
