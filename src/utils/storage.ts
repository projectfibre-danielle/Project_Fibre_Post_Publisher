import { DraftPost, GitHubSettings } from '../types/blog';

const SETTINGS_STORAGE_KEY = 'project_fibre_github_settings';
const DRAFT_STORAGE_KEY = 'project_fibre_draft_post';

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  owner: '',
  repo: 'Project_fibre',
  path: 'src/data/posts.json',
  branch: 'main',
  token: '',
  tokenExpiresAt: '',
  tokenNote: '',
};

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createEmptyDraft(): DraftPost {
  return {
    editingId: null,
    title: '',
    slug: '',
    date: getTodayDateString(),
    categoryTags: '',
    summary: '',
    content: '',
    createdAt: null,
  };
}

export function loadGitHubSettings(): GitHubSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GITHUB_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GitHubSettings>;
    return {
      owner: typeof parsed.owner === 'string' ? parsed.owner : '',
      repo: typeof parsed.repo === 'string' && parsed.repo.trim() ? parsed.repo : 'Project_fibre',
      path:
        typeof parsed.path === 'string' && parsed.path.trim()
          ? parsed.path
          : 'src/data/posts.json',
      branch: typeof parsed.branch === 'string' && parsed.branch.trim() ? parsed.branch : 'main',
      token: typeof parsed.token === 'string' ? parsed.token : '',
      tokenExpiresAt: typeof parsed.tokenExpiresAt === 'string' ? parsed.tokenExpiresAt : '',
      tokenNote: typeof parsed.tokenNote === 'string' ? parsed.tokenNote : '',
    };
  } catch {
    return { ...DEFAULT_GITHUB_SETTINGS };
  }
}

export function saveGitHubSettings(settings: GitHubSettings): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadDraftPost(): DraftPost {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return createEmptyDraft();
    const parsed = JSON.parse(raw) as Partial<DraftPost>;
    return {
      editingId: typeof parsed.editingId === 'string' ? parsed.editingId : null,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      date: typeof parsed.date === 'string' && parsed.date ? parsed.date : getTodayDateString(),
      categoryTags: typeof parsed.categoryTags === 'string' ? parsed.categoryTags : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      content: typeof parsed.content === 'string' ? parsed.content : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
      extraFields:
        parsed.extraFields && typeof parsed.extraFields === 'object'
          ? parsed.extraFields
          : undefined,
    };
  } catch {
    return createEmptyDraft();
  }
}

export function saveDraftPost(draft: DraftPost): void {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function parseTagsInput(raw: string): { category: string; tags: string[] } {
  const tags = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    category: tags[0] ?? 'General',
    tags,
  };
}
