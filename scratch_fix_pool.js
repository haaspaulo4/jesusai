const fs = require('fs');
let content = fs.readFileSync('src/agent/pool.js', 'utf8').trim();

if (content.startsWith('"') && content.endsWith('"')) {
  content = content.slice(1, -1);
}

// Unescape common sequences safely in a regular javascript script
content = content
  .replace(/\\r/g, '\r')
  .replace(/\\n/g, '\n')
  .replace(/\\t/g, '\t')
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, '\\');

fs.writeFileSync('src/agent/pool.js', content, 'utf8');
console.log('Manually unescaped pool.js successfully!');
