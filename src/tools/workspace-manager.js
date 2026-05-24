/**
 * MetaPersona.AI - Workspace Manager
 * 
 * Gerencia o workspace da persona: diretório dedicado onde a IA pode
 * criar projetos, editar arquivos, e organizar assets.
 * Inspirado no conceito de workspace do PicoClaw.
 */

const fs = require('fs').promises;
const path = require('path');
const fse = require('fs');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'data', 'workspaces');

const SUBDIRS = ['projects', 'landing-pages', 'assets', 'snippets', 'exports', 'temp'];

const TEMPLATES = {
  'landing-page': {
    description: 'Landing page simples com HTML/CSS/JS',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>{{PROJECT_NAME}}</h1>
  </header>
  <main>
    <section class="hero">
      <h2>Bem-vindo</h2>
      <p>Edite este arquivo para criar sua landing page.</p>
    </section>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
      'style.css': `/* {{PROJECT_NAME}} - Styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; }
.hero { max-width: 800px; margin: 2rem auto; padding: 2rem; text-align: center; }
`,
      'script.js': `// {{PROJECT_NAME}} - Scripts
document.addEventListener('DOMContentLoaded', () => {
  console.log('{{PROJECT_NAME}} loaded');
});`,
      'README.md': `# {{PROJECT_NAME}}

Landing page criada via MetaPersona.AI Workspace.

## Como usar
- Edite \`index.html\` para o conteúdo
- Edite \`style.css\` para estilos
- Edite \`script.js\` para interatividade
`,
    },
    dirs: ['assets'],
  },
  'website': {
    description: 'Website multi-página com HTML/CSS/JS',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav>
    <a href="index.html">Home</a>
    <a href="pages/about.html">Sobre</a>
  </nav>
  <main>
    <h1>{{PROJECT_NAME}}</h1>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
      'style.css': `/* {{PROJECT_NAME}} - Styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; }
nav { background: #1a1a2e; padding: 1rem; }
nav a { color: #fff; text-decoration: none; margin-right: 1rem; }
`,
      'script.js': `// {{PROJECT_NAME}} - Scripts
document.addEventListener('DOMContentLoaded', () => {
  console.log('{{PROJECT_NAME}} loaded');
});`,
      'README.md': `# {{PROJECT_NAME}}

Website criado via MetaPersona.AI Workspace.
`,
    },
    dirs: ['pages', 'assets/images'],
  },
  'app': {
    description: 'Aplicação Node.js com Express',
    files: {
      'package.json': `{
  "name": "{{PROJECT_SLUG}}",
  "version": "1.0.0",
  "description": "{{PROJECT_NAME}}",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}`,
      'src/index.js': `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('{{PROJECT_NAME}} running on port ' + PORT);
});`,
      'public/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}}</title>
</head>
<body>
  <h1>{{PROJECT_NAME}}</h1>
</body>
</html>`,
      '.env.example': `PORT=3000
NODE_ENV=development
`,
      'README.md': `# {{PROJECT_NAME}}

App criado via MetaPersona.AI Workspace.

## Setup
\`\`\`bash
cp .env.example .env
npm install
npm start
\`\`\`
`,
    },
    dirs: ['src/routes'],
  },
  'api': {
    description: 'API REST com Node.js/Express',
    files: {
      'package.json': `{
  "name": "{{PROJECT_SLUG}}",
  "version": "1.0.0",
  "description": "{{PROJECT_NAME}} API",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5"
  }
}`,
      'src/index.js': `const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', require('./routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('{{PROJECT_NAME}} API running on port ' + PORT);
});`,
      'src/routes/index.js': `const router = require('express').Router();

router.get('/', (req, res) => {
  res.json({ message: '{{PROJECT_NAME}} API v1' });
});

module.exports = router;`,
      '.env.example': `PORT=3000
NODE_ENV=development
`,
      'README.md': `# {{PROJECT_NAME}} API

API criada via MetaPersona.AI Workspace.

## Setup
\`\`\`bash
cp .env.example .env
npm install
npm start
\`\`\`
`,
    },
    dirs: ['src/routes', 'src/middleware'],
  },
  'automation': {
    description: 'Automação/script com Node.js',
    files: {
      'package.json': `{
  "name": "{{PROJECT_SLUG}}",
  "version": "1.0.0",
  "description": "{{PROJECT_NAME}}",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  }
}`,
      'src/index.js': `// {{PROJECT_NAME}} - Automation
const config = require('./config.json');

async function main() {
  console.log('Starting {{PROJECT_NAME}}...');
  console.log('Config:', JSON.stringify(config, null, 2));
  
  // Add your automation logic here
  
  console.log('{{PROJECT_NAME}} completed.');
}

main().catch(console.error);`,
      'src/config.json': `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "schedule": "manual",
  "options": {}
}`,
      'README.md': `# {{PROJECT_NAME}}

Automação criada via MetaPersona.AI Workspace.

## Uso
\`\`\`bash
npm install
npm start
\`\`\`
`,
    },
    dirs: [],
  },
  'script': {
    description: 'Script simples com Node.js',
    files: {
      'index.js': `// {{PROJECT_NAME}} - Script
// Criado via MetaPersona.AI Workspace

async function main() {
  console.log('{{PROJECT_NAME}} running...');
  // Your code here
}

main().catch(console.error);`,
      'README.md': `# {{PROJECT_NAME}}

Script criado via MetaPersona.AI Workspace.
`,
    },
    dirs: [],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitizeWorkspaceId(id) {
  if (!id || typeof id !== 'string') return 'default';
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
  return sanitized || 'default';
}

function sanitizeProjectName(name) {
  if (!name || typeof name !== 'string') return 'untitled';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64) || 'untitled';
}

