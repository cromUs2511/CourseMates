// Secret scanner: fails CI if tracked files contain likely committed secrets.
// Self-contained (no dependencies). Scans `git ls-files` output only, so
// git-ignored files (.env, .env.local, node_modules, dist) are never read.
//
// Sensitive literals below are built by concatenation so this file does not
// match its own patterns. Placeholder values (.env.example, CI dummy env)
// are allowlisted by value, not by file.
//
// Usage: node scripts/scan-secrets.cjs
// Exit code: 0 = clean, 1 = hits found (or scanner error).

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// High-confidence token/key formats (built from parts to avoid self-match).
const TOKEN_PATTERNS = [
  'gh' + 'p_[A-Za-z0-9]{36,}', // GitHub personal access token
  'gh' + 'o_[A-Za-z0-9]{36,}', // GitHub OAuth token
  'github_' + 'pat_[A-Za-z0-9_]{20,}', // GitHub fine-grained PAT
  'xox' + '[bap]-[A-Za-z0-9-]{10,}', // Slack token
  'sk-' + 'ant-[A-Za-z0-9-]{10,}', // Anthropic key
  'AK' + 'IA[0-9A-Z]{16}', // AWS access key id
  '-----BEGIN ' + '(RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
].map((source) => new RegExp(source));

// `name = "value"` style assignments for sensitive names (quoted or bare).
const ASSIGNMENT_PATTERN =
  /["']?((?:api[_-]?key|auth[_-]?token|secret|passwd|password|pwd))["']?\s*[:=]\s*["']?([^"'\s]+)["']?/i;

// Values that are obviously placeholders, not real secrets.
const FIXTURE_WORDS = [
  'test',
  'fake',
  'dummy',
  'example',
  'placeholder',
  'changeme',
  'incorrect',
  'invalid',
  'wrong',
  'sample',
  'demo',
  'password',
  'secret',
  'admin',
  'token',
  'apikey',
  'api_key',
];
// Real committed secrets look like opaque tokens (hex, base64, provider
// prefixes). Code references (`options.secret`, `process.env.X`) and plain
// English words (`incorrect`, `string;`) do not, so they are not flagged.
// (Dotted JWTs are a known blind spot; none are used in this repo.)
const TOKEN_SHAPE = /^[A-Za-z0-9_\-+/=]{8,}$/;
function isPlaceholder(value) {
  const v = value.trim().replace(/[,;)]+$/, '');
  if (!v) return true;
  if (!TOKEN_SHAPE.test(v)) return true;
  const lower = v.toLowerCase();
  if (FIXTURE_WORDS.some((word) => lower.includes(word))) return true;
  if (/^(.)\1{3,}$/.test(v)) return true; // repeated single char (aaaa…, ****)
  if (/^[a-z-]+$/.test(v) && v.length < 20) return true; // fixture slug
  if (/my[_-]?gemini[_-]?api[_-]?key/i.test(v)) return true; // documented placeholder key name
  return false;
}

function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out
    .toString('utf8')
    .split('\0')
    .filter((f) => f.length > 0);
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function main() {
  let files;
  try {
    files = listTrackedFiles();
  } catch (error) {
    console.error('scan:secrets: unable to list tracked files (is git available?).');
    console.error(String(error && error.message ? error.message : error));
    process.exitCode = 1;
    return;
  }

  const hits = [];
  for (const relative of files) {
    const absolute = path.join(REPO_ROOT, relative);
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size === 0 || stat.size > 2 * 1024 * 1024) continue;
    let buffer;
    try {
      buffer = fs.readFileSync(absolute);
    } catch {
      continue;
    }
    if (isBinary(buffer)) continue;
    const lines = buffer.toString('utf8').split('\n');
    lines.forEach((line, index) => {
      for (const pattern of TOKEN_PATTERNS) {
        if (pattern.test(line)) {
          hits.push({
            file: relative,
            line: index + 1,
            kind: 'token/key',
            text: line.trim().slice(0, 120),
          });
          return;
        }
      }
      const match = ASSIGNMENT_PATTERN.exec(line);
      if (match && !isPlaceholder(match[2])) {
        hits.push({ file: relative, line: index + 1, kind: 'assignment', text: `${match[1]}=…` });
      }
    });
  }

  if (hits.length > 0) {
    console.error(`scan:secrets: ${hits.length} potential secret(s) in tracked files:`);
    for (const hit of hits) {
      console.error(`  ${hit.file}:${hit.line} [${hit.kind}] ${hit.text}`);
    }
    console.error('Remove the secret, replace it with a placeholder, or refine the allowlist.');
    process.exitCode = 1;
    return;
  }
  console.log(`scan:secrets: clean (${files.length} tracked files checked).`);
}

main();
