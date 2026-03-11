// migration/verify_counts.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function verify() {
  const db = getFirestore('sahs-archives');
  
  // Count items with item_type 'Document'
  const docSnap = await db.collection('archive_items').where('item_type', '==', 'Document').get();
  console.log(`Total documents with item_type 'Document': ${docSnap.size}`);
  
  // Count items with 'document' tag
  const tagSnap = await db.collection('archive_items').where('tags', 'array-contains', 'document').get();
  console.log(`Total documents with 'document' tag: ${tagSnap.size}`);
  
  // Sample check for fields
  if (docSnap.size > 0) {
    const sample = docSnap.docs[0].data();
    console.log('\nSample Document Metadata Check:');
    console.log(` - Title: ${sample.title}`);
    console.log(` - Item Type: ${sample.item_type}`);
    console.log(` - Tags: ${JSON.stringify(sample.tags)}`);
    console.log(` - Image Count: ${sample.file_urls.length}`);
    console.log(` - Featured Image: ${sample.featured_image_url ? 'Yes' : 'No'}`);
  }
}

verify().catch(console.error);