function validatePath(basePath, targetPath) {
  const resolved = path.resolve(targetPath);
  const normalizedBase = path.resolve(basePath);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error('Path traversal detected: access denied');
  }
  return resolved;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64);
}

function applyTemplate(templateStr, vars) {
  return templateStr
    .replace(/\{\{PROJECT_NAME\}\}/g, vars.name || 'Untitled')
    .replace(/\{\{PROJECT_SLUG\}\}/g, vars.slug || 'untitled');
}

// ─── Core Functions ────────────────────────────────────────────────────────

/**
 * Initialize a workspace with directory structure and metadata.
 */
async function initWorkspace(workspaceId, options = {}) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  // Create base directory
  await fs.mkdir(wsPath, { recursive: true });

  // Create subdirectories
  for (const dir of SUBDIRS) {
    await fs.mkdir(path.join(wsPath, dir), { recursive: true });
  }

  // Write or update workspace.json
  const metaPath = path.join(wsPath, 'workspace.json');
  let meta = {};
  try {
    const existing = await fs.readFile(metaPath, 'utf8');
    meta = JSON.parse(existing);
  } catch {
    // New workspace
  }

  const now = new Date().toISOString();
  const updated = {
    id: wid,
    name: options.name || wid,
    created_at: meta.created_at || now,
    updated_at: now,
    owner_id: options.owner_id || meta.owner_id || null,
    persona_id: options.persona_id || meta.persona_id || null,
    projects: meta.projects || [],
    settings: { ...(meta.settings || {}), ...(options.settings || {}) },
  };

  await fs.writeFile(metaPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/**
 * Get absolute path for a file in the workspace.
 * Validates against path traversal. Auto-inits workspace if needed.
 */
async function getWorkspacePath(workspaceId, relativePath = '') {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  // Auto-init if needed
  if (!fse.existsSync(wsPath)) {
    await initWorkspace(wid);
  }

  if (!relativePath) return wsPath;

  const targetPath = path.join(wsPath, relativePath);
  return validatePath(wsPath, targetPath);
}

/**
 * List all files and directories in workspace recursively (max depth 4).
 */
async function listWorkspace(workspaceId, relativePath = '', maxDepth = 4) {
  const absPath = await getWorkspacePath(workspaceId, relativePath);
  const wsPath = path.join(WORKSPACE_ROOT, sanitizeWorkspaceId(workspaceId));

  async function walk(dir, depth) {
    if (depth > maxDepth) return [];
    const entries = [];
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relPath = path.relative(wsPath, fullPath).replace(/\\/g, '/');
      const entry = {
        name: item.name,
        type: item.isDirectory() ? 'dir' : 'file',
        path: relPath,
      };

      if (item.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          entry.size = stat.size;
          entry.modified = stat.mtime.toISOString();
        } catch {
          entry.size = 0;
        }
      }

      entries.push(entry);

      if (item.isDirectory() && depth < maxDepth) {
        const children = await walk(fullPath, depth + 1);
        if (children.length > 0) {
          entry.children = children;
        }
      }
    }

    return entries;
  }

  const tree = await walk(absPath, 0);

  // Get workspace metadata
  let meta = {};
  try {
    const metaPath = path.join(wsPath, 'workspace.json');
    meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch { /* ignore */ }

  return {
    workspace_id: sanitizeWorkspaceId(workspaceId),
    path: relativePath || '/',
    meta,
    tree,
  };
}

