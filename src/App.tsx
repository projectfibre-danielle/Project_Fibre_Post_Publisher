import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Columns2, Eye, PenLine, RotateCcw, Send } from 'lucide-react';
import { DraftsDrawer } from './components/DraftsDrawer';
import { MarkdownPreview } from './components/MarkdownPreview';
import { PostsManagerDrawer } from './components/PostsManagerDrawer';
import { EditorMode, RichTextEditor } from './components/RichTextEditor';
import { SettingsModal } from './components/SettingsModal';
import { StatusBanner } from './components/StatusBanner';
import {
  BlogPost,
  DraftPost,
  GitHubSettings,
  PublishStatus,
  SavedDraft,
} from './types/blog';
import {
  deleteDraftFromGitHub,
  deletePostFromGitHub,
  fetchPostsFromGitHub,
  GitHubApiError,
  publishPostToGitHub,
  syncDraftsWithGitHub,
  upsertDraftToGitHub,
} from './utils/github';
import {
  createEmptyDraft,
  deleteSavedDraftById,
  hasDraftContent,
  loadDraftPost,
  loadGitHubSettings,
  loadRemoveDraftOnPublishPref,
  loadSavedDrafts,
  markSavedDraftPublished,
  markSavedDraftSynced,
  saveDraftPost,
  saveGitHubSettings,
  saveRemoveDraftOnPublishPref,
  slugify,
  upsertSavedDraft,
} from './utils/storage';

type WorkspacePane = 'split' | 'editor' | 'preview';

function getRemoteSnapshotKey(draft: DraftPost): string {
  return JSON.stringify({
    editingId: draft.editingId,
    title: draft.title,
    slug: draft.slug,
    date: draft.date,
    categoryTags: draft.categoryTags,
    summary: draft.summary,
    content: draft.content,
  });
}

