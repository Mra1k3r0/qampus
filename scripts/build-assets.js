const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { PurgeCSS } = require('purgecss');

const ROOT = path.resolve(__dirname, '..');
const CSS_ENTRY = path.join(ROOT, 'public', 'css', 'main.css');
const CSS_OUT = path.join(ROOT, 'public', 'css', 'main.min.css');
const JS_ENTRIES = ['theme', 'app', 'auth', 'call-watch', 'display', 'profile', 'queue', 'staff'];
const IMPORT_PATTERN = /@import\s+url\(["']?([^"')]+)["']?\);/g;
const TARGETS = ['chrome100', 'firefox100', 'safari15'];
const SHARED_TEMPLATES = [
  'views/layouts/app.ejs',
  'views/partials/error-summary.ejs',
  'views/partials/flash.ejs',
  'views/partials/icon.ejs',
  'views/pages/404.ejs',
  'views/pages/error.ejs',
];
const PAGE_BUNDLES = {
  base: [],
  home: ['views/pages/home.ejs', 'views/partials/call-watch.ejs', 'public/js/app.js'],
  queue: [
    'views/pages/queue-dashboard.ejs',
    'views/pages/queue-service.ejs',
    'views/pages/ticket.ejs',
    'views/partials/call-watch.ejs',
    'public/js/app.js',
    'public/js/call-watch.js',
    'public/js/queue.js',
  ],
  staff: [
    'views/pages/staff-queue.ejs',
    'views/pages/staff-ticket.ejs',
    'public/js/app.js',
    'public/js/staff.js',
  ],
  admin: [
    'views/pages/admin-services.ejs',
    'views/pages/admin-staff.ejs',
    'views/partials/admin-staff-form.ejs',
    'views/partials/staff-account-row.ejs',
    'public/js/app.js',
  ],
  auth: [
    'views/pages/check-email.ejs',
    'views/pages/forgot-password.ejs',
    'views/pages/forgot-sent.ejs',
    'views/pages/login.ejs',
    'views/pages/register.ejs',
    'views/pages/reset-password.ejs',
    'views/pages/reset-password-new.ejs',
    'views/pages/verify-email.ejs',
    'public/js/app.js',
    'public/js/auth.js',
  ],
  policy: [
    'views/pages/policy.ejs',
    'views/pages/privacy.ejs',
    'views/partials/call-watch.ejs',
    'public/js/app.js',
    'public/js/call-watch.js',
  ],
  profile: [
    'views/pages/profile.ejs',
    'views/partials/call-watch.ejs',
    'public/js/app.js',
    'public/js/call-watch.js',
    'public/js/profile.js',
  ],
  display: ['views/pages/display.ejs', 'public/js/display.js'],
};
const SAFELIST = {
  standard: ['is-current', 'no-js', 'visually-hidden', ':focus-visible', 'data-theme'],
  deep: [
    /^is-/,
    /^has-/,
    /^pill--/,
    /^flash--/,
    /^::view-transition/,
  ],
};

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

async function minifyCss(source) {
  const result = await esbuild.transform(source, {
    charset: 'utf8',
    loader: 'css',
    minify: true,
    target: TARGETS,
  });
  return result.code;
}

async function buildCss() {
  const source = inlineCss(CSS_ENTRY, new Set());
  const result = await minifyCss(source);
  fs.writeFileSync(CSS_OUT, result, 'utf8');
  return { file: path.relative(ROOT, CSS_OUT), bytes: Buffer.byteLength(result) };
}

function readContent(files) {
  const unique = [...new Set(files.map((file) => path.resolve(ROOT, file)))];
  return unique.map((file) => ({
    extension: path.extname(file).slice(1),
    raw: fs.readFileSync(file, 'utf8'),
  }));
}

async function buildPageCss(name, files) {
  const source = inlineCss(CSS_ENTRY, new Set());
  const content = readContent([...SHARED_TEMPLATES, ...files]);
  const purged = await new PurgeCSS().purge({
    content,
    css: [{ raw: source }],
    keyframes: false,
    rejected: false,
    safelist: SAFELIST,
    variables: false,
  });
  const result = await minifyCss(purged[0].css);
  const outfile = path.join(ROOT, 'public', 'css', `page-${name}.min.css`);
  fs.writeFileSync(outfile, result, 'utf8');
  return { file: path.relative(ROOT, outfile), bytes: Buffer.byteLength(result) };
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
    target: TARGETS,
  });
  return { file: path.relative(ROOT, outfile), bytes: fs.statSync(outfile).size };
}

async function main() {
  const css = await buildCss();
  const pages = [];
  for (const [name, files] of Object.entries(PAGE_BUNDLES)) {
    pages.push(await buildPageCss(name, files));
  }
  const scripts = [];
  for (const name of JS_ENTRIES) {
    scripts.push(await buildScript(name));
  }

  const outputs = [css, ...pages, ...scripts];
  for (const output of outputs) {
    process.stdout.write(`${output.file} ${output.bytes} bytes\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
