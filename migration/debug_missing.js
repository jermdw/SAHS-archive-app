// migration/debug_missing.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const EXTERNAL_JSON_PATH = join(__dirname, 'external_documents.json');

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function debug() {
  const db = getFirestore('sahs-archives');
  const externalData = JSON.parse(readFileSync(EXTERNAL_JSON_PATH, 'utf8'));
  const externalIds = externalData.map(d => d.id);
  
  console.log(`External documents count: ${externalIds.length}`);
  
  const docSnap = await db.collection('archive_items').where('item_type', '==', 'Document').get();
  const firestoreIds = docSnap.docs.map(doc => doc.id);
  
  console.log(`Firestore 'Document' count: ${firestoreIds.length}`);
  
  const missingInFirestore = externalIds.filter(id => !firestoreIds.includes(id));
  console.log(`Missing in Firestore: ${missingInFirestore.length}`);
  
  if (missingInFirestore.length > 0) {
    console.log('Sample missing IDs:', missingInFirestore.slice(0, 5));
    // Check if they exist with different item_type
    for (const id of missingInFirestore.slice(0, 5)) {
        const doc = await db.collection('archive_items').doc(id).get();
        if (doc.exists) {
            console.log(`ID ${id} exists but item_type is: ${doc.data().item_type}`);
        } else {
            console.log(`ID ${id} does not exist in archive_items collection at all.`);
        }
    }
  }

  // Check generic count in archive_items
  const allSnap = await db.collection('archive_items').get();
   console.log(`Total items in archive_items: ${allSnap.size}`);

  // Check specifically for those 41
  console.log('\nChecking image URLs for a few documents...');
  docSnap.docs.slice(0, 3).forEach(doc => {
      const data = doc.data();
      console.log(`Document: ${data.title}`);
      console.log(` - Featured Image URL: ${data.featured_image_url}`);
      console.log(` - File URLs: ${JSON.stringify(data.file_urls)}`);
  });
}

debug().catch(console.error);