/**
 * Create a new project in the workspace.
 */
async function createProject(workspaceId, projectData) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  if (!fse.existsSync(wsPath)) {
    await initWorkspace(wid);
  }

  const name = projectData.name || 'untitled';
  const slug = sanitizeProjectName(name);
  const projectType = projectData.type || 'landing-page';
  const projectDir = path.join(wsPath, 'projects', slug);

  // Check if project already exists
  if (fse.existsSync(projectDir)) {
    throw new Error(`Project "${slug}" already exists in workspace "${wid}"`);
  }

  // Create project directory
  await fs.mkdir(projectDir, { recursive: true });

  // Get template
  const template = TEMPLATES[projectType] || TEMPLATES['landing-page'];

  // Create template directories
  if (template.dirs) {
    for (const dir of template.dirs) {
      await fs.mkdir(path.join(projectDir, dir), { recursive: true });
    }
  }

  // Create template files
  const vars = { name, slug };
  for (const [filePath, content] of Object.entries(template.files)) {
    const fullPath = path.join(projectDir, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, applyTemplate(content, vars), 'utf8');
  }

  // Write project.json metadata
  const projectMeta = {
    name,
    slug,
    type: projectType,
    description: projectData.description || '',
    template: projectType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    files: Object.keys(template.files),
    dirs: template.dirs || [],
  };
  await fs.writeFile(
    path.join(projectDir, 'project.json'),
    JSON.stringify(projectMeta, null, 2),
    'utf8'
  );

  // Update workspace.json
  const metaPath = path.join(wsPath, 'workspace.json');
  let meta = {};
  try {
    meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch { /* ignore */ }

  if (!meta.projects) meta.projects = [];
  meta.projects.push({ name, slug, type: projectType, created_at: projectMeta.created_at });
  meta.updated_at = new Date().toISOString();
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return {
    success: true,
    message: `Projeto "${name}" criado no workspace "${wid}"`,
    project: projectMeta,
    path: path.relative(wsPath, projectDir).replace(/\\/g, '/'),
  };
}

/**
 * List all projects in workspace.
 */
async function listProjects(workspaceId) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const projectsDir = path.join(WORKSPACE_ROOT, wid, 'projects');

  if (!fse.existsSync(projectsDir)) {
    return { workspace_id: wid, projects: [], total: 0 };
  }

  const items = await fs.readdir(projectsDir, { withFileTypes: true });
  const projects = [];

  for (const item of items) {
    if (!item.isDirectory()) continue;
    const projectJsonPath = path.join(projectsDir, item.name, 'project.json');
    try {
      const meta = JSON.parse(await fs.readFile(projectJsonPath, 'utf8'));
      projects.push(meta);
    } catch {
      // Project without metadata — still include basic info
      projects.push({
        name: item.name,
        slug: item.name,
        type: 'unknown',
        created_at: null,
      });
    }
  }

  return { workspace_id: wid, projects, total: projects.length };
}

/**
 * Get project details and file tree.
 */
async function getProject(workspaceId, projectName) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const slug = sanitizeProjectName(projectName);
  const projectDir = path.join(WORKSPACE_ROOT, wid, 'projects', slug);

  if (!fse.existsSync(projectDir)) {
    throw new Error(`Project "${slug}" not found in workspace "${wid}"`);
  }

  // Read metadata
  let meta = {};
  try {
    meta = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8'));
  } catch { /* ignore */ }

  // Walk file tree (max depth 6 for projects)
  async function walk(dir, depth) {
    if (depth > 6) return [];
    const entries = [];
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const entry = {
          name: item.name,
          type: item.isDirectory() ? 'dir' : 'file',
          path: path.relative(projectDir, fullPath).replace(/\\/g, '/'),
        };
        if (item.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            entry.size = stat.size;
            entry.modified = stat.mtime.toISOString();
          } catch {
            entry.size = 0;
          }
        }
        entries.push(entry);
        if (item.isDirectory()) {
          entry.children = await walk(fullPath, depth + 1);
        }
      }
    } catch { /* ignore */ }
    return entries;
  }

  const tree = await walk(projectDir, 0);

  return {
    project: meta,
    path: path.relative(path.join(WORKSPACE_ROOT, wid), projectDir).replace(/\\/g, '/'),
    tree,
  };
}

/**
 * Delete a project directory.
 */
