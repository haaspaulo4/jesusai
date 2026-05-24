const fs = require('fs');
const content = fs.readFileSync('src/tools/browser-swarm.js', 'utf8');

let text = content;
if (text.startsWith('"//')) {
  // Remove the surrounding quotes
  text = text.substring(1, text.length - 1);
  // Unescape \n
  text = text.replace(/\\n/g, '\n');
  // Unescape \\
  text = text.replace(/\\\\/g, '\\');
  fs.writeFileSync('src/tools/browser-swarm.js', text);
  console.log('Fixed browser-swarm.js');
} else {
  console.log('browser-swarm.js is already fixed or has unexpected format');
}
