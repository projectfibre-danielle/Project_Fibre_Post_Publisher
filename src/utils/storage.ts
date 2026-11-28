import { DraftPost, GitHubSettings, SavedDraft } from '../types/blog';

const SETTINGS_STORAGE_KEY = 'project_fibre_github_settings';
const DRAFT_STORAGE_KEY = 'project_fibre_draft_post';
const SAVED_DRAFTS_STORAGE_KEY = 'project_fibre_saved_drafts';
const REMOVE_DRAFT_ON_PUBLISH_KEY = 'project_fibre_remove_draft_on_publish';

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  owner: '',
  repo: 'Project_fibre',
  path: 'src/data/posts.json',
  branch: 'main',
  draftsBranch: 'drafts',
  draftsPath: 'src/data/drafts.json',
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

export function hasDraftContent(draft: DraftPost): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.summary.trim() ||
      draft.content.trim() ||
      draft.categoryTags.trim()
  );
}

export function createEmptyDraft(): DraftPost {
  return {
    activeDraftId: null,
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
      repo:
        typeof parsed.repo === 'string' && parsed.repo.trim()
          ? parsed.repo
          : 'Project_fibre',
      path:
        typeof parsed.path === 'string' && parsed.path.trim()
          ? parsed.path
          : 'src/data/posts.json',
      branch:
        typeof parsed.branch === 'string' && parsed.branch.trim()
          ? parsed.branch
          : 'main',
      draftsBranch:
        typeof parsed.draftsBranch === 'string' && parsed.draftsBranch.trim()
          ? parsed.draftsBranch
          : 'drafts',
      draftsPath:
        typeof parsed.draftsPath === 'string' && parsed.draftsPath.trim()
          ? parsed.draftsPath
          : 'src/data/drafts.json',
      token: typeof parsed.token === 'string' ? parsed.token : '',
      tokenExpiresAt:
        typeof parsed.tokenExpiresAt === 'string' ? parsed.tokenExpiresAt : '',
      tokenNote: typeof parsed.tokenNote === 'string' ? parsed.tokenNote : '',
    };
  } catch {
    return { ...DEFAULT_GITHUB_SETTINGS };
  }
}

