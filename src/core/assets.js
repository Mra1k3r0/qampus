const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSIONED_DIRS = ['/css', '/js', '/images', '/icons'];
const VERSION_LENGTH = 12;
const DEFAULT_PUBLIC_ROOT = path.resolve(__dirname, '..', '..', 'public');
const THEME_BOOTSTRAP_SCRIPT = "(function(){var t;try{t=window.localStorage.getItem('qampus.theme')}catch(e){}if(t!=='light'&&t!=='dark'&&t!=='midnight'){try{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=(t==='midnight')?'dark':t})();";
const THEME_BOOTSTRAP_HASH = crypto
  .createHash('sha256')
  .update(THEME_BOOTSTRAP_SCRIPT)
  .digest('base64');
const THEME_BOOTSTRAP_CSP_HASH = `'sha256-${THEME_BOOTSTRAP_HASH}'`;

let publicRoot = DEFAULT_PUBLIC_ROOT;
let assetMap = null;

function toUrlPath(relativePath) {
  return `/${relativePath.split(path.sep).join('/')}`;
}

function walkFiles(directory, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }
}

function hashFile(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, VERSION_LENGTH);
}

function buildAssetMap(root) {
  const map = new Map();
  for (const dir of VERSIONED_DIRS) {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const files = [];
    walkFiles(absolute, files);
    for (const file of files) {
      const urlPath = toUrlPath(path.relative(root, file));
      map.set(urlPath, hashFile(file));
    }
  }
  return map;
}

function initAssets(root = DEFAULT_PUBLIC_ROOT) {
  publicRoot = root;
  assetMap = null;
}

function getAssetMap() {
  if (!assetMap) {
    assetMap = buildAssetMap(publicRoot);
  }
  return assetMap;
}

function isVersionedDir(publicPath) {
  return VERSIONED_DIRS.some((dir) => publicPath === dir || publicPath.startsWith(`${dir}/`));
}

function assetUrl(publicPath) {
  const version = getAssetMap().get(publicPath);
  if (!version) {
    return publicPath;
  }
  return `${publicPath}?v=${version}`;
}

function isVersionedRequest(reqPath, version) {
  if (typeof version !== 'string' || version.length === 0) {
    return false;
  }
  return getAssetMap().get(reqPath) === version;
}

module.exports = {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_BOOTSTRAP_CSP_HASH,
  VERSIONED_DIRS,
  initAssets,
  buildAssetMap,
  isVersionedDir,
  assetUrl,
  isVersionedRequest,
};
