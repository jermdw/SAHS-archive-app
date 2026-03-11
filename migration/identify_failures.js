// migration/identify_failures.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const EXTERNAL_JSON_PATH = join(__dirname, 'external_documents.json');

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function findFailures() {
  const db = getFirestore('sahs-archives');
  const externalData = JSON.parse(readFileSync(EXTERNAL_JSON_PATH, 'utf8'));
  
  const docSnap = await db.collection('archive_items').where('item_type', '==', 'Document').get();
  const firestoreDocs = docSnap.docs.reduce((acc, doc) => {
      acc[doc.id] = doc.data();
      return acc;
  }, {});
  
  const failedItems = [];
  const missingItems = [];

  for (const extDoc of externalData) {
      const fsDoc = firestoreDocs[extDoc.id];
      if (!fsDoc) {
          missingItems.push(extDoc.title);
          continue;
      }
      
      const expectedImageCount = (extDoc.image_urls || (extDoc.image_url ? [extDoc.image_url] : [])).length;
      if (expectedImageCount > 0 && (!fsDoc.file_urls || fsDoc.file_urls.length === 0)) {
          failedItems.push({
              id: extDoc.id,
              title: extDoc.title,
              expected: expectedImageCount,
              actual: fsDoc.file_urls ? fsDoc.file_urls.length : 0
          });
      }
  }

  console.log(`Summary:`);
  console.log(` - Missing in Firestore: ${missingItems.length}`);
  console.log(` - Documents with 0 images (but expected some): ${failedItems.length}`);
  
  if (failedItems.length > 0) {
      console.log('\nFailed Items:');
      failedItems.forEach(item => {
          console.log(` - [${item.id}] ${item.title} (Expected ${item.expected})`);
      });
  }
}

findFailures().catch(console.error);
