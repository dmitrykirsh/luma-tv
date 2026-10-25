// Отладка десктопной Luma: запустить с --remote-debugging-port=9444, затем node tools/cdpdesk.mjs "<js>"
import fs from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9444/json')).json();
const page = list.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const args = process.argv.slice(2); const shot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const expr = args.filter((a, i) => a !== '--shot' && args[i - 1] !== '--shot').join(' ');
if (expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); console.log(JSON.stringify(r.result.result.value ?? r.result.exceptionDetails ?? null)); }
if (shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shot, Buffer.from(r.result.data, 'base64')); }
process.exit(0);
