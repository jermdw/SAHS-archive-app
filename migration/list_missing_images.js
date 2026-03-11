// migration/list_missing_images.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Error: migration/service-account.json not found.');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore('sahs-archives');

async function listMissing() {
  console.log('Fetching artifacts from sahs-archives database...');
  const snapshot = await db.collection('archive_items')
    .where('item_type', '==', 'Artifact')
    .get();

  const missing = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.file_urls || data.file_urls.length === 0) {
      missing.push({
        id: data.artifact_id || 'N/A',
        title: data.title
      });
    }
  });

  // Sort numerically
  missing.sort((a, b) => {
    const numA = parseInt(a.id, 10);
    const numB = parseInt(b.id, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.id.localeCompare(b.id);
  });

  console.log('\n--- Artifacts Missing Photos ---\n');
  missing.forEach(item => {
    console.log(`${item.id.padEnd(8)} | ${item.title}`);
  });
  console.log(`\nTotal missing: ${missing.length}`);
}

listMissing().catch(console.error);
