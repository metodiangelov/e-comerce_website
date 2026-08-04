const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const requiredFiles = [
  'server.js',
  'package.json',
  'public/index.html',
  'data/products.json',
  'data/orders.json',
  '.env.example',
  '.gitignore'
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

for (const relativePath of ['data/products.json', 'data/orders.json', 'package.json']) {
  JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
if (!inlineScripts.length) throw new Error('No inline JavaScript found in public/index.html');
for (const script of inlineScripts) new Function(script);

const forbiddenFiles = ['.env', 'node_modules'];
for (const relativePath of forbiddenFiles) {
  if (fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Remove ${relativePath} before publishing`);
  }
}

console.log('Project checks passed.');
