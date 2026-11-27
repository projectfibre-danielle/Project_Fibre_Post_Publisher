import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import {
  applyRawMarkdownFormat,
  calculateReadingStats,
  domToMarkdown,
  FormatAction,
  isSafeUrl,
  markdownToSafeHtml,
} from '../utils/markdown';

export type EditorMode = 'rich' | 'raw';

interface RichTextEditorProps {
  value: string;
  onChange: (nextMarkdown: string) => void;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  syncVersion: number;
}

const SANITIZE_ALLOWED_TAGS = new Set([
  'p',
  'div',
  'br',
  'h1',
  'h2',
  'h3',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'code',
  'pre',
  'hr',
]);

function sanitizePastedHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent ?? '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'script' || tag === 'style') {
      return null;
    }

    // Handle spans with bold/italic computed/inline styling
    if (!SANITIZE_ALLOWED_TAGS.has(tag)) {
      const fragment = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const cleaned = cleanNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      }
      return fragment;
    }

    const cleanEl = document.createElement(tag);
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (isSafeUrl(href)) {
        cleanEl.setAttribute('href', href);
      }
    }

    for (const child of Array.from(el.childNodes)) {
      const cleaned = cleanNode(child);
      if (cleaned) cleanEl.appendChild(cleaned);
    }
    return cleanEl;
  };

  const container = document.createElement('div');
  for (const child of Array.from(doc.body.childNodes)) {
    const cleaned = cleanNode(child);
    if (cleaned) container.appendChild(cleaned);
  }
  return domToMarkdown(container);
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  editorMode,
  onEditorModeChange,
  syncVersion,
}) => {
  const richRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const savedRawSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const lastEmittedRef = useRef<string>(value);

  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');

  // Hydrate rich text surface when switching into rich mode or loading a new draft/post
  useEffect(() => {
    if (editorMode === 'rich' && richRef.current) {
      if (value !== lastEmittedRef.current || richRef.current.innerHTML === '') {
        richRef.current.innerHTML = markdownToSafeHtml(value);
        lastEmittedRef.current = value;
      }
    }
  }, [editorMode, syncVersion, value]);

  const handleModeSwitch = (nextMode: EditorMode) => {
    if (nextMode === editorMode) return;
    if (editorMode === 'rich' && richRef.current) {
      const latest = domToMarkdown(richRef.current);
      lastEmittedRef.current = latest;
      onChange(latest);
    }
    onEditorModeChange(nextMode);
  };

  const syncRichToMarkdown = () => {
    if (!richRef.current) return;
    const md = domToMarkdown(richRef.current);
    lastEmittedRef.current = md;
    onChange(md);
  };

  const saveCurrentSelection = () => {
    if (editorMode === 'rich') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && richRef.current?.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    } else if (rawRef.current) {
      savedRawSelectionRef.current = {
        start: rawRef.current.selectionStart,
        end: rawRef.current.selectionEnd,
      };
    }
  };

  const restoreRichSelection = () => {
    if (!richRef.current) return;
    richRef.current.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const applyFormat = (action: FormatAction) => {
    if (action === 'link') {
      saveCurrentSelection();
      if (editorMode === 'rich') {
        const sel = window.getSelection();
        setLinkLabel(sel?.toString() ?? '');
      } else if (rawRef.current) {
        const { selectionStart, selectionEnd } = rawRef.current;
        setLinkLabel(value.slice(selectionStart, selectionEnd));
      }
      setLinkUrl('https://');
      setLinkPopoverOpen(true);
      return;
    }

    if (editorMode === 'raw') {
      const textarea = rawRef.current;
      const start = textarea ? textarea.selectionStart : value.length;
      const end = textarea ? textarea.selectionEnd : value.length;
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        start,
        end,
        action
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    // Rich text mode formatting
    if (!richRef.current) return;
    richRef.current.focus();

    switch (action) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'h1':
        document.execCommand('formatBlock', false, 'h1');
        break;
      case 'h2':
        document.execCommand('formatBlock', false, 'h2');
        break;
      case 'h3':
        document.execCommand('formatBlock', false, 'h3');
        break;
      case 'ul':
        document.execCommand('insertUnorderedList', false);
        break;
      case 'ol':
        document.execCommand('insertOrderedList', false);
        break;
      case 'blockquote': {
        const sel = window.getSelection();
        const anchorNode = sel?.anchorNode;
        const existingQuote =
          anchorNode instanceof Element
            ? anchorNode.closest('blockquote')
            : anchorNode?.parentElement?.closest('blockquote');
        document.execCommand(
          'formatBlock',
          false,
          existingQuote ? 'p' : 'blockquote'
        );
        break;
      }
    }

    syncRichToMarkdown();
  };

  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl || !isSafeUrl(cleanUrl)) return;

    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        'link',
        { url: cleanUrl, label: linkLabel }
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setLinkPopoverOpen(false);
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    restoreRichSelection();
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim() ?? '';
    const displayLabel = linkLabel.trim() || selectedText || cleanUrl;

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const anchor = document.createElement('a');
      anchor.href = cleanUrl;
      anchor.textContent = displayLabel;
      range.insertNode(anchor);

      // Move cursor right after the inserted link
      const after = document.createRange();
      after.setStartAfter(anchor);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }

    setLinkPopoverOpen(false);
    syncRichToMarkdown();
  };

  const handleRichPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');

    if (html) {
      e.preventDefault();
      const convertedMd = sanitizePastedHtml(html);
      const safeHtml = markdownToSafeHtml(convertedMd);
      document.execCommand('insertHTML', false, safeHtml || plain);
      syncRichToMarkdown();
    }
  };

  const stats = calculateReadingStats(value);

  const toolbarButtons: Array<{
    action: FormatAction;
    label: string;
    icon: React.ReactNode;
  }> = [
    { action: 'bold', label: 'Bold', icon: <Bold className="h-4 w-4" /> },
    { action: 'italic', label: 'Italic', icon: <Italic className="h-4 w-4" /> },
    { action: 'h1', label: 'Heading 1', icon: <Heading1 className="h-4 w-4" /> },
    { action: 'h2', label: 'Heading 2', icon: <Heading2 className="h-4 w-4" /> },
    { action: 'h3', label: 'Heading 3', icon: <Heading3 className="h-4 w-4" /> },
    { action: 'ul', label: 'Bullet List', icon: <List className="h-4 w-4" /> },
    { action: 'ol', label: 'Numbered List', icon: <ListOrdered className="h-4 w-4" /> },
    { action: 'blockquote', label: 'Blockquote', icon: <Quote className="h-4 w-4" /> },
    { action: 'link', label: 'Insert Link', icon: <Link2 className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col rounded-xl border border-[#E4E4E7] bg-white">
      {/* Toolbar */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 rounded-t-xl">
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting tools">
          {toolbarButtons.map((btn) => (
            <button
              key={btn.action}
              type="button"
              title={btn.label}
              aria-label={btn.label}
              onMouseDown={(e) => {
                // Preserve current text selection inside editor
                e.preventDefault();
              }}
              onClick={() => applyFormat(btn.action)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#E4E4E7]/70 hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB]"
            >
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Rich Text vs Raw Markdown toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-[#F4F4F5] p-1">
          <button
            type="button"
            onClick={() => handleModeSwitch('rich')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              editorMode === 'rich'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Rich Text
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('raw')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              editorMode === 'raw'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Raw Markdown
          </button>
        </div>

        {/* Inline Link Popover */}
        {linkPopoverOpen && (
          <form
            onSubmit={handleInsertLink}
            className="absolute top-full left-3 z-20 mt-2 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2.5 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg"
          >
            <div className="text-xs font-semibold text-[#18181B]">Insert Link</div>
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Link text (optional)"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            <input
              type="url"
              required
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setLinkPopoverOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8]"
              >
                Apply Link
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Editor Surface */}
      <div className="min-h-[420px] p-5 sm:p-6">
        {editorMode === 'rich' ? (
          <div
            ref={richRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncRichToMarkdown}
            onBlur={syncRichToMarkdown}
            onPaste={handleRichPaste}
            data-placeholder="Write your Project Fibre story here. Use the toolbar above for headings, lists, links, and blockquotes — everything converts cleanly to Markdown..."
            className="rich-editor-surface min-h-[380px] text-[15.5px] leading-[1.75] text-[#18181B] focus:outline-none"
          />
        ) : (
          <textarea
            ref={rawRef}
            value={value}
            onChange={(e) => {
              lastEmittedRef.current = e.target.value;
              onChange(e.target.value);
            }}
            placeholder="# Heading&#10;&#10;Write or inspect clean Markdown directly..."
            spellCheck
            className="min-h-[380px] w-full resize-y bg-transparent font-mono text-[13.5px] leading-[1.75] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none"
          />
        )}
      </div>

      {/* Subtle Bottom Editor Footer */}
      <div className="flex items-center justify-between border-t border-[#E4E4E7] bg-[#FAFAFA] px-4 py-2 text-[12px] text-[#71717A] rounded-b-xl tabular-nums">
        <span>
          {editorMode === 'rich'
            ? 'Rich Text mode (auto-syncing to Markdown)'
            : 'Raw Markdown mode'}
        </span>
        <span>
          {stats.words} words · {stats.minutes > 0 ? `${stats.minutes} min read` : '0 min read'}
        </span>
      </div>
    </div>
  );
};
