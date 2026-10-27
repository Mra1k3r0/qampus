const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const CSS_ENTRY = path.join(ROOT, 'public', 'css', 'main.css');
const CSS_OUT = path.join(ROOT, 'public', 'css', 'main.min.css');
const JS_ENTRIES = ['app', 'auth', 'call-watch', 'display', 'profile', 'queue', 'staff'];
const IMPORT_PATTERN = /@import\s+url\(["']?([^"')]+)["']?\);/g;

function inlineCss(filePath, seen) {
  const absolute = path.resolve(filePath);
  if (seen.has(absolute)) {
    return '';
  }
  seen.add(absolute);

  const source = fs.readFileSync(absolute, 'utf8');
  return source.replace(IMPORT_PATTERN, (_match, specifier) => {
    if (/^(?:[a-z]+:)?\/\//i.test(specifier) || specifier.startsWith('data:')) {
      return _match;
    }
    return inlineCss(path.resolve(path.dirname(absolute), specifier), seen);
  });
}

async function buildCss() {
  const source = inlineCss(CSS_ENTRY, new Set());
  const result = await esbuild.transform(source, {
    charset: 'utf8',
    loader: 'css',
    minify: true,
    target: ['chrome100', 'firefox100', 'safari15'],
  });
  fs.writeFileSync(CSS_OUT, result.code, 'utf8');
  return { file: path.relative(ROOT, CSS_OUT), bytes: Buffer.byteLength(result.code) };
}

async function buildScript(name) {
  const entry = path.join(ROOT, 'public', 'js', `${name}.js`);
  const outfile = path.join(ROOT, 'public', 'js', `${name}.min.js`);
  await esbuild.build({
    bundle: true,
    charset: 'utf8',
    entryPoints: [entry],
    legalComments: 'none',
    minify: true,
    outfile,
    target: ['chrome100', 'firefox100', 'safari15'],
  });
  return { file: path.relative(ROOT, outfile), bytes: fs.statSync(outfile).size };
}

async function main() {
  const css = await buildCss();
  const scripts = [];
  for (const name of JS_ENTRIES) {
    scripts.push(await buildScript(name));
  }

  const outputs = [css, ...scripts];
  for (const output of outputs) {
    process.stdout.write(`${output.file} ${output.bytes} bytes\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