async function deleteProject(workspaceId, projectName) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const slug = sanitizeProjectName(projectName);
  const projectDir = path.join(WORKSPACE_ROOT, wid, 'projects', slug);

  if (!fse.existsSync(projectDir)) {
    throw new Error(`Project "${slug}" not found in workspace "${wid}"`);
  }

  // Remove project directory
  await fs.rm(projectDir, { recursive: true, force: true });

  // Update workspace.json
  const metaPath = path.join(WORKSPACE_ROOT, wid, 'workspace.json');
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    meta.projects = (meta.projects || []).filter(p => p.slug !== slug);
    meta.updated_at = new Date().toISOString();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch { /* ignore */ }

  return {
    success: true,
    message: `Projeto "${slug}" deletado do workspace "${wid}"`,
  };
}

/**
 * Get workspace statistics.
 */
async function getWorkspaceStats(workspaceId) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  if (!fse.existsSync(wsPath)) {
    return {
      workspace_id: wid,
      exists: false,
      total_files: 0,
      total_size: 0,
      projects_count: 0,
    };
  }

  let totalFiles = 0;
  let totalSize = 0;
  let lastModified = null;

  async function walk(dir) {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isFile()) {
          totalFiles++;
          try {
            const stat = await fs.stat(fullPath);
            totalSize += stat.size;
            if (!lastModified || stat.mtime > lastModified) {
              lastModified = stat.mtime;
            }
          } catch { /* ignore */ }
        } else if (item.isDirectory()) {
          await walk(fullPath);
        }
      }
    } catch { /* ignore */ }
  }

  await walk(wsPath);

  // Count projects
  const projectsDir = path.join(wsPath, 'projects');
  let projectsCount = 0;
  try {
    const items = await fs.readdir(projectsDir, { withFileTypes: true });
    projectsCount = items.filter(i => i.isDirectory()).length;
  } catch { /* ignore */ }

  return {
    workspace_id: wid,
    exists: true,
    total_files: totalFiles,
    total_size: totalSize,
    total_size_human: formatBytes(totalSize),
    projects_count: projectsCount,
    last_modified: lastModified ? lastModified.toISOString() : null,
  };
}

/**
 * Clean workspace: remove temp files, old exports, etc.
 */
