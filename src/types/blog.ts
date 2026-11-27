export interface GitHubSettings {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
  tokenExpiresAt: string;
  tokenNote: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  date: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface DraftPost {
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
