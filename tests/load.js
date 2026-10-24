// Loads game modules into Node for headless tests.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = undefined;
const files = ['core', 'hand', 'engine', 'yaku', 'roles', 'scorer', 'save', 'cpu', 'data'];
for (const f of files) require(path.join(ROOT, 'js', f + '.js'));
const MJ2 = globalThis.MJ2;
const raw = {};
for (const [k, p] of Object.entries(MJ2.Data.FILES)) raw[k] = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
MJ2.Data.initData(raw);
module.exports = MJ2;