async function cleanWorkspace(workspaceId, options = {}) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);
  const olderThanDays = options.olderThanDays || 30;
  const keepProjects = options.keepProjects !== false;
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  if (!fse.existsSync(wsPath)) {
    return { workspace_id: wid, cleaned: 0, message: 'Workspace does not exist' };
  }

  let cleaned = 0;
  const dirsToClean = ['temp', 'exports'];

  for (const dir of dirsToClean) {
    const dirPath = path.join(wsPath, dir);
    if (!fse.existsSync(dirPath)) continue;

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile()) {
          const fullPath = path.join(dirPath, item.name);
          try {
            const stat = await fs.stat(fullPath);
            if (stat.mtimeMs < cutoff) {
              await fs.unlink(fullPath);
              cleaned++;
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // Update workspace.json
  try {
    const metaPath = path.join(wsPath, 'workspace.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    meta.updated_at = new Date().toISOString();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch { /* ignore */ }

  return {
    workspace_id: wid,
    cleaned,
    message: `${cleaned} arquivo(s) removido(s) (mais de ${olderThanDays} dias)`,
  };
}

/**
 * Resolve a relative path to absolute, validating it's within workspace.
 * Creates parent directories if needed.
 */
async function resolveFilePath(workspaceId, filePath) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  if (!fse.existsSync(wsPath)) {
    await initWorkspace(wid);
  }

  const absPath = validatePath(wsPath, path.join(wsPath, filePath));
  const dir = path.dirname(absPath);
  await fs.mkdir(dir, { recursive: true });
  return absPath;
}

/**
 * Read a file from the workspace.
 */
async function readFile(workspaceId, filePath) {
  const absPath = await getWorkspacePath(workspaceId, filePath);
  try {
    const content = await fs.readFile(absPath, 'utf8');
    const stat = await fs.stat(absPath);
    return {
      success: true,
      path: filePath,
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    };
  } catch (err) {
    return { success: false, error: `File not found: ${filePath}`, details: err.message };
  }
}

/**
 * Write a file to the workspace.
 */
async function writeFile(workspaceId, filePath, content) {
  const absPath = await resolveFilePath(workspaceId, filePath);
  await fs.writeFile(absPath, content, 'utf8');

  // Update workspace timestamp
  try {
    const wid = sanitizeWorkspaceId(workspaceId);
    const metaPath = path.join(WORKSPACE_ROOT, wid, 'workspace.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    meta.updated_at = new Date().toISOString();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch { /* ignore */ }

  return {
    success: true,
    message: `File "${filePath}" written successfully`,
    path: filePath,
  };
}

/**
 * Delete a file from the workspace.
 */
async function deleteFile(workspaceId, filePath) {
  const absPath = await getWorkspacePath(workspaceId, filePath);
  const wsPath = path.join(WORKSPACE_ROOT, sanitizeWorkspaceId(workspaceId));
  validatePath(wsPath, absPath);

  try {
    await fs.unlink(absPath);
    return { success: true, message: `File "${filePath}" deleted` };
  } catch (err) {
    return { success: false, error: `Could not delete: ${filePath}`, details: err.message };
  }
}

/**
 * Rename or move a file/directory in the workspace.
 */
async function moveFile(workspaceId, oldPath, newPath) {
  const wsPath = path.join(WORKSPACE_ROOT, sanitizeWorkspaceId(workspaceId));
  const absOld = validatePath(wsPath, path.join(wsPath, oldPath));
  const absNew = validatePath(wsPath, path.join(wsPath, newPath));

  await fs.mkdir(path.dirname(absNew), { recursive: true });
  await fs.rename(absOld, absNew);

  return {
    success: true,
    message: `Moved "${oldPath}" to "${newPath}"`,
    old_path: oldPath,
    new_path: newPath,
  };
}

/**
 * Copy a file in the workspace.
 */
async function copyFile(workspaceId, srcPath, destPath) {
  const wsPath = path.join(WORKSPACE_ROOT, sanitizeWorkspaceId(workspaceId));
  const absSrc = validatePath(wsPath, path.join(wsPath, srcPath));
  const absDest = validatePath(wsPath, path.join(wsPath, destPath));

  await fs.mkdir(path.dirname(absDest), { recursive: true });
  await fs.copyFile(absSrc, absDest);

  return {
    success: true,
    message: `Copied "${srcPath}" to "${destPath}"`,
  };
}

/**
 * Search for files in the workspace by name pattern.
 */
async function searchFiles(workspaceId, pattern, options = {}) {
  const wid = sanitizeWorkspaceId(workspaceId);
  const wsPath = path.join(WORKSPACE_ROOT, wid);

  if (!fse.existsSync(wsPath)) {
    return { workspace_id: wid, results: [], total: 0 };
  }

  const regex = new RegExp(pattern, options.caseSensitive ? '' : 'i');
  const results = [];
  const maxResults = options.limit || 50;

  async function walk(dir) {
    if (results.length >= maxResults) return;
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(dir, item.name);
        const relPath = path.relative(wsPath, fullPath).replace(/\\/g, '/');

        if (regex.test(item.name)) {
          const entry = { name: item.name, type: item.isDirectory() ? 'dir' : 'file', path: relPath };
          if (item.isFile()) {
            try {
              const stat = await fs.stat(fullPath);
              entry.size = stat.size;
            } catch { /* ignore */ }
          }
          results.push(entry);
        }

        if (item.isDirectory()) {
          await walk(fullPath);
        }
      }
    } catch { /* ignore */ }
  }

  await walk(wsPath);

  return { workspace_id: wid, results, total: results.length };
}

// ─── Utility ──────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ─── Export ────────────────────────────────────────────────────────────────

module.exports = {
  WORKSPACE_ROOT,
  TEMPLATES,
  initWorkspace,
  getWorkspacePath,
  listWorkspace,
  createProject,
  listProjects,
  getProject,
  deleteProject,
  getWorkspaceStats,
  cleanWorkspace,
  resolveFilePath,
  readFile,
  writeFile,
  deleteFile,
  moveFile,
  copyFile,
  searchFiles,
  // Utilities
  sanitizeWorkspaceId,
  sanitizeProjectName,
  formatBytes,

  default: {
    WORKSPACE_ROOT,
    TEMPLATES,
    initWorkspace,
    getWorkspacePath,
    listWorkspace,
    createProject,
    listProjects,
    getProject,
    deleteProject,
    getWorkspaceStats,
    cleanWorkspace,
    resolveFilePath,
    readFile,
    writeFile,
    deleteFile,
    moveFile,
    copyFile,
    searchFiles,
    sanitizeWorkspaceId,
    sanitizeProjectName,
    formatBytes,
  },
};