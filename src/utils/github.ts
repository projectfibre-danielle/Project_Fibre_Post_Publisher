import { BlogPost, DraftPost, GitHubSettings } from '../types/blog';
import { parseTagsInput, slugify } from './storage';

export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly isAuthError: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
  }
}

export function base64ToUtf8(base64: string): string {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function encodeRepoPath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function validateSettings(settings: GitHubSettings): void {
  if (!settings.owner.trim()) {
    throw new GitHubApiError('GitHub Owner / Username is required in Settings.', 400);
  }
  if (!settings.repo.trim()) {
    throw new GitHubApiError('Repository Name is required in Settings.', 400);
  }
  if (!settings.path.trim()) {
    throw new GitHubApiError('File Path is required in Settings.', 400);
  }
  if (!settings.branch.trim()) {
    throw new GitHubApiError('Branch is required in Settings.', 400);
  }
  if (!settings.token.trim()) {
    throw new GitHubApiError(
      'GitHub Personal Access Token is missing. Open Settings to paste your token.',
      401
    );
  }
}

async function parseGitHubError(response: Response, fallback: string): Promise<GitHubApiError> {
  let apiMessage = fallback;
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) {
      apiMessage = data.message;
    }
  } catch {
    // Keep fallback message
  }
  return new GitHubApiError(apiMessage, response.status);
}

function normalizePostRecord(raw: unknown, index: number): BlogPost {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = typeof item.title === 'string' ? item.title : `Untitled Post ${index + 1}`;
  const tags = Array.isArray(item.tags)
    ? item.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : typeof item.category === 'string' && item.category.trim()
      ? [item.category.trim()]
      : [];
  const category =
    typeof item.category === 'string' && item.category.trim()
      ? item.category.trim()
      : tags[0] ?? 'General';
  const excerpt =
    typeof item.excerpt === 'string'
      ? item.excerpt
      : typeof item.summary === 'string'
        ? item.summary
        : '';
  const content =
    typeof item.content === 'string'
      ? item.content
      : typeof item.body === 'string'
        ? item.body
        : typeof item.markdown === 'string'
          ? item.markdown
          : '';
  const date = typeof item.date === 'string' && item.date ? item.date : '';
  const id =
    typeof item.id === 'string' && item.id
      ? item.id
      : typeof item.id === 'number'
        ? String(item.id)
        : `${slugify(title) || 'post'}-${index}`;
  const slug =
    typeof item.slug === 'string' && item.slug
      ? item.slug
      : slugify(title) || `post-${index}`;
  const createdAt =
    typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString();
  const updatedAt =
    typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;

  return {
    ...item,
    id,
    slug,
    title,
    date,
    category,
    tags,
    excerpt,
    content,
    createdAt,
    updatedAt,
  };
}

export interface FetchPostsResult {
  posts: BlogPost[];
  sha: string;
  htmlUrl?: string;
}

export async function fetchPostsFromGitHub(
  settings: GitHubSettings
): Promise<FetchPostsResult> {
  validateSettings(settings);

  const owner = encodeURIComponent(settings.owner.trim());
  const repo = encodeURIComponent(settings.repo.trim());
  const path = encodeRepoPath(settings.path.trim());
  const branch = encodeURIComponent(settings.branch.trim());
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(settings.token),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseGitHubError(
      response,
      `Failed to fetch ${settings.path} (HTTP ${response.status}).`
    );
  }

  const data = (await response.json()) as {
    content?: string;
    encoding?: string;
    sha?: string;
    html_url?: string;
  };

  if (!data.sha) {
    throw new GitHubApiError('GitHub response did not include a file SHA.', 500);
  }

  if (!data.content) {
    return { posts: [], sha: data.sha, htmlUrl: data.html_url };
  }

  const decodedText = base64ToUtf8(data.content);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decodedText.trim() || '[]');
  } catch {
    throw new GitHubApiError(
      `${settings.path} does not contain valid JSON. Please check the file on GitHub.`,
      422
    );
  }

  if (!Array.isArray(parsedJson)) {
    throw new GitHubApiError(
      `${settings.path} must contain a JSON array of posts.`,
      422
    );
  }

  const posts = parsedJson.map((item, idx) => normalizePostRecord(item, idx));
  return {
    posts,
    sha: data.sha,
    htmlUrl: data.html_url,
  };
}

export interface CommitResult {
  sha: string;
  commitSha: string;
  commitUrl?: string;
  htmlUrl?: string;
  posts: BlogPost[];
}

