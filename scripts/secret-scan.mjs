#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git','node_modules','dist','data','.DS_Store','package-lock.json']);
const suspiciousNames = [/^\.env(\..*)?$/i, /secret/i, /credential/i, /private[_-]?key/i];
const patterns = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/, 'private key block'],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/sk-[A-Za-z0-9]{32,}/, 'OpenAI-style API key'],
  [/xox[baprs]-[A-Za-z0-9-]{20,}/, 'Slack token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT']
];
const allow = new Set(['.env.example','scripts/secret-scan.mjs','docs/SECURITY.md']);
const findings = [];
function walk(dir){
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const p = path.join(dir, ent.name); const rel = path.relative(root, p);
    if (ent.isDirectory()) walk(p); else {
      if (!allow.has(rel) && suspiciousNames.some(r=>r.test(ent.name))) findings.push(`${rel}: suspicious filename for public repo`);
      const stat = fs.statSync(p); if (stat.size > 1_000_000) continue;
      const txt = fs.readFileSync(p, 'utf8');
      for (const [re,label] of patterns) if (re.test(txt) && !allow.has(rel)) findings.push(`${rel}: ${label}`);
    }
  }
}
walk(root);
if (findings.length) { console.error('Secret scan failed:\n' + findings.map(f=>' - '+f).join('\n')); process.exit(1); }
console.log('Secret scan passed: no obvious secrets or private env files found.');