export default function App() {
  const [settings, setSettings] = useState<GitHubSettings>(() =>
    loadGitHubSettings()
  );

  // Recover any pre-existing unsaved draft into multi-draft storage on initial load
  const initialBootstrap = useMemo(() => {
    const initialDraft = loadDraftPost();
    if (
      hasDraftContent(initialDraft) &&
      !initialDraft.editingId &&
      !initialDraft.activeDraftId
    ) {
      const { drafts, saved } = upsertSavedDraft(initialDraft);
      const linkedDraft: DraftPost = {
        ...initialDraft,
        activeDraftId: saved.draftId,
      };
      saveDraftPost(linkedDraft);
      return { draft: linkedDraft, savedDrafts: drafts };
    }
    return { draft: initialDraft, savedDrafts: loadSavedDrafts() };
  }, []);

  const [draft, setDraft] = useState<DraftPost>(() => initialBootstrap.draft);
  const [slugTouched, setSlugTouched] = useState<boolean>(() => {
    const initial = initialBootstrap.draft;
    return Boolean(initial.slug && initial.slug !== slugify(initial.title));
  });

  const [editorMode, setEditorMode] = useState<EditorMode>('rich');
  const [workspacePane, setWorkspacePane] = useState<WorkspacePane>('split');
  const [syncVersion, setSyncVersion] = useState<number>(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [postsDrawerOpen, setPostsDrawerOpen] = useState(false);
  const [draftsDrawerOpen, setDraftsDrawerOpen] = useState(false);

  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>(
    () => initialBootstrap.savedDrafts
  );
  const [removeDraftOnPublish, setRemoveDraftOnPublish] = useState<boolean>(() =>
    loadRemoveDraftOnPublishPref()
  );

  const [remotePosts, setRemotePosts] = useState<BlogPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [hasLoadedPosts, setHasLoadedPosts] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [savingDraftRemote, setSavingDraftRemote] = useState(false);
  const [syncingDrafts, setSyncingDrafts] = useState(false);
  const [status, setStatus] = useState<PublishStatus>({
    type: 'idle',
    title: '',
    message: '',
  });

  const latestDraftRef = useRef<DraftPost>(draft);
  latestDraftRef.current = draft;
  const autoSaveTimerRef = useRef<number | null>(null);
  const suppressAutoSaveRef = useRef<boolean>(false);
  const loadedRemoteSnapshotRef = useRef<string | null>(
    draft.editingId && !draft.activeDraftId ? getRemoteSnapshotKey(draft) : null
  );

  const shouldAutoSaveDraft = useCallback((target: DraftPost): boolean => {
    if (suppressAutoSaveRef.current) return false;
    if (!hasDraftContent(target)) return false;
    if (
      target.editingId &&
      !target.activeDraftId &&
      loadedRemoteSnapshotRef.current === getRemoteSnapshotKey(target)
    ) {
      return false;
    }
    return true;
  }, []);

  const flushDraftToSavedList = useCallback(
    (target: DraftPost): SavedDraft | null => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (!shouldAutoSaveDraft(target)) return null;
      const { drafts, saved } = upsertSavedDraft(target);
      setSavedDrafts(drafts);
      return saved;
    },
    [shouldAutoSaveDraft]
  );

  const updateDraft = useCallback(
    (updater: (prev: DraftPost) => DraftPost) => {
      suppressAutoSaveRef.current = false;
      setDraft(updater);
    },
    []
  );

  // Persist active draft buffer immediately and auto-save into multi-draft storage
  useEffect(() => {
    saveDraftPost(draft);

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!shouldAutoSaveDraft(draft)) return;

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      const current = latestDraftRef.current;
      if (!shouldAutoSaveDraft(current)) return;
      const { drafts, saved } = upsertSavedDraft(current);
      setSavedDrafts(drafts);
      if (!current.activeDraftId) {
        setDraft((prev) =>
          prev.activeDraftId ? prev : { ...prev, activeDraftId: saved.draftId }
        );
      }
    }, 350);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [draft, shouldAutoSaveDraft]);

  // Flush pending draft edits if the browser tab is closed or refreshed
  useEffect(() => {
    const handleBeforeUnload = () => {
      const current = latestDraftRef.current;
      saveDraftPost(current);
      if (shouldAutoSaveDraft(current)) {
        const { saved } = upsertSavedDraft(current);
        if (!current.activeDraftId) {
          saveDraftPost({ ...current, activeDraftId: saved.draftId });
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [shouldAutoSaveDraft]);

  const syncRemoteDrafts = useCallback(
    async (
      targetSettings: GitHubSettings,
      options?: { showFeedback?: boolean }
    ) => {
      if (!targetSettings.owner.trim() || !targetSettings.token.trim()) return;
      setSyncingDrafts(true);
      try {
        const { drafts } = await syncDraftsWithGitHub(
          targetSettings,
          loadSavedDrafts(),
          latestDraftRef.current.activeDraftId
        );
        setSavedDrafts(drafts);
        if (options?.showFeedback) {
          const branchName = targetSettings.draftsBranch?.trim() || 'drafts';
          setStatus({
            type: 'success',
            title: `Synced ${drafts.length} draft${drafts.length === 1 ? '' : 's'} with GitHub`,
            message: `Loaded and merged drafts from "${branchName}" branch (${targetSettings.draftsPath || 'src/data/drafts.json'}).`,
          });
        }
      } catch (err) {
        if (err instanceof GitHubApiError && err.isAuthError) {
          setStatus({
            type: 'auth_error',
            title:
              err.status === 401
                ? 'GitHub Token Unauthorized or Expired'
                : 'GitHub Access Forbidden or Missing Scope',
            message: err.message,
            httpStatus: err.status,
          });
        } else if (options?.showFeedback) {
          setStatus({
            type: 'error',
            title: 'Could not sync drafts with GitHub',
            message:
              err instanceof Error
                ? err.message
                : 'Network error while syncing drafts branch.',
          });
        }
      } finally {
        setSyncingDrafts(false);
      }
    },
    []
  );

  // Sync drafts from the GitHub drafts branch once on startup when configured
  const didInitialDraftSyncRef = useRef(false);
  useEffect(() => {
    if (didInitialDraftSyncRef.current) return;
    didInitialDraftSyncRef.current = true;
    if (settings.owner.trim() && settings.token.trim()) {
      void syncRemoteDrafts(settings, { showFeedback: false });
    }
  }, [settings, syncRemoteDrafts]);

  const handleSaveSettings = (next: GitHubSettings) => {
    setSettings(next);
    saveGitHubSettings(next);
    if (next.owner.trim() && next.token.trim()) {
      void syncRemoteDrafts(next, { showFeedback: false });
    }
  };

  const handleAuthError = (httpStatus: number, detail: string) => {
    setStatus({
      type: 'auth_error',
      title:
        httpStatus === 401
          ? 'GitHub Token Unauthorized or Expired'
          : 'GitHub Access Forbidden or Missing Scope',
      message: detail,
      httpStatus,
    });
  };

  const handleLoadExistingPosts = async () => {
    setPostsDrawerOpen(true);
    setLoadingPosts(true);
    setStatus({
      type: 'loading',
      title: 'Loading existing posts',
      message: `Fetching ${settings.path} from ${settings.owner || 'GitHub'}...`,
    });

    try {
      const result = await fetchPostsFromGitHub(settings);
      setRemotePosts(result.posts);
      setHasLoadedPosts(true);
      setStatus({
        type: 'success',
        title: `Loaded ${result.posts.length} existing post${result.posts.length === 1 ? '' : 's'}`,
        message: `Synced from ${settings.owner}/${settings.repo} (${settings.branch}).`,
      });
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isAuthError) {
          handleAuthError(err.status, err.message);
        } else {
          setStatus({
            type: 'error',
            title: `Could not load ${settings.path}`,
            message: err.message,
            httpStatus: err.status,
          });
        }
      } else {
        setStatus({
          type: 'error',
          title: 'Could not load existing posts',
          message:
            err instanceof Error
              ? err.message
              : 'Network error while communicating with GitHub.',
        });
      }
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleSelectPostForEdit = (post: BlogPost) => {
    const preserved = flushDraftToSavedList(latestDraftRef.current);
    if (preserved && settings.owner.trim() && settings.token.trim()) {
      void upsertDraftToGitHub(settings, preserved)
        .then(({ savedDraft }) => {
          setSavedDrafts(markSavedDraftSynced(preserved.draftId, savedDraft.syncedAt ?? undefined));
        })
        .catch(() => {
          // Local draft copy remains safely preserved
        });
    }
    suppressAutoSaveRef.current = false;

    const knownKeys = new Set([
      'id',
      'slug',
      'title',
      'date',
      'category',
      'tags',
      'excerpt',
      'summary',
      'content',
      'createdAt',
      'updatedAt',
    ]);
    const extraFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(post)) {
      if (!knownKeys.has(k)) {
        extraFields[k] = v;
      }
    }

    const nextDraft: DraftPost = {
      activeDraftId: null,
      editingId: post.id,
      title: post.title,
      slug: post.slug,
      date: post.date || new Date().toISOString().slice(0, 10),
      categoryTags:
        post.tags.length > 0 ? post.tags.join(', ') : post.category || '',
      summary: post.excerpt || post.summary || '',
      content: post.content,
      createdAt: post.createdAt ?? null,
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
    };

    loadedRemoteSnapshotRef.current = getRemoteSnapshotKey(nextDraft);
    setDraft(nextDraft);
    setSlugTouched(true);
    setSyncVersion((v) => v + 1);
    setStatus({
      type: 'idle',
      title: '',
      message: '',
    });
  };

  const handleDeletePost = async (post: BlogPost) => {
    setStatus({
      type: 'loading',
      title: `Deleting "${post.title}"`,
      message: `Updating ${settings.path} on GitHub...`,
    });

    try {
      const result = await deletePostFromGitHub(
        settings,
        post.id,
        post.title,
        (step) => {
          setStatus({
            type: 'loading',
            title: `Deleting "${post.title}"`,
            message: step,
          });
        }
      );

      setRemotePosts(result.posts);
      if (draft.editingId === post.id) {
        setDraft(createEmptyDraft());
        setSlugTouched(false);
        setSyncVersion((v) => v + 1);
      }
      setStatus({
        type: 'success',
        title: `Deleted "${post.title}"`,
        message: `Committed removal to ${settings.owner}/${settings.repo} (${settings.branch})`,
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
      });
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isAuthError) {
          handleAuthError(err.status, err.message);
        } else {
          setStatus({
            type: 'error',
            title: `Could not delete "${post.title}"`,
            message: err.message,
            httpStatus: err.status,
          });
        }
      } else {
        setStatus({
          type: 'error',
          title: 'Delete failed',
          message:
            err instanceof Error
              ? err.message
              : 'Network error while committing deletion.',
        });
      }
      throw err;
    }
  };

  const pushDraftInBackground = (saved: SavedDraft) => {
    if (!settings.owner.trim() || !settings.token.trim()) return;
    void upsertDraftToGitHub(settings, saved)
      .then(({ savedDraft }) => {
        setSavedDrafts(markSavedDraftSynced(saved.draftId, savedDraft.syncedAt ?? undefined));
      })
      .catch(() => {
        // Preserved locally; user can manually click Sync in Drafts drawer
      });
  };

  const handleNewDraft = () => {
    const preserved = flushDraftToSavedList(latestDraftRef.current);
    if (preserved) {
      pushDraftInBackground(preserved);
    }
    suppressAutoSaveRef.current = false;
    loadedRemoteSnapshotRef.current = null;

    setDraft(createEmptyDraft());
    setSlugTouched(false);
    setSyncVersion((v) => v + 1);

    const hasGitHub = Boolean(settings.owner.trim() && settings.token.trim());
    if (preserved) {
      setStatus({
        type: 'success',
        title: 'Started a new draft',
        message: hasGitHub
          ? `Saved "${preserved.title.trim() || 'Untitled Draft'}" to Drafts and syncing to GitHub's "${settings.draftsBranch || 'drafts'}" branch.`
          : `Saved "${preserved.title.trim() || 'Untitled Draft'}" to your local Drafts list so you can return to it anytime.`,
      });
    } else {
      setStatus({ type: 'idle', title: '', message: '' });
    }
  };

  const handleSaveDraft = async () => {
    const current = latestDraftRef.current;
    if (!hasDraftContent(current)) {
      setStatus({
        type: 'error',
        title: 'Nothing to save yet',
        message: 'Add a title, summary, or post content before saving a draft.',
      });
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    suppressAutoSaveRef.current = false;

    const { drafts, saved } = upsertSavedDraft(current);
    setSavedDrafts(drafts);
    setDraft((prev) => ({
      ...prev,
      activeDraftId: saved.draftId,
    }));

    const draftLabel = saved.title.trim() || 'Untitled Draft';
    if (!settings.owner.trim() || !settings.token.trim()) {
      setStatus({
        type: 'success',
        title: `Saved draft "${draftLabel}" locally`,
        message: 'Stored in browser localStorage. Add your GitHub Owner & Token in Settings to also sync drafts across devices.',
      });
      return;
    }

    const draftsBranch = settings.draftsBranch?.trim() || 'drafts';
    setSavingDraftRemote(true);
    setStatus({
      type: 'loading',
      title: `Saving draft "${draftLabel}" to GitHub`,
      message: `Syncing to ${settings.owner}/${settings.repo} (${draftsBranch} branch)...`,
    });

    try {
      const { savedDraft } = await upsertDraftToGitHub(settings, saved);
      const updated = markSavedDraftSynced(
        saved.draftId,
        savedDraft.syncedAt ?? undefined
      );
      setSavedDrafts(updated);
      setStatus({
        type: 'success',
        title: `Saved draft "${draftLabel}" to GitHub`,
        message: `Synced to "${draftsBranch}" branch (${settings.draftsPath || 'src/data/drafts.json'}) without touching "${settings.branch}".`,
      });
    } catch (err) {
      if (err instanceof GitHubApiError && err.isAuthError) {
        handleAuthError(err.status, err.message);
      } else {
        setStatus({
          type: 'error',
          title: `Saved "${draftLabel}" locally, but GitHub sync failed`,
          message:
            err instanceof Error
              ? err.message
              : 'Could not reach GitHub drafts branch.',
        });
      }
    } finally {
      setSavingDraftRemote(false);
    }
  };

  const handleOpenSavedDraft = (saved: SavedDraft) => {
    const current = latestDraftRef.current;
    if (current.activeDraftId !== saved.draftId) {
      const preserved = flushDraftToSavedList(current);
      if (preserved) {
        pushDraftInBackground(preserved);
      }
    }
    suppressAutoSaveRef.current = false;
    loadedRemoteSnapshotRef.current = null;

    setDraft({
      activeDraftId: saved.draftId,
      editingId: saved.editingId,
      title: saved.title,
      slug: saved.slug,
      date: saved.date || new Date().toISOString().slice(0, 10),
      categoryTags: saved.categoryTags,
      summary: saved.summary,
      content: saved.content,
      createdAt: saved.createdAt,
      extraFields: saved.extraFields,
    });
    setSlugTouched(Boolean(saved.slug && saved.slug !== slugify(saved.title)));
    setSyncVersion((v) => v + 1);
    setStatus({
      type: 'idle',
      title: '',
      message: '',
    });
  };

  const handleDeleteSavedDraft = (draftId: string) => {
    const existing = savedDrafts.find((d) => d.draftId === draftId);
    const next = deleteSavedDraftById(draftId);
    setSavedDrafts(next);
    if (latestDraftRef.current.activeDraftId === draftId) {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      suppressAutoSaveRef.current = true;
      setDraft((prev) => ({ ...prev, activeDraftId: null }));
    }
    if (settings.owner.trim() && settings.token.trim()) {
      void deleteDraftFromGitHub(
        settings,
        draftId,
        existing?.title || 'Untitled Draft'
      ).catch(() => {
        // Deleted locally; user can re-sync if needed
      });
    }
  };

  const handleToggleRemoveOnPublish = (next: boolean) => {
    setRemoveDraftOnPublish(next);
    saveRemoveDraftOnPublishPref(next);
  };

  const publishDraftPayload = async (targetDraft: DraftPost) => {
    if (!settings.owner.trim() || !settings.token.trim()) {
      setSettingsOpen(true);
      setStatus({
        type: 'error',
        title: 'GitHub settings incomplete',
        message:
          'Enter your GitHub Owner/Username and Fine-Grained Personal Access Token in Settings before publishing.',
      });
      return;
    }

    setPublishing(true);
    setStatus({
      type: 'loading',
      title: targetDraft.editingId ? 'Updating post on GitHub' : 'Publishing post to GitHub',
      message: `Connecting to ${settings.owner}/${settings.repo}...`,
    });

    try {
      const { result, savedPost, wasUpdate } = await publishPostToGitHub(
        settings,
        targetDraft,
        (step) => {
          setStatus({
            type: 'loading',
            title: targetDraft.editingId
              ? 'Updating post on GitHub'
              : 'Publishing post to GitHub',
            message: step,
          });
        }
      );

      setRemotePosts(result.posts);
      setHasLoadedPosts(true);

      let nextActiveDraftId = targetDraft.activeDraftId ?? null;
      if (targetDraft.activeDraftId) {
        if (removeDraftOnPublish) {
          const updatedDrafts = deleteSavedDraftById(targetDraft.activeDraftId);
          setSavedDrafts(updatedDrafts);
          nextActiveDraftId = null;
          void deleteDraftFromGitHub(
            settings,
            targetDraft.activeDraftId,
            targetDraft.title
          ).catch(() => {
            // Non-blocking cleanup on drafts branch
          });
        } else {
          const updatedDrafts = markSavedDraftPublished(
            targetDraft.activeDraftId,
            savedPost.id
          );
          setSavedDrafts(updatedDrafts);
          const publishedItem = updatedDrafts.find(
            (d) => d.draftId === targetDraft.activeDraftId
          );
          if (publishedItem) {
            void upsertDraftToGitHub(settings, publishedItem)
              .then(({ savedDraft }) => {
                setSavedDrafts(
                  markSavedDraftSynced(
                    publishedItem.draftId,
                    savedDraft.syncedAt ?? undefined
                  )
                );
              })
              .catch(() => {
                // Non-blocking sync on drafts branch
              });
          }
        }
      }

      if (
        targetDraft === draft ||
        (Boolean(targetDraft.activeDraftId) &&
          targetDraft.activeDraftId === draft.activeDraftId)
      ) {
        const nextActiveDraft: DraftPost = {
          ...draft,
          activeDraftId: nextActiveDraftId,
          editingId: savedPost.id,
          slug: savedPost.slug,
          createdAt: savedPost.createdAt ?? null,
        };
        loadedRemoteSnapshotRef.current = !nextActiveDraftId
          ? getRemoteSnapshotKey(nextActiveDraft)
          : null;
        setDraft(nextActiveDraft);
        setSlugTouched(true);
      }

      setStatus({
        type: 'success',
        title: wasUpdate
          ? `Updated "${savedPost.title}"`
          : `Published "${savedPost.title}"`,
        message: `Committed "Publish post: ${savedPost.title}" to ${settings.branch}`,
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
      });
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isAuthError) {
          handleAuthError(err.status, err.message);
        } else if (err.status === 409) {
          setStatus({
            type: 'error',
            title: 'File changed on GitHub (Conflict)',
            message:
              'Another commit modified posts.json while publishing. Click Publish to GitHub again to fetch the latest SHA and retry.',
            httpStatus: 409,
          });
        } else {
          setStatus({
            type: 'error',
            title: 'Publish failed',
            message: err.message,
            httpStatus: err.status,
          });
        }
      } else {
        setStatus({
          type: 'error',
          title: 'Publish failed',
          message:
            err instanceof Error
              ? err.message
              : 'Unexpected network error while publishing to GitHub.',
        });
      }
      throw err;
    } finally {
      setPublishing(false);
    }
  };

  const handlePublish = async () => {
    try {
      await publishDraftPayload(draft);
    } catch {
      // Status banner already displays the error
    }
  };

  const tokenWarningText = useMemo(() => {
    if (!settings.tokenExpiresAt) return null;
    const expiry = new Date(`${settings.tokenExpiresAt}T23:59:59`);
    if (Number.isNaN(expiry.getTime())) return null;
    const daysLeft = Math.ceil(
      (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft < 0) return 'Token expired — renew in Settings';
    if (daysLeft <= 14) return `Token expires in ${daysLeft}d`;
    return null;
  }, [settings.tokenExpiresAt]);

  const isConfigured = Boolean(settings.owner.trim() && settings.token.trim());

  return (
    <div id="top" className="min-h-screen bg-[#FAFAFA] text-[#18181B]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E4E4E7] bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#top"
            className="font-serif text-xl font-semibold tracking-tight text-[#18181B] whitespace-nowrap shrink-0"
          >
            Project Fibre
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Primary"
            className="flex items-center gap-6 overflow-x-auto text-sm font-medium text-[#52525B]"
          >
            <button
              type="button"
              onClick={() => setWorkspacePane('split')}
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setDraftsDrawerOpen(true)}
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              {savedDrafts.length > 0 ? `Drafts (${savedDrafts.length})` : 'Drafts'}
            </button>
            <button
              type="button"
              onClick={handleLoadExistingPosts}
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Posts
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="hover:text-[#18181B] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Settings
            </button>
          </nav>

          {/* Zone 3: Single Primary Action CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              {publishing
                ? 'Publishing...'
                : draft.editingId
                  ? 'Update on GitHub'
                  : draft.activeDraftId
                    ? 'Publish Draft to GitHub'
                    : 'Publish to GitHub'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 lg:py-8">
        {/* Workspace Context & View Selector Strip */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E4E7] pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717A] tabular-nums">
            {isConfigured ? (
              <>
                <span className="font-medium text-[#3F3F46]">
                  {settings.owner}/{settings.repo}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{settings.path}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{settings.branch}</span>
                {settings.tokenNote && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{settings.tokenNote}</span>
                  </>
                )}
                {tokenWarningText && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="font-medium text-[#DC2626] underline underline-offset-4"
                    >
                      {tokenWarningText}
                    </button>
                  </>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="font-medium text-[#2563EB] underline underline-offset-4 hover:text-[#1D4ED8]"
              >
                Configure GitHub Owner &amp; Personal Access Token in Settings to publish
              </button>
            )}

            {draft.activeDraftId && !draft.editingId && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setDraftsDrawerOpen(true)}
                  className="font-medium text-[#2d1f3d] hover:underline underline-offset-4"
                >
                  Auto-saved in Drafts
                </button>
              </>
            )}

            {draft.editingId && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#2563EB]">
                  Editing existing post
                </span>
                <button
                  type="button"
                  onClick={handleNewDraft}
                  className="inline-flex items-center gap-1 text-[#52525B] hover:text-[#18181B] underline underline-offset-2"
                >
                  <RotateCcw className="h-3 w-3" />
                  Detach
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={savingDraftRemote}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Bookmark className="h-3.5 w-3.5 text-[#52525B]" />
              {savingDraftRemote ? 'Saving Draft...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={handleNewDraft}
              className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B] whitespace-nowrap shrink-0"
            >
              New Draft
            </button>
            <button
              type="button"
              onClick={handleLoadExistingPosts}
              className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
            >
              Load Existing Posts
            </button>

            <div
              className="flex items-center gap-1 rounded-lg bg-[#F4F4F5] p-1"
              role="group"
              aria-label="Workspace layout"
            >
              <button
                type="button"
                onClick={() => setWorkspacePane('split')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  workspacePane === 'split'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Split View
              </button>
              <button
                type="button"
                onClick={() => setWorkspacePane('editor')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  workspacePane === 'editor'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                <PenLine className="h-3.5 w-3.5" />
                Editor
              </button>
              <button
                type="button"
                onClick={() => setWorkspacePane('preview')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  workspacePane === 'preview'
                    ? 'bg-white text-[#18181B] shadow-xs'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Progress, Confirmation, and 401/403 Auth Alert */}
        <StatusBanner
          status={status}
          repoName={settings.repo}
          onDismiss={() => setStatus({ type: 'idle', title: '', message: '' })}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Main Studio Grid */}
        <div
          className={
            workspacePane === 'split'
              ? 'grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start'
              : 'mx-auto max-w-[820px]'
          }
        >
          {/* Editor Column */}
          {workspacePane !== 'preview' && (
            <section
              aria-label="Post Editor"
              className={workspacePane === 'split' ? 'lg:col-span-7 space-y-5' : 'space-y-5'}
            >
              {/* Post Frontmatter / Metadata Card */}
              <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 sm:p-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="post-title-input" className="sr-only">
                      Post Title
                    </label>
                    <input
                      id="post-title-input"
                      type="text"
                      value={draft.title}
                      onChange={(e) => {
                        const nextTitle = e.target.value;
                        updateDraft((prev) => ({
                          ...prev,
                          title: nextTitle,
                          slug: slugTouched ? prev.slug : slugify(nextTitle),
                        }));
                      }}
                      placeholder="Post Title"
                      className="w-full border-0 bg-transparent font-serif text-2xl font-semibold tracking-tight text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none sm:text-3xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 border-t border-[#E4E4E7] pt-4 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="post-date-input"
                        className="mb-1 block text-xs font-medium text-[#52525B]"
                      >
                        Date
                      </label>
                      <input
                        id="post-date-input"
                        type="date"
                        value={draft.date}
                        onChange={(e) =>
                          updateDraft((prev) => ({ ...prev, date: e.target.value }))
                        }
                        className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#18181B] tabular-nums focus:border-[#2563EB] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="post-tags-input"
                        className="mb-1 block text-xs font-medium text-[#52525B]"
                      >
                        Category / Tags
                      </label>
                      <input
                        id="post-tags-input"
                        type="text"
                        value={draft.categoryTags}
                        onChange={(e) =>
                          updateDraft((prev) => ({
                            ...prev,
                            categoryTags: e.target.value,
                          }))
                        }
                        placeholder="Craft, Textiles, Notes"
                        className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="post-slug-input"
                        className="mb-1 block text-xs font-medium text-[#52525B]"
                      >
                        Slug
                      </label>
                      <input
                        id="post-slug-input"
                        type="text"
                        value={draft.slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          updateDraft((prev) => ({
                            ...prev,
                            slug: e.target.value,
                          }));
                        }}
                        placeholder="auto-generated-slug"
                        className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 font-mono text-xs text-[#18181B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="post-summary-input"
                      className="mb-1 block text-xs font-medium text-[#52525B]"
                    >
                      Summary / Excerpt
                    </label>
                    <textarea
                      id="post-summary-input"
                      rows={2}
                      value={draft.summary}
                      onChange={(e) =>
                        updateDraft((prev) => ({ ...prev, summary: e.target.value }))
                      }
                      placeholder="Write a concise 1–2 sentence summary for the Project Fibre index..."
                      className="w-full resize-none rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-sm leading-relaxed text-[#18181B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Body Editor */}
              <RichTextEditor
                value={draft.content}
                onChange={(nextContent) =>
                  updateDraft((prev) => ({ ...prev, content: nextContent }))
                }
                editorMode={editorMode}
                onEditorModeChange={setEditorMode}
                syncVersion={syncVersion}
              />
            </section>
          )}

          {/* Live Preview Column */}
          {workspacePane !== 'editor' && (
            <aside
              aria-label="Live Article Preview"
              className={
                workspacePane === 'split'
                  ? 'lg:col-span-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto scroll-smooth rounded-xl border border-[#E4E4E7] bg-white p-6 sm:p-8'
                  : 'rounded-xl border border-[#E4E4E7] bg-white p-6 sm:p-10'
              }
            >
              <div className="mb-4 flex items-center justify-between border-b border-[#E4E4E7] pb-2.5 text-xs font-medium text-[#71717A]">
                <span>Live Preview</span>
                <span className="font-mono text-[11px] text-[#A1A1AA]">
                  Rendered from Markdown
                </span>
              </div>
              <MarkdownPreview
                title={draft.title}
                slug={draft.slug}
                date={draft.date}
                categoryTags={draft.categoryTags}
                summary={draft.summary}
                content={draft.content}
              />
            </aside>
          )}
        </div>
      </main>

      {/* Settings Drawer */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        onAuthErrorDetected={handleAuthError}
      />

      {/* Drafts Drawer */}
      <DraftsDrawer
        isOpen={draftsDrawerOpen}
        onClose={() => setDraftsDrawerOpen(false)}
        drafts={savedDrafts}
        activeDraftId={draft.activeDraftId ?? null}
        removeDraftOnPublish={removeDraftOnPublish}
        isConfigured={isConfigured}
        draftsBranch={settings.draftsBranch || 'drafts'}
        syncingDrafts={syncingDrafts}
        onSyncDrafts={() => syncRemoteDrafts(settings, { showFeedback: true })}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleRemoveOnPublish={handleToggleRemoveOnPublish}
        onOpenDraft={handleOpenSavedDraft}
        onNewDraft={handleNewDraft}
        onPublishDraft={publishDraftPayload}
        onDeleteDraft={handleDeleteSavedDraft}
      />

      {/* Load Existing Posts Drawer */}
      <PostsManagerDrawer
        isOpen={postsDrawerOpen}
        onClose={() => setPostsDrawerOpen(false)}
        posts={remotePosts}
        loading={loadingPosts}
        hasLoadedOnce={hasLoadedPosts}
        activeEditingId={draft.editingId}
        onLoadPosts={handleLoadExistingPosts}
        onSelectPost={handleSelectPostForEdit}
        onDeletePost={handleDeletePost}
      />
    </div>
  );
}
