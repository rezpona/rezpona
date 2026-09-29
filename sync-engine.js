/* Keep the server-side reply generator identical to the browser one.
 *
 * The dashboard loads /assets/reply-engine.js, while the autopilot Edge Function
 * runs in Deno and cannot load a browser script. Rather than maintain two copies
 * (they WILL drift, and then autopilot posts different wording to Google than the
 * dashboard showed), this generates the Deno module from the browser file.
 *
 *   node sync-engine.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'assets', 'reply-engine.js');
// Emitted as .js, not .ts: the body is plain JavaScript written for browsers, and
// running it through tsc's strict checks would only produce implicit-any noise on
// code that is already proven in production. Deno imports .js without checking it.
const OUT = path.join(__dirname, 'supabase', 'functions', '_shared', 'reply-engine.js');

const HEAD_RE = /\(function \(global\) \{\s*\n\s*'use strict';\n/;
const TAIL_RE = /\n\s*global\.RezponaReply = \{[^}]*\};\n\}\)\(window\);\s*$/;

// Git checks these files out with CRLF on Windows, so normalise before matching.
let src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

if (!HEAD_RE.test(src) || !TAIL_RE.test(src)) {
  console.error('sync-engine: the wrapper in assets/reply-engine.js changed shape.');
  console.error('Update HEAD_RE / TAIL_RE here so the two stay in sync.');
  process.exit(1);
}

const banner =
`// GENERATED FILE - do not edit.
// Produced from /assets/reply-engine.js by \`node sync-engine.js\`.
// The dashboard and the autopilot must word replies identically, so both sides
// come from that single source. Edit the browser file, then re-run the script.
// deno-lint-ignore-file
// @ts-nocheck

`;

const body = src
  .replace(HEAD_RE, '')
  .replace(TAIL_RE, '\n\nexport { generate, detect, analyse };\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, banner + body, 'utf8');

console.log('sync-engine: wrote', path.relative(__dirname, OUT));
