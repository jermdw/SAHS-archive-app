// migration/find_all_orphans.js
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, 'assets');
const ARTIFACTS_JSON_PATH = join(__dirname, 'artifacts.json');

function safeJsonParse(filePath) {
  let content = readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

const artifacts = safeJsonParse(ARTIFACTS_JSON_PATH);
const files = readdirSync(ASSETS_DIR);

const assetMap = new Map();
files.forEach(file => {
  const match = file.match(/^(\d+)_/);
  if (match) {
    const accessId = parseInt(match[1]);
    if (!assetMap.has(accessId)) assetMap.set(accessId, []);
    assetMap.get(accessId).push(file);
  }
});

console.log(`Scanning for linked vs unlinked assets...`);
let orphanCount = 0;
artifacts.forEach(item => {
  const accessId = item.access_id;
  const hasLocal = item.local_attachments && item.local_attachments.length > 0;
  const hasPhysical = assetMap.has(accessId);

  if (hasPhysical && !hasLocal) {
    console.log(`[ORPHAN] AccessID: ${accessId}, Title: ${item.title}, Files: ${assetMap.get(accessId).join(', ')}`);
    orphanCount++;
  }
});

console.log(`\nTotal orphan items found: ${orphanCount}`);
