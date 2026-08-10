/**
 * TEMPLATE — copy this file to `s3Config.ts` and fill in real values.
 *
 * `s3Config.ts` is git-ignored on purpose: it holds a live AWS key, and a real
 * key pushed to GitHub can be auto-detected and disabled (which would break the
 * app). Keep the real credentials out of version control.
 *
 * The app embeds this key so it can pre-sign S3 requests on-device with no
 * backend. Before wider distribution: rotate the key and scope it write-only to
 * the `prefix` below.
 */
export const S3 = {
  accessKeyId: 'YOUR_AWS_ACCESS_KEY_ID',
  secretAccessKey: 'YOUR_AWS_SECRET_ACCESS_KEY',
  region: 'ap-south-1',
  bucket: 'your-bucket-name',
  /** Folder prefix inside the bucket that this app owns. */
  prefix: 'marico-dsr/',
};
