import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Search, Send, Trash2, X } from 'lucide-react';
import { SavedDraft } from '../types/blog';

interface DraftsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: SavedDraft[];
  activeDraftId: string | null;
  removeDraftOnPublish: boolean;
  onToggleRemoveOnPublish: (next: boolean) => void;
  onOpenDraft: (draft: SavedDraft) => void;
  onPublishDraft: (draft: SavedDraft) => Promise<void>;
  onDeleteDraft: (draftId: string) => void;
}

function formatSavedTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Saved locally';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const DraftsDrawer: React.FC<DraftsDrawerProps> = ({
  isOpen,
  onClose,
  drafts,
  activeDraftId,
  removeDraftOnPublish,
  onToggleRemoveOnPublish,
  onOpenDraft,
  onPublishDraft,
  onDeleteDraft,
}) => {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteId(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filteredDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((draft) => {
      const haystack = [
        draft.title,
        draft.categoryTags,
        draft.summary,
        draft.slug,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [drafts, query]);

  if (!isOpen) return null;

  const handlePublishClick = async (draft: SavedDraft) => {
    setPublishingDraftId(draft.draftId);
    try {
      await onPublishDraft(draft);
      onClose();
    } finally {
      setPublishingDraftId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drafts-drawer-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-[#E4E4E7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E4E4E7] px-6 py-4">
          <div>
            <h2
              id="drafts-drawer-title"
              className="font-serif text-xl font-semibold text-[#18181B]"
            >
              Local Drafts
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A] tabular-nums">
              {drafts.length} saved in browser localStorage · never committed until published
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Drafts Drawer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-[#E4E4E7] bg-[#FAFAFA] px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter saved drafts by title or tag..."
              className="w-full rounded-lg border border-[#E4E4E7] bg-white py-1.5 pr-3 pl-8 text-sm text-[#18181B] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#52525B]">
            <input
              type="checkbox"
              checked={removeDraftOnPublish}
              onChange={(e) => onToggleRemoveOnPublish(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#D4D4D8] text-[#2563EB] focus:ring-[#2563EB]"
            />
            <span>Remove draft from local list automatically once published to GitHub</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredDrafts.length === 0 ? (
            <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-6 text-center">
              <p className="text-sm text-[#52525B]">
                {drafts.length === 0
                  ? 'No saved drafts yet. Click Save Draft in the editor to keep work-in-progress posts locally without publishing.'
                  : 'No drafts match your search filter.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E4E4E7]">
              {filteredDrafts.map((draft) => {
                const isActive = activeDraftId === draft.draftId;
                const isConfirming = confirmDeleteId === draft.draftId;
                const isPublishing = publishingDraftId === draft.draftId;

                return (
                  <li key={draft.draftId} className="py-4 first:pt-1 last:pb-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717A] tabular-nums">
                          <span>Saved {formatSavedTimestamp(draft.savedAt)}</span>
                          {draft.categoryTags && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{draft.categoryTags}</span>
                            </>
                          )}
                          {draft.publishedAt ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-[#16A34A]">
                                Published
                              </span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Unpublished</span>
                            </>
                          )}
                          {isActive && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-[#2563EB]">
                                Open in editor
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="mt-1 font-serif text-base font-semibold text-[#18181B]">
                          {draft.title.trim() || 'Untitled Draft'}
                        </h3>

                        {draft.summary.trim() && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#52525B]">
                            {draft.summary}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {!isConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onOpenDraft(draft);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              Open
                            </button>
                            <button
                              type="button"
                              disabled={isPublishing}
                              onClick={() => handlePublishClick(draft)}
                              title="Publish this draft to GitHub posts.json"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {isPublishing ? 'Publishing...' : 'Publish'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(draft.draftId)}
                              aria-label={`Delete draft ${draft.title || 'Untitled Draft'}`}
                              className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] bg-white p-1.5 text-[#71717A] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteDraft(draft.draftId);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded-lg bg-[#DC2626] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] whitespace-nowrap shrink-0"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
