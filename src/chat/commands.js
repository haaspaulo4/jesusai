const { pool } = require('../db');

let commandsCache = [];
let loaded = false;

async function loadCommands() {
  if (loaded) return;
  try {
    const [rows] = await pool.execute('SELECT * FROM chat_commands WHERE is_active = 1');
    commandsCache = rows;
    loaded = true;
    console.log(`[ChatCommands] Loaded ${commandsCache.length} commands`);
  } catch (err) {
    console.error('[ChatCommands] Load error:', err.message);
  }
}

async function getCommands() {
  await loadCommands();
  return commandsCache;
}

async function getCommand(cmd) {
  await loadCommands();
  const lowerCmd = cmd.toLowerCase();
  return commandsCache.find(c => 
    c.command.toLowerCase() === lowerCmd || 
    (c.aliases && JSON.parse(c.aliases).includes(lowerCmd))
  );
}

async function createCommand(data) {
  const { command, description, response_template, response_type, action_type, action_config, required_role, required_persona_id, aliases, usage_examples, category, created_by } = data;
  
  const aliasesJson = aliases ? JSON.stringify(aliases) : null;
  const examplesJson = usage_examples ? JSON.stringify(usage_examples) : null;
  const configJson = action_config ? JSON.stringify(action_config) : null;
  
  const [result] = await pool.execute(
    `INSERT INTO chat_commands (command, description, response_template, response_type, action_type, action_config, required_role, required_persona_id, aliases, usage_examples, category, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [command, description, response_template, response_type || 'text', action_type || 'respond', configJson, required_role || 'user', required_persona_id, aliasesJson, examplesJson, category || 'general', created_by]
  );
  
  invalidateCache();
  return { id: result.insertId, command };
}

async function updateCommand(id, data) {
  const fields = [];
  const values = [];
  
  if (data.command !== undefined) { fields.push('command = ?'); values.push(data.command); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.response_template !== undefined) { fields.push('response_template = ?'); values.push(data.response_template); }
  if (data.response_type !== undefined) { fields.push('response_type = ?'); values.push(data.response_type); }
  if (data.action_type !== undefined) { fields.push('action_type = ?'); values.push(data.action_type); }
  if (data.action_config !== undefined) { fields.push('action_config = ?'); values.push(JSON.stringify(data.action_config)); }
  if (data.required_role !== undefined) { fields.push('required_role = ?'); values.push(data.required_role); }
  if (data.required_persona_id !== undefined) { fields.push('required_persona_id = ?'); values.push(data.required_persona_id); }
  if (data.aliases !== undefined) { fields.push('aliases = ?'); values.push(JSON.stringify(data.aliases)); }
  if (data.usage_examples !== undefined) { fields.push('usage_examples = ?'); values.push(JSON.stringify(data.usage_examples)); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
  
  if (fields.length === 0) return { error: 'No fields to update' };
  
  values.push(id);
  await pool.execute(`UPDATE chat_commands SET ${fields.join(', ')} WHERE id = ?`, values);
  
  invalidateCache();
  return { id, updated: true };
}

async function deleteCommand(id) {
  await pool.execute('DELETE FROM chat_commands WHERE id = ?', [id]);
  invalidateCache();
  return { id, deleted: true };
}

async function incrementUsage(id) {
  await pool.execute('UPDATE chat_commands SET usage_count = usage_count + 1 WHERE id = ?', [id]);
}

function invalidateCache() {
  loaded = false;
}

const DEFAULT_COMMANDS = [
  { command: 'ajuda', description: 'Mostra lista de comandos disponíveis', response_template: 'Comandos disponíveis:\n• /ajuda - Esta mensagem\n• /stats - Suas estatísticas\n• /persona - Listar personas\n• /xp - Ver XP e level\n• /goals - Ver metas\n• /dashboard - Painel geral', response_type: 'text', category: 'general' },
  { command: 'ping', description: 'Testa connectivity', response_template: 'Pong! 🤙', response_type: 'text', category: 'general' },
  { command: 'bonjour', description: 'Saudação em francês', response_template: 'Bonjour! 🇫🇷 Comment allez-vous?', response_type: 'text', category: 'fun' },
  { command: 'hola', description: 'Saudação em espanhol', response_template: '¡Hola! 🇪🇸 ¿Cómo estás?', response_type: 'text', category: 'fun' },
  { command: 'hi', description: 'Saudação em inglês', response_template: 'Hi! 🇬🇧 How are you?', response_type: 'text', category: 'fun' },
  { command: 'piada', description: 'Conta uma piada', response_type: 'tool', action_type: 'invoke_skill', action_config: { tool_id: 'jokes' }, category: 'fun' },
  { command: 'fato', description: 'Fato aleatório', response_type: 'tool', action_type: 'invoke_skill', action_config: { tool_id: 'cat_facts' }, category: 'fun' },
  { command: 'clima', description: 'Previsão do tempo', response_type: 'tool', action_type: 'invoke_skill', action_config: { tool_id: 'weather' }, category: 'utility' },
];

async function seedDefaultCommands() {
  try {
    for (const cmd of DEFAULT_COMMANDS) {
      try {
        await pool.execute(
          `INSERT IGNORE INTO chat_commands (command, description, response_template, response_type, action_type, action_config, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cmd.command, cmd.description, cmd.response_template || null, cmd.response_type || 'text', cmd.action_type || 'respond', cmd.action_config ? JSON.stringify(cmd.action_config) : null, cmd.category || 'general']
        );
      } catch (e) { console.log(`[Seed] Command ${cmd.command}: ${e.message}`); }
    }
    console.log('[Seed] Default chat commands seeded');
  } catch (e) { console.error('[Seed] Chat commands seed error:', e.message); }
}

async function processCommand(message, userId, role, personaId) {
  const cmd = await getCommand(message.trim());
  if (!cmd) return null;
  
  // Check role requirement
  if (cmd.required_role) {
    const roleHierarchy = { admin: 4, premium: 3, user: 2, guest: 1 };
    if (roleHierarchy[role] < roleHierarchy[cmd.required_role]) {
      return { error: 'Você não tem permissão para usar este comando.' };
    }
  }
  
  // Check persona requirement
  if (cmd.required_persona_id && cmd.required_persona_id !== personaId) {
    return { error: 'Este comando requer uma persona específica.' };
  }
  
  // Increment usage
  if (cmd.id) incrementUsage(cmd.id);
  
  // Process response
  let response = cmd.response_template || '';
  
  // Handle dynamic placeholders
  response = response.replace(/\{user\}/g, userId);
  response = response.replace(/\{date\}/g, new Date().toLocaleDateString('pt-BR'));
  response = response.replace(/\{time\}/g, new Date().toLocaleTimeString('pt-BR'));
  
  return {
    command: cmd.command,
    description: cmd.description,
    response,
    response_type: cmd.response_type,
    action_type: cmd.action_type,
    action_config: cmd.action_config ? JSON.parse(cmd.action_config) : {},
  };
}

module.exports = {
  loadCommands,
  getCommands,
  getCommand,
  createCommand,
  updateCommand,
  deleteCommand,
  processCommand,
  invalidateCache,
};