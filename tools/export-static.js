'use strict';
// Статическая сборка для GitHub Pages: контент -> public/data, без сервера.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const content = path.join(root, 'content');
const out = path.join(root, 'public', 'data');

fs.mkdirSync(out, { recursive: true });

for (const name of ['works.json', 'settings.json']) {
  const src = path.join(content, name);
  const dst = path.join(out, name);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(dst, JSON.stringify(data, null, 2), 'utf8');
  console.log('OK', name, '->', path.relative(root, dst));
}

// .nojekyll — чтобы GitHub Pages не трогал файлы
fs.writeFileSync(path.join(root, 'public', '.nojekyll'), '', 'utf8');
console.log('OK .nojekyll');
