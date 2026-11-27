import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { GitHubSettings } from '../types/blog';
import { GitHubApiError, testGitHubConnection } from '../utils/github';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GitHubSettings;
  onSave: (nextSettings: GitHubSettings) => void;
  onAuthErrorDetected: (status: number, detail: string) => void;
}

function getExpirationSummary(expiresAt: string): {
  label: string;
  tone: 'neutral' | 'warn' | 'expired';
} | null {
  if (!expiresAt) return null;
  const target = new Date(`${expiresAt}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;

  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago — generate a new token on GitHub`,
      tone: 'expired',
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Expires today — renew your GitHub token soon',
      tone: 'warn',
    };
  }
  if (diffDays <= 14) {
    return {
      label: `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'} — plan token renewal`,
      tone: 'warn',
    };
  }
  return {
    label: `Expires in ${diffDays} days (${expiresAt})`,
    tone: 'neutral',
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onAuthErrorDetected,
}) => {
  const [form, setForm] = useState<GitHubSettings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(settings);
      setTestResult(null);
      setShowToken(false);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const expirationSummary = getExpirationSummary(form.tokenExpiresAt);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: GitHubSettings = {
      owner: form.owner.trim(),
      repo: form.repo.trim() || 'Project_fibre',
      path: form.path.trim() || 'src/data/posts.json',
      branch: form.branch.trim() || 'main',
      token: form.token.trim(),
      tokenExpiresAt: form.tokenExpiresAt,
      tokenNote: form.tokenNote.trim(),
    };
    onSave(cleaned);
    onClose();
  };

  const handleClearOrReplaceToken = () => {
    const next = { ...form, token: '' };
    setForm(next);
    onSave(next);
    setTestResult(null);
    setShowToken(true);
    requestAnimationFrame(() => {
      document.getElementById('github-pat-input')?.focus();
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const cleaned: GitHubSettings = {
        ...form,
        owner: form.owner.trim(),
        repo: form.repo.trim() || 'Project_fibre',
        path: form.path.trim() || 'src/data/posts.json',
        branch: form.branch.trim() || 'main',
        token: form.token.trim(),
      };
      onSave(cleaned);
      const res = await testGitHubConnection(cleaned);
      setTestResult({
        ok: true,
        message: res.fileExists
          ? `Connected! Found ${res.postCount} existing post${res.postCount === 1 ? '' : 's'} in ${cleaned.path}.`
          : `Connected to ${cleaned.owner}/${cleaned.repo}. ${cleaned.path} does not exist yet and will be created on your first publish.`,
      });
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.isAuthError) {
          onAuthErrorDetected(err.status, err.message);
        }
        setTestResult({
          ok: false,
          message: `GitHub API returned ${err.status}: ${err.message}`,
        });
      } else {
        setTestResult({
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : 'Network error while reaching GitHub API.',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-[#E4E4E7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E4E4E7] px-6 py-4">
          <div>
            <h2
              id="settings-modal-title"
              className="font-serif text-xl font-semibold text-[#18181B]"
            >
              GitHub Publisher Settings
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A]">
              Saved only in this browser&apos;s localStorage — never committed to source code.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="github-owner-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  GitHub Owner / Username
                </label>
                <input
                  id="github-owner-input"
                  type="text"
                  required
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  placeholder="your-github-username"
                  className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-sm text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="github-repo-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  Repository Name
                </label>
                <input
                  id="github-repo-input"
                  type="text"
                  required
                  value={form.repo}
                  onChange={(e) => setForm({ ...form, repo: e.target.value })}
                  placeholder="Project_fibre"
                  className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-sm text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="github-path-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  Posts JSON File Path
                </label>
                <input
                  id="github-path-input"
                  type="text"
                  required
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  placeholder="src/data/posts.json"
                  className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="github-branch-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  Branch
                </label>
                <input
                  id="github-branch-input"
                  type="text"
                  required
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="main"
                  className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Fine-grained PAT */}
            <div className="border-t border-[#E4E4E7] pt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="github-pat-input"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#3F3F46]"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#71717A]" />
                  GitHub Fine-Grained Personal Access Token
                </label>
                <button
                  type="button"
                  onClick={handleClearOrReplaceToken}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:underline whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear / Replace Token
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  id="github-pat-input"
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  value={form.token}
                  onChange={(e) => setForm({ ...form, token: e.target.value })}
                  placeholder="github_pat_..."
                  className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] py-2 pr-10 pl-3 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  className="absolute right-2 flex h-7 w-7 items-center justify-center rounded text-[#71717A] hover:text-[#18181B]"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#71717A]">
                Requires fine-grained token access to <span className="font-mono text-[#3F3F46]">{form.repo || 'Project_fibre'}</span> with repository permission <span className="font-medium text-[#3F3F46]">Contents: Read and write</span>.
              </p>
            </div>

            {/* Token Expiration Date & Renewal Note */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="token-expiration-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  Token Expiration Date
                </label>
                <input
                  id="token-expiration-input"
                  type="date"
                  value={form.tokenExpiresAt}
                  onChange={(e) =>
                    setForm({ ...form, tokenExpiresAt: e.target.value })
                  }
                  className="w-full rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-sm text-[#18181B] tabular-nums focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="token-note-input"
                  className="mb-1.5 block text-xs font-medium text-[#3F3F46]"
                >
                  Renewal Note
                </label>
                <input
                  id="token-note-input"
                  type="text"
                  value={form.tokenNote}
                  onChange={(e) => setForm({ ...form, tokenNote: e.target.value })}
                  placeholder="e.g. 90-day Project_fibre PAT"
                  className="w-full rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-sm text-[#18181B] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              {expirationSummary ? (
                <p
                  className={`sm:col-span-2 text-xs font-medium tabular-nums ${
                    expirationSummary.tone === 'expired'
                      ? 'text-[#DC2626]'
                      : expirationSummary.tone === 'warn'
                        ? 'text-[#D97706]'
                        : 'text-[#52525B]'
                  }`}
                >
                  {expirationSummary.label}
                </p>
              ) : (
                <p className="sm:col-span-2 text-xs text-[#71717A]">
                  GitHub Fine-Grained PATs expire on the schedule you choose — record the expiration date here so you know when to renew it.
                </p>
              )}
            </div>

            {testResult && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
                  testResult.ok
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
                    : 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.ok && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#E4E4E7] pt-5">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#18181B] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#27272A] whitespace-nowrap shrink-0"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
