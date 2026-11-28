export interface GitHubSettings {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  draftsBranch: string;
  draftsPath: string;
  token: string;
  tokenExpiresAt: string;
  tokenNote: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  content: string;
  category?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DraftPost {
  activeDraftId?: string | null;
  editingId: string | null;
  title: string;
  slug: string;
  date: string;
  categoryTags: string;
  summary: string;
  content: string;
  createdAt: string | null;
  extraFields?: Record<string, unknown>;
}

export interface SavedDraft extends DraftPost {
  draftId: string;
  savedAt: string;
  publishedAt?: string | null;
  syncedAt?: string | null;
}

export type PublishStatusType =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'auth_error';

export interface PublishStatus {
  type: PublishStatusType;
  title: string;
  message: string;
  httpStatus?: number;
  commitSha?: string;
  commitUrl?: string;
}
