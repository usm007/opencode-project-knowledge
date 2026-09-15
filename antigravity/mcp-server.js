'use strict';
/**
 * antigravity/mcp-server.js — MCP stdio server for Antigravity IDE/CLI.
 *
 * Exposes the same `project_context` as the OpenCode plugin, plus
 * `project_status` and `project_detect` helpers. The engine itself
 * (../project-knowledge/*.js) is NOT rewritten — this is a thin stdio
 * JSON-RPC wrapper that delegates to it.
 *
 * Transport: MCP over stdio (newline-delimited JSON-RPC 2.0).
 * No external dependencies; works with Node >=18.
 *
 * Antigravity loads it via `~/.gemini/config/mcp_config.json`:
 *   { "mcpServers": { "project-knowledge": {
 *       "command": "node",
 *       "args": ["<config>/project-knowledge/mcp-server.js"]
 *   }}}
 *
 * The installers copy this file alongside a full engine copy at
 *   <antigravity-home>/project-knowledge/
 * so `require('./context.js')` resolves relative to this file after install.
 * During development (running from repo) it resolves to
 *   ../project-knowledge/context.js.
 */

const fs = require('fs');
const path = require('path');

function resolveEngine(rel) {
  // After install the engine sits next to this file; in-repo it sits one level up.
  const candidates = [
    path.join(__dirname, rel),
    path.join(__dirname, '..', 'project-knowledge', path.basename(rel)),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

let buildContext = null;
let detect = null;
let status = null;
try { buildContext = require(resolveEngine('context.js')).buildContext; } catch {}
try { detect = require(resolveEngine('detect.js')).detect; } catch {}
try { status = require(resolveEngine('status.js')).status; } catch {}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function handleToolCall(name, args) {
  const root = (args && (args.root || args.repo || args.directory)) || process.cwd();
  const task = (args && (args.task || args.hint)) || '';
  if (name === 'project_context') {
    if (!buildContext) return textResult(`Engine unavailable (context.js not found relative to ${__dirname}).`);
    try {
      const out = buildContext(path.resolve(root), String(task));
      return textResult(out.text);
    } catch (e) {
      return textResult(`project_context failed for ${root}: ${String(e && e.message || e)}`);
    }
  }
  if (name === 'project_detect') {
    if (!detect) return textResult('Engine unavailable (detect.js not found).');
    try {
      const out = detect(path.resolve(root));
      return textResult(JSON.stringify({ primary: out.primary, languages: out.languages, mixed: out.mixed, frameworks: out.frameworks, evidence: out.evidence }, null, 2));
    } catch (e) {
      return textResult(`project_detect failed: ${String(e && e.message || e)}`);
    }
  }
  if (name === 'project_status') {
    if (!status) return textResult('Engine unavailable (status.js not found).');
    try {
      const out = status(path.resolve(root));
      return textResult(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
    } catch (e) {
      return textResult(`project_status failed: ${String(e && e.message || e)}`);
    }
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

const TOOLS = [
  {
    name: 'project_context',
    description: 'Compact PROJECT CONTEXT (~35 lines) for a repository from its .project/ knowledge base. Call before substantial coding work; then read only the touched subsystem detail docs.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Repository root (defaults to cwd)' },
        task: { type: 'string', description: 'One-line task scope for relevant subsystem selection' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project_detect',
    description: 'Detect project type/languages/frameworks for a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Repository root (defaults to cwd)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project_status',
    description: 'Read-only health report for a repository knowledge base (.project/).',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Repository root (defaults to cwd)' },
      },
      additionalProperties: false,
    },
  },
];

function handleRequest(msg) {
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'project-knowledge', version: '1.2.0' },
      },
    };
  }
  if (method === 'notifications/initialized' || (typeof method === 'string' && method.startsWith('notifications/'))) {
    return null; // no response for notifications
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    const result = handleToolCall(name, args);
    return { jsonrpc: '2.0', id, result };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

// ── stdio loop: newline-delimited JSON-RPC ─────────────────────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const resp = handleRequest(msg);
    if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
  }
});
process.stdin.on('end', () => {
  if (buf.trim()) {
    try {
      const msg = JSON.parse(buf.trim());
      const resp = handleRequest(msg);
      if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    } catch {}
  }
});

// Keep process alive until stdin closes.
process.stdin.resume();
