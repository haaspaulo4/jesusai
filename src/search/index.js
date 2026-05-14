require('dotenv').config();
const FlexSearch = require('flexsearch');
const { pool } = require('../db');

const FLEX_ENABLED = process.env.FLEXSEARCH_ENABLED !== 'false';

class FulltextSearch {
  constructor() {
    this.indexes = new Map();
    this._initialized = false;
  }

  get enabled() {
    return FLEX_ENABLED;
  }

  async initialize() {
    if (this._initialized) return;

    if (!FLEX_ENABLED) {
      console.log('[FlexSearch] Disabled (FLEXSEARCH_ENABLED=false)');
      return;
    }

    await this._buildIndexes();
    this._initialized = true;
    console.log('[FlexSearch] Initialized');
  }

  async _buildIndexes() {
    await this._buildPersonaIndex();
    await this._buildKnowledgeSourceIndex();
    await this._buildContactsIndex();
    await this._buildGoalsIndex();
    await this._buildOrgMemoryIndex();
    await this._buildTasksIndex();
    await this._buildSkillsIndex();
  }

  async _buildPersonaIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['name', 'name_en', 'name_es', 'description'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute('SELECT persona_id as id, name, name_en, name_es FROM personas WHERE is_active = 1');
      for (const row of rows) {
        index.add({ id: row.id, name: row.name || '', name_en: row.name_en || '', name_es: row.name_es || '', description: '' });
      }
    } catch {}

    this.indexes.set('personas', index);
  }

  async _buildKnowledgeSourceIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['name', 'description'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const { getAllEnabledSources } = require('../knowledge/config');
      const sources = getAllEnabledSources();
      for (const source of sources) {
        index.add({ id: source.id, name: source.name || '', description: source.description || '' });
      }
    } catch {}

    this.indexes.set('knowledge_sources', index);
  }

  async _buildContactsIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['name', 'email', 'company', 'notes'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute('SELECT id, name, email, company, notes FROM persona_contacts');
      for (const row of rows) {
        index.add({ id: row.id, name: row.name || '', email: row.email || '', company: row.company || '', notes: row.notes || '' });
      }
    } catch {}

    this.indexes.set('contacts', index);
  }

  async _buildGoalsIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['title', 'description'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute("SELECT id, title, description FROM persona_goals WHERE status = 'active'");
      for (const row of rows) {
        index.add({ id: row.id, title: row.title || '', description: row.description || '' });
      }
    } catch {}

    this.indexes.set('goals', index);
  }

  async _buildOrgMemoryIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['title', 'content', 'category'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute('SELECT id, title, content, category FROM persona_org_memory WHERE is_active = 1');
      for (const row of rows) {
        index.add({ id: row.id, title: row.title || '', content: row.content || '', category: row.category || '' });
      }
    } catch {}

    this.indexes.set('org_memory', index);
  }

  async _buildTasksIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['title', 'description'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute('SELECT id, title, description FROM persona_tasks');
      for (const row of rows) {
        index.add({ id: row.id, title: row.title || '', description: row.description || '' });
      }
    } catch {}

    this.indexes.set('tasks', index);
  }

  async _buildSkillsIndex() {
    const index = new FlexSearch.Document({
      document: { id: 'id', index: ['name', 'description'], store: true },
      tokenize: 'forward',
      resolution: 9,
    });

    try {
      const [rows] = await pool.execute('SELECT id, name, description FROM persona_skills WHERE is_active = 1');
      for (const row of rows) {
        index.add({ id: row.id, name: row.name || '', description: row.description || '' });
      }
    } catch {}

    this.indexes.set('skills', index);
  }

  search(collection, query, limit = 10) {
    if (!FLEX_ENABLED || !this.indexes.has(collection)) return [];

    const index = this.indexes.get(collection);
    const results = [];

    try {
      for (const field of index.indexes || ['name', 'title', 'content']) {
        const fieldResults = index.search(query, { limit, field, enrich: true });
        for (const result of fieldResults) {
          if (result.result) {
            for (const item of result.result) {
              if (!results.find(r => r.id === item.id)) {
                results.push(item);
              }
            }
          }
        }
      }
    } catch {}

    return results.slice(0, limit);
  }

  async rebuildIndex(collection) {
    switch (collection) {
      case 'personas': await this._buildPersonaIndex(); break;
      case 'knowledge_sources': await this._buildKnowledgeSourceIndex(); break;
      case 'contacts': await this._buildContactsIndex(); break;
      case 'goals': await this._buildGoalsIndex(); break;
      case 'org_memory': await this._buildOrgMemoryIndex(); break;
      case 'tasks': await this._buildTasksIndex(); break;
      case 'skills': await this._buildSkillsIndex(); break;
      default: await this._buildIndexes(); break;
    }
  }

  getStats() {
    const stats = {};
    for (const [name, index] of this.indexes.entries()) {
      try {
        stats[name] = { documentCount: index.documentStore?.length || 0 };
      } catch {
        stats[name] = { documentCount: 0 };
      }
    }
    return { enabled: FLEX_ENABLED, indexes: stats };
  }
}

const fulltextSearch = new FulltextSearch();

module.exports = {
  fulltextSearch,
  FulltextSearch,
};