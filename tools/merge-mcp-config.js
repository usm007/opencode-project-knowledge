'use strict';
/**
 * tools/merge-mcp-config.js — idempotently add/remove the `project-knowledge`
 * MCP server entry in an Antigravity `mcp_config.json`.
 *
 * Antigravity config locations (all hold the same shape):
 *   ~/.gemini/config/mcp_config.json          (primary, IDE + CLI)
 *   ~/.gemini/antigravity/mcp_config.json     (legacy fallback, some installs)
 *
 * Shape:
 *   { "mcpServers": { "<name>": { "command": "node", "args": ["<abs path>"] } } }
 *
 * Usage:
 *   node merge-mcp-config.js <configPath> <add|remove> <absMcpServerJs>
 *   add    — create file when missing; add/replace our key; preserve other servers
 *   remove — delete our key; delete file if it becomes { mcpServers: {} } or {}
 * Exit codes: 0 ok, 1 usage, 2 malformed JSON
 */
const fs = require('fs');
const path = require('path');

const [cfgPath, action, serverJs] = process.argv.slice(2);
if (!cfgPath || (action !== 'add' && action !== 'remove') || (action === 'add' && !serverJs)) {
  console.error('Usage: node merge-mcp-config.js <mcp_config.json> <add|remove> <absMcpServerJs>');
  process.exit(1);
}

const KEY = 'project-knowledge';

let existed = fs.existsSync(cfgPath);
let cfg = {};
if (existed) {
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {
    console.error(`Refusing to modify malformed JSON: ${cfgPath}`);
    process.exit(2);
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    console.error(`Refusing to modify non-object JSON: ${cfgPath}`);
    process.exit(2);
  }
} else {
  if (action === 'remove') { console.log('mcp_config absent (ok)'); process.exit(0); }
  cfg = {};
}

if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object' || Array.isArray(cfg.mcpServers)) {
  cfg.mcpServers = {};
}

if (action === 'add') {
  const abs = path.resolve(serverJs);
  const entry = { command: 'node', args: [abs] };
  const cur = cfg.mcpServers[KEY];
  if (cur && cur.command === 'node' && Array.isArray(cur.args) && cur.args[0] === abs) {
    console.log(`mcpServers.${KEY} already present (ok)`);
    process.exit(0);
  }
  cfg.mcpServers[KEY] = entry;
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`added mcpServers.${KEY} -> ${abs}`);
} else {
  if (!Object.prototype.hasOwnProperty.call(cfg.mcpServers, KEY)) {
    console.log('mcpServers.project-knowledge absent (ok)');
    process.exit(0);
  }
  delete cfg.mcpServers[KEY];
  if (Object.keys(cfg.mcpServers).length === 0) delete cfg.mcpServers;
  if (Object.keys(cfg).length === 0) {
    fs.rmSync(cfgPath);
    console.log('removed empty mcp_config.json');
    process.exit(0);
  }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`removed mcpServers.${KEY}`);
}
