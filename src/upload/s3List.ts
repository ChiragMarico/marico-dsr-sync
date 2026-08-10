/** List objects in S3 under our prefix (ListObjectsV2 via a pre-signed GET). */
import { presignList } from './s3Presign';

export interface S3Object {
  key: string; // full key incl. folder prefix
  size: number;
  lastModified: string;
}

export async function listObjects(relPrefix: string): Promise<S3Object[]> {
  const url = await presignList(relPrefix);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`S3 list failed (${res.status})`);
  const xml = await res.text();
  const out: S3Object[] = [];
  for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '';
    if (!key) continue;
    out.push({
      key: key.replace(/&amp;/g, '&'),
      size: parseInt(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? '0', 10),
      lastModified: block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? '',
    });
  }
  // Newest first.
  return out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
