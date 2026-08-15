const { Storage } = require('@google-cloud/storage');

// Lazy singleton so this module imports cleanly when GCS_BUCKET is unset —
// local development without Application Default Credentials shouldn't break
// the whole server, only the upload endpoint.
let bucketHandle;

const bucketName = () => process.env.GCS_BUCKET;

const publicBase = () => {
  const explicit = process.env.GCS_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  return `https://storage.googleapis.com/${bucketName()}`;
};

const getBucket = () => {
  const name = bucketName();
  if (!name) {
    const error = new Error('Image storage is not configured');
    error.status = 503;
    throw error;
  }
  // On Cloud Run this resolves to the tl-api-run service account via
  // Application Default Credentials — no key file, no secret.
  if (!bucketHandle) bucketHandle = new Storage().bucket(name);
  return bucketHandle;
};

const isConfigured = () => Boolean(bucketName());

const uploadObject = async (key, buffer, contentType) => {
  await getBucket().file(key).save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' }
  });
  return publicUrl(key);
};

const publicUrl = (key) => `${publicBase()}/${key}`;

/**
 * Object key for a URL we own, or null for anything else.
 *
 * Load-bearing for cleanup: the seeded products carry Unsplash URLs, and
 * deleting one must skip them rather than throwing.
 */
const keyFromUrl = (url) => {
  if (typeof url !== 'string' || !isConfigured()) return null;
  const prefix = `${publicBase()}/`;
  if (!url.startsWith(prefix)) return null;
  const key = decodeURIComponent(url.slice(prefix.length));
  return key || null;
};

const deleteObject = async (key) => {
  await getBucket().file(key).delete({ ignoreNotFound: true });
};

/**
 * Best effort: never let storage cleanup fail the caller's request. A leaked
 * object costs a fraction of a cent; a failed product delete costs the admin
 * their afternoon.
 */
const deleteByUrls = async (urls) => {
  if (!Array.isArray(urls) || !isConfigured()) return;
  await Promise.all(
    urls.map(async (url) => {
      const key = keyFromUrl(url);
      if (!key) return;
      try {
        await deleteObject(key);
      } catch (error) {
        console.error(`Failed to delete object ${key}:`, error.message);
      }
    })
  );
};

module.exports = {
  isConfigured,
  uploadObject,
  publicUrl,
  keyFromUrl,
  deleteObject,
  deleteByUrls
};
