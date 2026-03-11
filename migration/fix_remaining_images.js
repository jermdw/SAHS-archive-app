// migration/fix_remaining_images.js
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

async function fix() {
  console.log('Targeting remaining orphan images (1-9, 11-14)...');
  const files = readdirSync(ASSETS_DIR);
  const assetMap = new Map();

  files.forEach(file => {
    const match = file.match(/^(\d+)_/);
    if (match) {
      const accessId = match[1];
      if (!assetMap.has(accessId)) assetMap.set(accessId, []);
      assetMap.get(accessId).push(file);
    }
  });

  const targets = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14'];
  
  for (const accessId of targets) {
    console.log(`Checking AccessID: ${accessId}...`);
    const snapshot = await db.collection('archive_items')
      .where('artifact_id', '==', accessId)
      .get();

    if (snapshot.empty) {
      console.log(`  No Firestore record found for AccessID ${accessId}`);
      continue;
    }

    if (!assetMap.has(accessId)) {
      console.log(`  No local asset found for AccessID ${accessId}`);
      continue;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    
    // We force upload even if file_urls exists to ensure correct linking
    const filesToUpload = assetMap.get(accessId);
    const file_urls = [];
    
    console.log(`  Repairing ${data.title}...`);
    for (const fileName of filesToUpload) {
      const filePath = join(ASSETS_DIR, fileName);
      const destination = `archive_media/${Date.now()}_${fileName}`;
      
      console.log(`    Uploading ${fileName}...`);
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
      repair_note: 'Linked orphan images (final fix)'
    });
    
    console.log(`  ✅ Fixed AccessID ${accessId}!`);
  }

  console.log('\nFinal fix complete!');
}

fix().catch(console.error);
