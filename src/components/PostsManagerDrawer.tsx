import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { BlogPost } from '../types/blog';

interface PostsManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  posts: BlogPost[];
  loading: boolean;
  hasLoadedOnce: boolean;
  activeEditingId: string | null;
  onLoadPosts: () => void;
  onSelectPost: (post: BlogPost) => void;
  onDeletePost: (post: BlogPost) => Promise<void>;
}

export const PostsManagerDrawer: React.FC<PostsManagerDrawerProps> = ({
  isOpen,
  onClose,
  posts,
  loading,
  hasLoadedOnce,
  activeEditingId,
  onLoadPosts,
  onSelectPost,
  onDeletePost,
}) => {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.category,
        post.tags.join(' '),
        post.summary,
        post.slug,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [posts, query]);

  if (!isOpen) return null;

  const handleConfirmDelete = async (post: BlogPost) => {
    setDeletingId(post.id);
    try {
      await onDeletePost(post);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="posts-drawer-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-[#E4E4E7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E4E4E7] px-6 py-4">
          <div>
            <h2
              id="posts-drawer-title"
              className="font-serif text-xl font-semibold text-[#18181B]"
            >
              Published Posts
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A] tabular-nums">
              {hasLoadedOnce
                ? `${posts.length} post${posts.length === 1 ? '' : 's'} loaded from GitHub`
                : 'Fetch posts from src/data/posts.json to edit or delete'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Posts Drawer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[#E4E4E7] bg-[#FAFAFA] px-6 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, tag, or slug..."
              className="w-full rounded-lg border border-[#E4E4E7] bg-white py-1.5 pr-3 pl-8 text-sm text-[#18181B] focus:border-[#2563EB] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onLoadPosts}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#27272A] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : hasLoadedOnce ? 'Refresh Posts' : 'Load Existing Posts'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!hasLoadedOnce && !loading ? (
            <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-6 text-center">
              <p className="text-sm text-[#52525B]">
                No posts loaded yet. Click <span className="font-medium text-[#18181B]">Load Existing Posts</span> to fetch your entries from GitHub.
              </p>
            </div>
          ) : loading && posts.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#71717A]">
              Fetching posts from GitHub...
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#71717A]">
              {posts.length === 0
                ? 'Your posts.json array is currently empty.'
                : 'No posts match your search filter.'}
            </div>
          ) : (
            <ul className="divide-y divide-[#E4E4E7]">
              {filteredPosts.map((post) => {
                const isEditingThis = activeEditingId === post.id;
                const isConfirming = confirmDeleteId === post.id;
                const isDeleting = deletingId === post.id;

                return (
                  <li key={post.id} className="py-4 first:pt-1 last:pb-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-[#71717A] tabular-nums">
                          <span>{post.date || 'Undated'}</span>
                          {post.tags.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{post.tags.join(' / ')}</span>
                            </>
                          )}
                          {isEditingThis && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-[#2563EB]">
                                Currently in editor
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-1 font-serif text-base font-semibold text-[#18181B]">
                          {post.title}
                        </h3>
                        {post.summary && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#52525B]">
                            {post.summary}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {!isConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectPost(post);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(post.id)}
                              aria-label={`Delete ${post.title}`}
                              className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] bg-white p-1.5 text-[#71717A] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleConfirmDelete(post)}
                              className="rounded-lg bg-[#DC2626] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
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
