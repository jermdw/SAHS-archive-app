// migration/check_specific_ids.js
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

const db = getFirestore('sahs-archives');

const checkIds = ['95', '149', '303', '312', '313', '314', '316', '317', '318', '319', '321', '1055'];

async function check() {
  for (const id of checkIds) {
    const snapshot = await db.collection('archive_items')
      .where('artifact_id', '==', id)
      .get();
    
    if (snapshot.empty) {
      console.log(`ID ${id}: NOT FOUND in database`);
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`ID ${id}: Found! Type: ${data.item_type}, Files: ${data.file_urls?.length || 0}`);
      });
    }
  }
}

check().catch(console.error);
