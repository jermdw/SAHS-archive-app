// migration/repair_images.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const ASSETS_DIR = join(__dirname, 'assets');

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Error: migration/service-account.json not found.');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
});

const db = getFirestore('sahs-archives');
const bucket = admin.storage().bucket();

async function repair() {
  console.log('Scanning assets directory...');
  const files = readdirSync(ASSETS_DIR);
  const assetMap = new Map();

  files.forEach(file => {
    const match = file.match(/^(\d+)_/);
    if (match) {
      const accessId = match[1];
      if (!assetMap.has(accessId)) {
        assetMap.set(accessId, []);
      }
      assetMap.get(accessId).push(file);
    }
  });

  console.log(`Found image mappings for ${assetMap.size} unique AccessIDs.`);

  const snapshot = await db.collection('archive_items')
    .where('item_type', '==', 'Artifact')
    .get();

  console.log(`Checking ${snapshot.size} artifacts in database...`);

  let fixCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const accessId = data.artifact_id;
    
    // Check if this item is missing images but we have them in assets
    if ((!data.file_urls || data.file_urls.length === 0) && assetMap.has(accessId)) {
      console.log(`Repairing ID: ${doc.id}, AccessID: ${accessId}, Title: ${data.title}`);
      
      const filesToUpload = assetMap.get(accessId);
      const file_urls = [];
      
      for (const fileName of filesToUpload) {
        const filePath = join(ASSETS_DIR, fileName);
        const destination = `archive_media/${Date.now()}_${fileName}`;
        
        console.log(`  Uploading ${fileName}...`);
        await bucket.upload(filePath, {
          destination: destination,
          metadata: { contentType: 'image/jpeg' }
        });
        
        const file = bucket.file(destination);
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: '03-09-2491'
        });
        file_urls.push(url);
      }

      await doc.ref.update({
        file_urls: file_urls,
        featured_image_url: file_urls.length > 0 ? file_urls[0] : null,
        updated_at: new Date().toISOString(),
        repair_note: 'Linked orphan images from migration assets'
      });
      
      console.log(`  ✅ Repaired!`);
      fixCount++;
    }
  }

  console.log(`\nRepair complete! Total items fixed: ${fixCount}`);
}

repair().catch(console.error);