export async function commitPostsToGitHub(
  settings: GitHubSettings,
  posts: BlogPost[],
  sha: string | null,
  commitMessage: string
): Promise<CommitResult> {
  validateSettings(settings);

  const owner = encodeURIComponent(settings.owner.trim());
  const repo = encodeURIComponent(settings.repo.trim());
  const path = encodeRepoPath(settings.path.trim());
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const serializedJson = JSON.stringify(posts, null, 2) + '\n';
  const encodedContent = utf8ToBase64(serializedJson);

  const body: Record<string, string> = {
    message: commitMessage,
    content: encodedContent,
    branch: settings.branch.trim(),
  };
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...buildHeaders(settings.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseGitHubError(
      response,
      `Failed to commit changes to ${settings.path} (HTTP ${response.status}).`
    );
  }

  const result = (await response.json()) as {
    content?: { sha?: string; html_url?: string };
    commit?: { sha?: string; html_url?: string };
  };

  return {
    sha: result.content?.sha ?? sha ?? '',
    commitSha: result.commit?.sha ?? '',
    commitUrl: result.commit?.html_url,
    htmlUrl: result.content?.html_url,
    posts,
  };
}

export async function publishPostToGitHub(
  settings: GitHubSettings,
  draft: DraftPost,
  onProgress: (step: string) => void
): Promise<{ result: CommitResult; savedPost: BlogPost; wasUpdate: boolean }> {
  validateSettings(settings);

  const title = draft.title.trim();
  if (!title) {
    throw new GitHubApiError('Please enter a Post Title before publishing.', 400);
  }
  if (!draft.content.trim()) {
    throw new GitHubApiError('Please write some post content before publishing.', 400);
  }

  onProgress(`Fetching ${settings.path} from ${settings.owner}/${settings.repo} (${settings.branch})...`);

  let existingPosts: BlogPost[] = [];
  let currentSha: string | null = null;

  try {
    const fetched = await fetchPostsFromGitHub(settings);
    existingPosts = fetched.posts;
    currentSha = fetched.sha;
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      // Allow initializing a brand-new posts.json file if it does not exist yet
      existingPosts = [];
      currentSha = null;
    } else {
      throw err;
    }
  }

  onProgress('Preparing UTF-8 JSON payload...');

  const nowIso = new Date().toISOString();
  const { category, tags } = parseTagsInput(draft.categoryTags);
  const resolvedSlug = slugify(draft.slug.trim() || title) || `post-${Date.now()}`;

  const existingIndex = draft.editingId
    ? existingPosts.findIndex((p) => p.id === draft.editingId)
    : -1;

  const wasUpdate = existingIndex !== -1;

  const savedPost: BlogPost = {
    ...(draft.extraFields ?? {}),
    id: draft.editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `post-${Date.now()}`),
    slug: resolvedSlug,
    title,
    date: draft.date || new Date().toISOString().slice(0, 10),
    category,
    tags,
    excerpt: draft.summary.trim(),
    content: draft.content.trim(),
    createdAt:
      (wasUpdate ? existingPosts[existingIndex].createdAt : draft.createdAt) ||
      nowIso,
    updatedAt: nowIso,
  };

  const nextPosts = wasUpdate
    ? existingPosts.map((post, idx) => (idx === existingIndex ? savedPost : post))
    : [savedPost, ...existingPosts];

  const commitMessage = `Publish post: ${title}`;
  onProgress(`Committing "${commitMessage}" to GitHub...`);

  const result = await commitPostsToGitHub(
    settings,
    nextPosts,
    currentSha,
    commitMessage
  );

  return { result, savedPost, wasUpdate };
}

export async function deletePostFromGitHub(
  settings: GitHubSettings,
  postId: string,
  postTitle: string,
  onProgress: (step: string) => void
): Promise<CommitResult> {
  validateSettings(settings);

  onProgress(`Fetching latest ${settings.path} before deleting...`);
  const { posts, sha } = await fetchPostsFromGitHub(settings);

  const filtered = posts.filter((post) => post.id !== postId);
  if (filtered.length === posts.length) {
    throw new GitHubApiError(`Post "${postTitle}" was not found in ${settings.path}.`, 404);
  }

  const commitMessage = `Delete post: ${postTitle}`;
  onProgress(`Committing "${commitMessage}" to GitHub...`);

  return commitPostsToGitHub(settings, filtered, sha, commitMessage);
}

export async function testGitHubConnection(
  settings: GitHubSettings
): Promise<{ postCount: number; fileExists: boolean }> {
  validateSettings(settings);

  try {
    const { posts } = await fetchPostsFromGitHub(settings);
    return { postCount: posts.length, fileExists: true };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      // Check if the repo itself is accessible
      const owner = encodeURIComponent(settings.owner.trim());
      const repo = encodeURIComponent(settings.repo.trim());
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'GET',
        headers: buildHeaders(settings.token),
        cache: 'no-store',
      });
      if (!repoRes.ok) {
        throw await parseGitHubError(
          repoRes,
          `Unable to access repository ${settings.owner}/${settings.repo}.`
        );
      }
      return { postCount: 0, fileExists: false };
    }
    throw err;
  }
}
