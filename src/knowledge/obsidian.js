// c:\laragon\www\jesus.ai\src\knowledge\obsidian.js
async function parseFrontmatter() {
  return { metadata: {}, content: '' };
}

async function syncFile() {
  console.log('[Obsidian] Stub syncFile');
}

module.exports = {
  parseFrontmatter,
  syncFile
};