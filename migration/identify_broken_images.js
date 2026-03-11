// migration/identify_broken_images.js
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

const db = getFirestore('sahs-archives'); // Targeting the correct named database

async function identify() {
  console.log('Fetching artifacts from sahs-archives database...');
  const snapshot = await db.collection('archive_items')
    .where('item_type', '==', 'Artifact')
    .get();

  console.log(`Found ${snapshot.size} artifacts. Checking for missing images...`);

  let missingCount = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    const hasImages = data.file_urls && data.file_urls.length > 0;
    const hasFeatured = !!data.featured_image_url;

    if (!hasImages) {
      console.log(`[MISSING IMAGES] ID: ${doc.id}, AccessID: ${data.artifact_id}, Title: ${data.title}`);
      missingCount++;
    } else if (!hasFeatured) {
       console.log(`[MISSING FEATURED] ID: ${doc.id}, AccessID: ${data.artifact_id}, Title: ${data.title}`);
    }
  });

  console.log(`\nTotal artifacts missing images: ${missingCount}`);
}

identify().catch(console.error);
