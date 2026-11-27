import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Settings,
  X,
} from 'lucide-react';
import { PublishStatus } from '../types/blog';

interface StatusBannerProps {
  status: PublishStatus;
  repoName: string;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  status,
  repoName,
  onDismiss,
  onOpenSettings,
}) => {
  if (status.type === 'idle') return null;

  if (status.type === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1E3A8A]"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#2563EB]" />
          <div>
            <span className="font-medium">{status.title}</span>
            {status.message && (
              <span className="ml-2 text-xs text-[#1D4ED8]">{status.message}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status.type === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#14532D]"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
          <div>
            <p className="font-medium">{status.title}</p>
            <p className="mt-0.5 text-xs text-[#166534] tabular-nums">
              {status.message}
              {status.commitSha ? ` · Commit ${status.commitSha.slice(0, 7)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status.commitUrl && (
            <a
              href={status.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D] underline underline-offset-4 hover:text-[#14532D] whitespace-nowrap shrink-0"
            >
              View Commit
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss status message"
            className="rounded p-1 text-[#166534] hover:bg-[#DCFCE7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (status.type === 'auth_error') {
    return (
      <div
        role="alert"
        className="mb-6 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[#7F1D1D]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" />
            <div>
              <h3 className="text-sm font-semibold text-[#991B1B]">
                {status.title} {status.httpStatus ? `(HTTP ${status.httpStatus})` : ''}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#7F1D1D]">
                Your Personal Access Token may be expired, revoked, or missing <span className="font-semibold">Contents: Read and write</span> permissions on <span className="font-mono font-semibold">{repoName || 'Project_fibre'}</span>. Open Settings to revoke/clear the old token and paste a fresh token from GitHub.
              </p>
              {status.message && (
                <p className="mt-1.5 font-mono text-[11px] text-[#991B1B]/90">
                  GitHub response: {status.message}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#B91C1C] whitespace-nowrap shrink-0"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Open Settings to Replace Token
                </button>
                <a
                  href="https://github.com/settings/personal-access-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#991B1B] underline underline-offset-4 hover:text-[#7F1D1D] whitespace-nowrap shrink-0"
                >
                  GitHub Token Settings
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss alert"
            className="rounded p-1 text-[#991B1B] hover:bg-[#FEE2E2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm text-[#7C2D12]"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EA580C]" />
        <div>
          <p className="font-medium">{status.title}</p>
          <p className="mt-0.5 text-xs text-[#9A3412]">{status.message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-1 text-[#9A3412] hover:bg-[#FFEDD5]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
