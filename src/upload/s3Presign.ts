/**
 * Client-side AWS Signature V4 pre-signed URL generator (pure JS, RN-safe).
 *
 * Lets the app talk to S3 with no backend: sign a URL on-device with the
 * embedded key, then PUT/GET it. Uses js-sha256 (a single-file, dependency-free
 * SHA-256 + HMAC implementation) so it bundles cleanly in React Native and ships
 * as an over-the-air update, not a reinstall.
 */
import { sha256 } from 'js-sha256';
import { S3 } from '../config/s3Config';

function hmac(key: string | Uint8Array, data: string): Uint8Array {
  return new Uint8Array(sha256.hmac.arrayBuffer(key, data));
}

/** AWS-flavoured URI encoding (RFC 3986; optionally keep '/'). */
function uriEncode(str: string, encodeSlash = true): string {
  const enc = encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return encodeSlash ? enc : enc.replace(/%2F/g, '/');
}

function encodeKeyPath(key: string): string {
  return (
    '/' +
    key
      .split('/')
      .map((seg) => uriEncode(seg, true))
      .join('/')
  );
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** Core: sign a request for `canonicalUri` with any extra query params. */
function sign(
  method: string,
  canonicalUri: string,
  extraQuery: Record<string, string>,
  expiresSeconds: number,
): string {
  const host = `${S3.bucket}.s3.${S3.region}.amazonaws.com`;
  const { amzDate, dateStamp } = amzDates(new Date());
  const scope = `${dateStamp}/${S3.region}/s3/aws4_request`;

  const query: Record<string, string> = {
    ...extraQuery,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${S3.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac('AWS4' + S3.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, S3.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = sha256.hmac(kSigning, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Pre-sign an object under our folder prefix. `objectKey` is relative. */
export function presignS3Url(
  objectKey: string,
  method: 'PUT' | 'GET' | 'DELETE',
  expiresSeconds = 900,
): string {
  const fullKey = S3.prefix + objectKey.replace(/^\/+/, '');
  return sign(method, encodeKeyPath(fullKey), {}, expiresSeconds);
}

/** Pre-sign a request for a key that already includes the folder prefix. */
export function presignFullKey(
  fullKey: string,
  method: 'GET' | 'DELETE' = 'GET',
  expiresSeconds = 3600,
): string {
  return sign(method, encodeKeyPath(fullKey), {}, expiresSeconds);
}

/** Pre-sign a ListObjectsV2 request for everything under `relPrefix`. */
export function presignList(relPrefix: string, expiresSeconds = 300): string {
  return sign('GET', '/', { 'list-type': '2', prefix: S3.prefix + relPrefix }, expiresSeconds);
}
