// migration/migrate_external.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');
const EXTERNAL_JSON_PATH = join(__dirname, 'external_documents.json');

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

async function downloadAndUpload(url, title, index, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`    [Attempt ${attempt}] Fetching: ${url}`);
      const response = await fetch(url, { timeout: 15000 }); // 15s timeout
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const buffer = await response.buffer();
      
      const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
      const extension = (url.split('.').pop().split('?')[0] || 'png').toLowerCase();
      const destination = `archive_media/${Date.now()}_${safeTitle}_${index}.${extension}`;
      
      const file = bucket.file(destination);
      await file.save(buffer, {
        metadata: { contentType: response.headers.get('content-type') || 'image/png' },
        resumable: false // Better for small/medium files to avoid resumable upload overhead
      });
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491'
      });
      
      return signedUrl;
    } catch (error) {
      console.warn(`    ⚠️ Attempt ${attempt} failed for ${url}: ${error.message}`);
      if (attempt === retries) return null;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
    }
  }
}

async function migrate() {
  const documents = JSON.parse(readFileSync(EXTERNAL_JSON_PATH, 'utf8'));
  console.log(`Starting migration/repair of ${documents.length} external documents...`);

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    try {
      // Check if already has images
      const existingDoc = await db.collection('archive_items').doc(doc.id).get();
      if (existingDoc.exists) {
          const data = existingDoc.data();
          if (data.file_urls && data.file_urls.length > 0) {
              console.log(`[${i + 1}/${documents.length}] Skipping (already has images): ${doc.title}`);
              continue;
          }
      }

      console.log(`[${i + 1}/${documents.length}] Processing: ${doc.title}`);
      
      const imageUrls = doc.image_urls || (doc.image_url ? [doc.image_url] : []);
      const newFileUrls = [];
      
      for (let j = 0; j < imageUrls.length; j++) {
        const url = imageUrls[j];
        console.log(`  Uploading image ${j + 1}/${imageUrls.length}...`);
        const newUrl = await downloadAndUpload(url, doc.title, j);
        if (newUrl) newFileUrls.push(newUrl);
      }

      const dateStr = doc.document_date || '';
      const finalDate = doc.date_is_circa ? `circa ${dateStr}` : dateStr;

      const tags = new Set([
        ...(doc.tags || []),
        doc.category,
        'document'
      ].filter(t => t && t.trim() !== '').map(t => t.toLowerCase()));

      const archiveItem = {
        item_type: 'Document',
        title: doc.title || 'Untitled Document',
        description: doc.description || '',
        date: finalDate,
        museum_location: doc.location || '',
        artifact_type: doc.category || '',
        tags: Array.from(tags),
        file_urls: newFileUrls,
        featured_image_url: newFileUrls.length > 0 ? newFileUrls[0] : null,
        created_at: existingDoc.exists ? (existingDoc.data().created_at || new Date().toISOString()) : new Date().toISOString(),
        archive_reference: doc.archive_reference || '',
        artifact_id: doc.id || `ext_${Date.now()}_${i}`,
        notes: doc.transcription || '',
        filing_code: doc.filing_code || '',
        id: doc.id
      };

      await db.collection('archive_items').doc(doc.id).set(archiveItem);
      console.log(`  ✅ Successfully updated: ${doc.title} with ${newFileUrls.length} images`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate ${doc.title}:`, error.message);
    }
  }
  console.log('Migration repair complete!');
}

migrate().catch(console.error);
