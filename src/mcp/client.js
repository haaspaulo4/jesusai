class MCPClient {
  constructor() {
    this.servers = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;

    try {
      const { pool } = require('../db');
      const [rows] = await pool.execute(
        'SELECT id, name, command, args, env_vars, is_active FROM mcp_servers WHERE is_active = 1 ORDER BY id ASC'
      );

      for (const row of rows) {
        let args = row.args;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = args.split(' '); } }
        let envVars = row.env_vars;
        if (typeof envVars === 'string') { try { envVars = JSON.parse(env_vars); } catch { envVars = {}; } }

        this.servers.set(row.id, {
          id: row.id,
          name: row.name,
          command: row.command,
          args: args || [],
          envVars: envVars || {},
          isActive: !!row.is_active,
          process: null,
          tools: [],
          connected: false,
        });
      }

      this.loaded = true;
      console.log(`[MCP] ${this.servers.size} server(s) loaded`);
    } catch (err) {
      console.log('[MCP] No MCP servers configured or table not found');
      this.loaded = true;
    }
  }

  async connectServer(serverId) {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`MCP server ${serverId} not found`);

    try {
      const { spawn } = require('child_process');
      const env = { ...process.env, ...server.envVars };

      const proc = spawn(server.command, server.args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      proc.on('error', (err) => {
        console.error(`[MCP] Server "${server.name}" error:`, err.message);
        server.connected = false;
      });

      proc.on('exit', (code) => {
        console.log(`[MCP] Server "${server.name}" exited with code ${code}`);
        server.connected = false;
        server.process = null;
      });

      server.process = proc;
      server.connected = true;
      console.log(`[MCP] Server "${server.name}" connected (PID: ${proc.pid})`);

      await this._discoverTools(server);

      return { id: server.id, name: server.name, connected: true, tools: server.tools };
    } catch (err) {
      console.error(`[MCP] Failed to connect "${server.name}":`, err.message);
      server.connected = false;
      throw err;
    }
  }

  async _discoverTools(server) {
    return new Promise((resolve) => {
      if (!server.process || !server.process.stdout) {
        resolve([]);
        return;
      }

      let buffer = '';

      const timeout = setTimeout(() => {
        server.tools = [];
        resolve([]);
      }, 5000);

      const handler = (data) => {
        buffer += data.toString();

        try {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line.trim());
            if (msg.type === 'tools' && Array.isArray(msg.tools)) {
              server.tools = msg.tools;
              clearTimeout(timeout);
              server.process.stdout.removeListener('data', handler);
              resolve(msg.tools);
              return;
            }
          }
        } catch {}
      };

      server.process.stdout.on('data', handler);

      try {
        const initMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'jesus-ai', version: '1.0.0' },
          },
        }) + '\n';
        server.process.stdin.write(initMsg);

        const listTools = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }) + '\n';
        setTimeout(() => {
          try { server.process.stdin.write(listTools); } catch {}
        }, 1000);
      } catch {}
    });
  }

  async callTool(serverId, toolName, args) {
    const server = this.servers.get(serverId);
    if (!server || !server.process || !server.connected) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        reject(new Error('MCP tool call timeout'));
      }, 30000);

      const handler = (data) => {
        buffer += data.toString();
        try {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line.trim());
            if (msg.id === 3) {
              clearTimeout(timeout);
              server.process.stdout.removeListener('data', handler);
              if (msg.error) {
                reject(new Error(msg.error.message || 'MCP tool error'));
              } else {
                resolve(msg.result);
              }
              return;
            }
          }
        } catch {}
      };

      server.process.stdout.on('data', handler);

      const callMsg = JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }) + '\n';

      try {
        server.process.stdin.write(callMsg);
      } catch (err) {
        clearTimeout(timeout);
        server.process.stdout.removeListener('data', handler);
        reject(err);
      }
    });
  }

  async addServer(name, command, args, envVars = {}) {
    const { pool } = require('../db');

    const [result] = await pool.execute(
      'INSERT INTO mcp_servers (name, command, args, env_vars, is_active) VALUES (?, ?, ?, ?, 1)',
      [name, command, JSON.stringify(args || []), JSON.stringify(envVars)]
    );

    const server = {
      id: result.insertId,
      name,
      command,
      args: args || [],
      envVars: envVars || {},
      isActive: true,
      process: null,
      tools: [],
      connected: false,
    };

    this.servers.set(result.insertId, server);
    console.log(`[MCP] Added server: "${name}"`);
    return { id: result.insertId, name };
  }

  async removeServer(serverId) {
    const server = this.servers.get(serverId);
    if (server?.process) {
      try { server.process.kill(); } catch {}
    }

    const { pool } = require('../db');
    await pool.execute('DELETE FROM mcp_servers WHERE id = ?', [serverId]);
    this.servers.delete(serverId);
    console.log(`[MCP] Removed server: ${serverId}`);
  }

  async toggleServer(serverId, isActive) {
    const { pool } = require('../db');
    await pool.execute('UPDATE mcp_servers SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, serverId]);

    const server = this.servers.get(serverId);
    if (server) server.isActive = !!isActive;
  }

  getServers() {
    return [...this.servers.values()].map(s => ({
      id: s.id,
      name: s.name,
      command: s.command,
      args: s.args,
      connected: s.connected,
      toolCount: s.tools.length,
      tools: s.tools.map(t => ({ name: t.name, description: t.description })),
      isActive: s.isActive,
    }));
  }

  getAllTools() {
    const tools = [];
    for (const server of this.servers.values()) {
      if (!server.connected || !server.isActive) continue;
      for (const tool of server.tools) {
        tools.push({
          ...tool,
          mcpServerId: server.id,
          mcpServerName: server.name,
        });
      }
    }
    return tools;
  }

  getAllToolDefinitions() {
    return this.getAllTools().map(t => ({
      type: 'function',
      function: {
        name: `mcp_${t.mcpServerName}_${t.name}`.replace(/[^a-z0-9_]/gi, '_'),
        description: `[${t.mcpServerName}] ${t.description || ''}`,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
      mcpServerId: t.mcpServerId,
      mcpOriginalName: t.name,
    }));
  }

  destroy() {
    for (const server of this.servers.values()) {
      if (server.process) {
        try { server.process.kill(); } catch {}
      }
    }
  }
}

const mcpClient = new MCPClient();
module.exports = mcpClient;