export function saveGitHubSettings(settings: GitHubSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadDraftPost(): DraftPost {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return createEmptyDraft();
    const parsed = JSON.parse(raw) as Partial<DraftPost>;
    return {
      activeDraftId:
        typeof parsed.activeDraftId === 'string' ? parsed.activeDraftId : null,
      editingId: typeof parsed.editingId === 'string' ? parsed.editingId : null,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      date:
        typeof parsed.date === 'string' && parsed.date
          ? parsed.date
          : getTodayDateString(),
      categoryTags:
        typeof parsed.categoryTags === 'string' ? parsed.categoryTags : '',
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
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedDrafts(): SavedDraft[] {
  try {
    const raw = window.localStorage.getItem(SAVED_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedDraft => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        draftId:
          typeof item.draftId === 'string' && item.draftId
            ? item.draftId
            : `draft-${Date.now()}`,
        activeDraftId:
          typeof item.draftId === 'string' ? item.draftId : null,
        editingId: typeof item.editingId === 'string' ? item.editingId : null,
        title: typeof item.title === 'string' ? item.title : '',
        slug: typeof item.slug === 'string' ? item.slug : '',
        date:
          typeof item.date === 'string' && item.date
            ? item.date
            : getTodayDateString(),
        categoryTags:
          typeof item.categoryTags === 'string' ? item.categoryTags : '',
        summary: typeof item.summary === 'string' ? item.summary : '',
        content: typeof item.content === 'string' ? item.content : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
        savedAt:
          typeof item.savedAt === 'string'
            ? item.savedAt
            : new Date().toISOString(),
        publishedAt:
          typeof item.publishedAt === 'string' ? item.publishedAt : null,
        syncedAt:
          typeof item.syncedAt === 'string' ? item.syncedAt : null,
        extraFields:
          item.extraFields && typeof item.extraFields === 'object'
            ? item.extraFields
            : undefined,
      }));
  } catch {
    return [];
  }
}

export function persistSavedDrafts(drafts: SavedDraft[]): void {
  try {
    window.localStorage.setItem(SAVED_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertSavedDraft(
  draft: DraftPost,
  options?: { syncedAt?: string | null }
): {
  drafts: SavedDraft[];
  saved: SavedDraft;
} {
  const existing = loadSavedDrafts();
  const targetId =
    draft.activeDraftId ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const nowIso = new Date().toISOString();

  const existingItem = existing.find((item) => item.draftId === targetId);
  const saved: SavedDraft = {
    draftId: targetId,
    activeDraftId: targetId,
    editingId: draft.editingId,
    title: draft.title,
    slug: draft.slug,
    date: draft.date,
    categoryTags: draft.categoryTags,
    summary: draft.summary,
    content: draft.content,
    createdAt: draft.createdAt,
    extraFields: draft.extraFields,
    savedAt: nowIso,
    publishedAt: existingItem?.publishedAt ?? null,
    syncedAt:
      options && 'syncedAt' in options
        ? options.syncedAt ?? null
        : existingItem?.syncedAt ?? null,
  };

  const next = existingItem
    ? existing.map((item) => (item.draftId === targetId ? saved : item))
    : [saved, ...existing];

  persistSavedDrafts(next);
  return { drafts: next, saved };
}

export function deleteSavedDraftById(draftId: string): SavedDraft[] {
  const existing = loadSavedDrafts();
  const next = existing.filter((item) => item.draftId !== draftId);
  persistSavedDrafts(next);
  return next;
}

export function markSavedDraftPublished(
  draftId: string,
  publishedPostId: string
): SavedDraft[] {
  const existing = loadSavedDrafts();
  const nowIso = new Date().toISOString();
  const next = existing.map((item) =>
    item.draftId === draftId
      ? {
          ...item,
          editingId: publishedPostId,
          publishedAt: nowIso,
        }
      : item
  );
  persistSavedDrafts(next);
  return next;
}

export function markSavedDraftSynced(
  draftId: string,
  syncedAtIso?: string
): SavedDraft[] {
  const existing = loadSavedDrafts();
  const stamp = syncedAtIso || new Date().toISOString();
  const next = existing.map((item) =>
    item.draftId === draftId
      ? {
          ...item,
          syncedAt: stamp,
        }
      : item
  );
  persistSavedDrafts(next);
  return next;
}

export function mergeSavedDraftLists(
  localDrafts: SavedDraft[],
  remoteDrafts: SavedDraft[],
  remoteBranchExists: boolean,
  activeDraftId?: string | null
): SavedDraft[] {
  const remoteMap = new Map<string, SavedDraft>();
  for (const r of remoteDrafts) {
    remoteMap.set(r.draftId, {
      ...r,
      syncedAt: r.syncedAt || r.savedAt,
    });
  }

  const mergedMap = new Map<string, SavedDraft>();

  for (const l of localDrafts) {
    const r = remoteMap.get(l.draftId);
    if (r) {
      const lTime = Date.parse(l.savedAt) || 0;
      const rTime = Date.parse(r.savedAt) || 0;
      mergedMap.set(l.draftId, rTime >= lTime ? r : l);
      remoteMap.delete(l.draftId);
    } else {
      const wasPreviouslySynced = Boolean(l.syncedAt);
      const hasUnsyncedLocalEdits =
        l.draftId === activeDraftId &&
        wasPreviouslySynced &&
        (Date.parse(l.savedAt) || 0) > (Date.parse(l.syncedAt || '') || 0);

      // If remote branch exists, previously-synced drafts missing from remote were deleted on another device
      if (!remoteBranchExists || !wasPreviouslySynced || hasUnsyncedLocalEdits) {
        mergedMap.set(l.draftId, l);
      }
    }
  }

  for (const r of remoteMap.values()) {
    mergedMap.set(r.draftId, r);
  }

  const merged = Array.from(mergedMap.values()).sort(
    (a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0)
  );

  persistSavedDrafts(merged);
  return merged;
}

export function loadRemoveDraftOnPublishPref(): boolean {
  try {
    return window.localStorage.getItem(REMOVE_DRAFT_ON_PUBLISH_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveRemoveDraftOnPublishPref(removeOnPublish: boolean): void {
  window.localStorage.setItem(
    REMOVE_DRAFT_ON_PUBLISH_KEY,
    removeOnPublish ? 'true' : 'false'
  );
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
