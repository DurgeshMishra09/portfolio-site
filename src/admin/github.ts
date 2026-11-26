/**
 * Tiny GitHub "contents" API client used by the owner editor.
 * Every request needs the owner's personal access token, which lives only in the
 * owner's browser. Without it nothing can be read for editing or written back.
 */
export type Creds = { repo: string; branch: string; token: string };

const API = 'https://api.github.com';

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fail(res: Response): Promise<never> {
  let detail = '';
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ?? '';
  } catch {
    /* body was not JSON */
  }
  if (res.status === 401) throw new Error('GitHub rejected the token (401). Check that it is correct and not expired.');
  if (res.status === 403) throw new Error(`GitHub refused access (403). ${detail}`.trim());
  if (res.status === 404) throw new Error('Not found (404). Check the repository name, branch and token permissions.');
  if (res.status === 409 || res.status === 422) throw new Error('The file changed on GitHub since you opened the editor. Close and reopen it, then redo your last change.');
  throw new Error(`GitHub error ${res.status}. ${detail}`.trim());
}

export function utf8ToB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

export function bytesToB64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Confirms the token can reach the repository. Returns false only when GitHub says it cannot push. */
export async function checkAccess(c: Creds): Promise<void> {
  const res = await fetch(`${API}/repos/${c.repo}`, { headers: headers(c.token) });
  if (!res.ok) return fail(res);
  const j = (await res.json()) as { permissions?: { push?: boolean } };
  if (j.permissions && j.permissions.push === false) {
    throw new Error('This token can read the repository but cannot write to it. Give it "Contents: Read and write".');
  }
}

export async function readText(c: Creds, path: string): Promise<{ sha: string; text: string }> {
  const res = await fetch(`${API}/repos/${c.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(c.branch)}`, {
    headers: headers(c.token),
    cache: 'no-store',
  });
  if (!res.ok) return fail(res);
  const j = (await res.json()) as { sha: string; content?: string };
  return { sha: j.sha, text: b64ToUtf8(j.content ?? '') };
}

async function getSha(c: Creds, path: string): Promise<string | undefined> {
  const res = await fetch(`${API}/repos/${c.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(c.branch)}`, {
    headers: headers(c.token),
    cache: 'no-store',
  });
  if (res.status === 404) return undefined;
  if (!res.ok) return fail(res);
  const j = (await res.json()) as { sha?: string };
  return j.sha;
}

/** Creates or replaces a file. Pass `sha` when you already know it; otherwise it is looked up. Returns the new sha. */
export async function writeFile(c: Creds, path: string, contentB64: string, message: string, sha?: string): Promise<string> {
  const currentSha = sha ?? (await getSha(c, path));
  const res = await fetch(`${API}/repos/${c.repo}/contents/${encPath(path)}`, {
    method: 'PUT',
    headers: { ...headers(c.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: contentB64, branch: c.branch, ...(currentSha ? { sha: currentSha } : {}) }),
  });
  if (!res.ok) return fail(res);
  const j = (await res.json()) as { content?: { sha?: string } };
  return j.content?.sha ?? '';
}
