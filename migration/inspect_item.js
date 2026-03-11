// migration/inspect_item.js
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

async function inspect() {
  const db = getFirestore('sahs-archives');
  const snap = await db.collection('archive_items').limit(1).get();
  
  if (snap.empty) {
    console.log('No documents found in sahs-archives collection archive_items');
  } else {
    snap.forEach(doc => {
      console.log('Sample Document:', JSON.stringify(doc.data(), null, 2));
    });
  }
}

inspect().catch(console.error);
