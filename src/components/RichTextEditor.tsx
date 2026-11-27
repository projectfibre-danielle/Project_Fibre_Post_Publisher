import React, { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import {
  AlertCircle,
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eraser,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Minus,
  OctagonAlert,
  Palette,
  Quote,
  Sigma,
  SquareFunction,
  Underline,
  Video,
} from 'lucide-react';
import {
  applyRawMarkdownFormat,
  applyRawTabIndent,
  calculateReadingStats,
  domToMarkdown,
  FormatAction,
  isSafeHexColor,
  isSafeUrl,
  markdownToSafeHtml,
  parseIndentRem,
  PRESET_TEXT_COLORS,
  resolveVideoEmbed,
} from '../utils/markdown';

export type EditorMode = 'rich' | 'raw';

type ActivePopover = 'none' | 'link' | 'color' | 'image' | 'video' | 'math';

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
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'code',
  'pre',
  'hr',
  'img',
  'span',
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
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      if (!isSafeUrl(src)) return null;
      cleanEl.setAttribute('src', src);
      cleanEl.setAttribute('alt', alt);
    }
    if (tag === 'blockquote') {
      const callout = el.getAttribute('data-callout');
      if (callout) cleanEl.setAttribute('data-callout', callout);
    }
    if (tag === 'p' || tag === 'div') {
      const pad = el.style?.paddingLeft;
      const textIndent = el.style?.textIndent;
      const align = el.style?.textAlign;
      if (pad && parseIndentRem(pad) > 0) cleanEl.style.paddingLeft = pad;
      if (textIndent && parseIndentRem(textIndent) > 0) {
        cleanEl.style.textIndent = textIndent;
      }
      if (align === 'left' || align === 'center' || align === 'right') {
        cleanEl.style.textAlign = align;
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

function clearColorFromRichSelection(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  const candidates = Array.from(
    root.querySelectorAll(
      'span[style], font, strong[style], b[style], em[style], i[style], u[style], p[style], h1[style], h2[style], h3[style], li[style]'
    )
  );
  let changed = false;

  for (const el of candidates) {
    if (range.intersectsNode(el)) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'font') {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
          changed = true;
        }
      } else if (el instanceof HTMLElement && el.style.color) {
        el.style.removeProperty('color');
        const remainingStyle = el.getAttribute('style')?.trim();
        if (!remainingStyle) {
          el.removeAttribute('style');
          if (tag === 'span') {
            const parent = el.parentNode;
            if (parent) {
              while (el.firstChild) {
                parent.insertBefore(el.firstChild, el);
              }
              parent.removeChild(el);
            }
          }
        }
        changed = true;
      }
    }
  }

  if (!changed) {
    document.execCommand('foreColor', false, '#18181B');
  }
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

  const [activePopover, setActivePopover] = useState<ActivePopover>('none');

  // Color selector state (with Project Fibre brand swatches #2d1f3d & #e8b4c8)
  const [customColor, setCustomColor] = useState('#2d1f3d');
  const [hexInput, setHexInput] = useState('#2d1f3d');

  // Link popover state
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');

  // Image/GIF popover state
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  // Video popover state
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');

  // Math popover state
  const [mathMode, setMathMode] = useState<'inline' | 'block'>('inline');
  const [mathFormula, setMathFormula] = useState('');

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
    setActivePopover('none');
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

  const insertHtmlAtRichCaret = (node: Node) => {
    restoreRichSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && richRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);

      const after = document.createRange();
      after.setStartAfter(node);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    } else if (richRef.current) {
      richRef.current.appendChild(node);
    }
    syncRichToMarkdown();
  };

  const getCurrentSelectedText = (): string => {
    if (editorMode === 'rich') {
      return window.getSelection()?.toString() ?? '';
    }
    if (rawRef.current) {
      return value.slice(rawRef.current.selectionStart, rawRef.current.selectionEnd);
    }
    return '';
  };

  const openPopover = (popover: ActivePopover) => {
    saveCurrentSelection();
    setActivePopover((prev) => (prev === popover ? 'none' : popover));
  };

  const applyRawAction = (
    action: FormatAction,
    options?: {
      url?: string;
      label?: string;
      color?: string;
      formula?: string;
    }
  ) => {
    const textarea = rawRef.current;
    const saved = savedRawSelectionRef.current;
    const start = textarea ? textarea.selectionStart : (saved?.start ?? value.length);
    const end = textarea ? textarea.selectionEnd : (saved?.end ?? value.length);
    const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
      value,
      start,
      end,
      action,
      options
    );
    lastEmittedRef.current = nextValue;
    onChange(nextValue);
    requestAnimationFrame(() => {
      if (rawRef.current) {
        rawRef.current.focus();
        rawRef.current.setSelectionRange(nextStart, nextEnd);
      }
    });
  };

  const applyFormat = (action: FormatAction) => {
    if (action === 'link') {
      setLinkLabel(getCurrentSelectedText());
      setLinkUrl('https://');
      openPopover('link');
      return;
    }

    if (action === 'image') {
      setImageAlt(getCurrentSelectedText());
      setImageUrl('');
      openPopover('image');
      return;
    }

    if (action === 'video') {
      setVideoTitle(getCurrentSelectedText());
      setVideoUrl('');
      openPopover('video');
      return;
    }

    if (action === 'mathInline' || action === 'mathBlock') {
      const selected = getCurrentSelectedText().trim();
      const targetMode = action === 'mathBlock' ? 'block' : 'inline';
      if (selected) {
        if (editorMode === 'raw') {
          applyRawAction(action, { formula: selected });
        } else {
          const textNode = document.createTextNode(
            targetMode === 'block' ? `$$\n${selected}\n$$` : `$${selected}$`
          );
          insertHtmlAtRichCaret(textNode);
        }
        return;
      }
      setMathMode(targetMode);
      setMathFormula(
        targetMode === 'inline'
          ? 'E = mc^2'
          : '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}'
      );
      openPopover('math');
      return;
    }

    setActivePopover('none');

    if (editorMode === 'raw') {
      applyRawAction(action);
      return;
    }

    if (!richRef.current) return;
    richRef.current.focus();

    switch (action) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'underline':
        document.execCommand('underline', false);
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
      case 'alignLeft':
        document.execCommand('justifyLeft', false);
        break;
      case 'alignCenter':
        document.execCommand('justifyCenter', false);
        break;
      case 'alignRight':
        document.execCommand('justifyRight', false);
        break;
      case 'hr': {
        const frag = document.createDocumentFragment();
        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        frag.appendChild(hr);
        frag.appendChild(p);
        insertHtmlAtRichCaret(frag);
        return;
      }
      case 'clearColor':
        clearColorFromRichSelection(richRef.current);
        break;
      case 'calloutNote':
      case 'calloutTip':
      case 'calloutImportant':
      case 'calloutWarning':
      case 'calloutCaution': {
        const kind =
          action === 'calloutNote'
            ? 'note'
            : action === 'calloutTip'
              ? 'tip'
              : action === 'calloutImportant'
                ? 'important'
                : action === 'calloutWarning'
                  ? 'warning'
                  : 'caution';
        const placeholder =
          kind === 'note'
            ? 'Useful information readers should know.'
            : kind === 'tip'
              ? 'Helpful advice for doing things better or more easily.'
              : kind === 'important'
                ? 'Key information readers need to know.'
                : kind === 'warning'
                  ? 'Urgent info that needs immediate attention to avoid problems.'
                  : 'Advises about risks or negative outcomes of certain actions.';

        const sel = window.getSelection();
        const anchorNode = sel?.anchorNode ?? null;
        const anchorEl =
          anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
        const existingQuote = anchorEl?.closest('blockquote');

        if (existingQuote && richRef.current.contains(existingQuote)) {
          if (existingQuote.getAttribute('data-callout') === kind) {
            const parent = existingQuote.parentNode;
            if (parent) {
              const firstInserted = existingQuote.firstChild;
              while (existingQuote.firstChild) {
                const child = existingQuote.firstChild;
                if (child.nodeType === Node.TEXT_NODE) {
                  const p = document.createElement('p');
                  p.textContent = child.textContent;
                  parent.insertBefore(p, existingQuote);
                  existingQuote.removeChild(child);
                } else {
                  parent.insertBefore(child, existingQuote);
                }
              }
              parent.removeChild(existingQuote);
              if (firstInserted && sel) {
                const r = document.createRange();
                r.selectNodeContents(firstInserted);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
              }
            }
          } else {
            existingQuote.setAttribute('data-callout', kind);
          }
          break;
        }

        const bq = document.createElement('blockquote');
        bq.setAttribute('data-callout', kind);
        const p = document.createElement('p');

        const selectedText = sel?.toString().trim() ?? '';
        const currentBlock = anchorEl?.closest('p, div, h1, h2, h3');
        const isDirectEditableBlock =
          currentBlock &&
          currentBlock !== richRef.current &&
          richRef.current.contains(currentBlock);

        if (selectedText) {
          p.textContent = selectedText;
          bq.appendChild(p);
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(bq);
          } else {
            richRef.current.appendChild(bq);
          }
          if (sel) {
            const r = document.createRange();
            r.selectNodeContents(p);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
          }
        } else if (isDirectEditableBlock) {
          const existingText = currentBlock.textContent?.trim() ?? '';
          if (existingText) {
            while (currentBlock.firstChild) {
              p.appendChild(currentBlock.firstChild);
            }
          } else {
            p.textContent = placeholder;
          }
          bq.appendChild(p);
          currentBlock.parentNode?.replaceChild(bq, currentBlock);

          if (!bq.nextElementSibling) {
            const trailing = document.createElement('p');
            trailing.appendChild(document.createElement('br'));
            bq.parentNode?.appendChild(trailing);
          }

          if (sel) {
            const r = document.createRange();
            r.selectNodeContents(p);
            if (existingText) r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
          }
        } else {
          p.textContent = placeholder;
          bq.appendChild(p);
          richRef.current.appendChild(bq);
          if (!bq.nextElementSibling) {
            const trailing = document.createElement('p');
            trailing.appendChild(document.createElement('br'));
            richRef.current.appendChild(trailing);
          }
          if (sel) {
            const r = document.createRange();
            r.selectNodeContents(p);
            sel.removeAllRanges();
            sel.addRange(r);
          }
        }
        break;
      }
    }

    syncRichToMarkdown();
  };

  const handleApplyColor = (rawHex: string) => {
    const trimmed = rawHex.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (!isSafeHexColor(withHash)) return;
    const hex = withHash.toLowerCase();

    setCustomColor(hex);
    setHexInput(hex);

    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        'color',
        { color: hex }
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setActivePopover('none');
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    restoreRichSelection();
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      // Fallback handled by serializeInlineNode for <font> tags
    }
    document.execCommand('foreColor', false, hex);
    setActivePopover('none');
    syncRichToMarkdown();
  };

  const handleClearColor = () => {
    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        'clearColor'
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setActivePopover('none');
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    restoreRichSelection();
    if (richRef.current) {
      clearColorFromRichSelection(richRef.current);
      syncRichToMarkdown();
    }
    setActivePopover('none');
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
      setActivePopover('none');
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

    const anchor = document.createElement('a');
    anchor.href = cleanUrl;
    anchor.textContent = displayLabel;
    insertHtmlAtRichCaret(anchor);
    setActivePopover('none');
  };

  const handleInsertImage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = imageUrl.trim();
    if (!cleanUrl || !isSafeUrl(cleanUrl)) return;
    const alt = imageAlt.trim() || 'Image';

    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        'image',
        { url: cleanUrl, label: alt }
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setActivePopover('none');
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    const p = document.createElement('p');
    const img = document.createElement('img');
    img.src = cleanUrl;
    img.alt = alt;
    p.appendChild(img);
    insertHtmlAtRichCaret(p);
    setActivePopover('none');
  };

  const handleInsertVideo = (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolveVideoEmbed(videoUrl);
    if (!resolved) return;
    const title = videoTitle.trim() || 'Embedded video';

    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        'video',
        { url: videoUrl.trim(), label: title }
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setActivePopover('none');
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    const figure = document.createElement('figure');
    figure.setAttribute('data-video-embed', 'true');
    figure.setAttribute('data-video-kind', resolved.kind);
    figure.setAttribute('data-video-src', resolved.embedSrc);
    figure.setAttribute('data-video-title', title);
    figure.setAttribute('contenteditable', 'false');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = `Video: ${title}`;
    const urlSpan = document.createElement('span');
    urlSpan.style.color = '#71717A';
    urlSpan.style.fontFamily = 'monospace';
    urlSpan.style.fontSize = '11px';
    urlSpan.textContent = resolved.embedSrc;

    figure.appendChild(labelSpan);
    figure.appendChild(urlSpan);
    insertHtmlAtRichCaret(figure);
    setActivePopover('none');
  };

  const handleInsertMath = (e: React.FormEvent) => {
    e.preventDefault();
    const formula = mathFormula.trim();
    if (!formula) return;

    const action = mathMode === 'block' ? 'mathBlock' : 'mathInline';

    if (editorMode === 'raw') {
      const sel = savedRawSelectionRef.current ?? {
        start: value.length,
        end: value.length,
      };
      const { nextValue, nextStart, nextEnd } = applyRawMarkdownFormat(
        value,
        sel.start,
        sel.end,
        action,
        { formula }
      );
      lastEmittedRef.current = nextValue;
      onChange(nextValue);
      setActivePopover('none');
      requestAnimationFrame(() => {
        if (rawRef.current) {
          rawRef.current.focus();
          rawRef.current.setSelectionRange(nextStart, nextEnd);
        }
      });
      return;
    }

    if (mathMode === 'block') {
      const p = document.createElement('p');
      p.textContent = `$$${formula}$$`;
      insertHtmlAtRichCaret(p);
    } else {
      const span = document.createTextNode(`$${formula}$`);
      insertHtmlAtRichCaret(span);
    }
    setActivePopover('none');
  };

  const mathPreviewHtml = useMemo(() => {
    if (activePopover !== 'math' || !mathFormula.trim()) return '';
    try {
      return katex.renderToString(mathFormula.trim(), {
        displayMode: mathMode === 'block',
        throwOnError: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [activePopover, mathFormula, mathMode]);

  const resolvedVideoPreview = useMemo(() => {
    if (!videoUrl.trim()) return null;
    return resolveVideoEmbed(videoUrl);
  }, [videoUrl]);

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

  const handleRichKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !richRef.current) return;
    e.preventDefault();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const savedStartContainer = range.startContainer;
    const savedStartOffset = range.startOffset;
    const savedEndContainer = range.endContainer;
    const savedEndOffset = range.endOffset;

    const restoreCaret = () => {
      try {
        const nextRange = document.createRange();
        nextRange.setStart(savedStartContainer, savedStartOffset);
        nextRange.setEnd(savedEndContainer, savedEndOffset);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      } catch {
        // Fallback if node references shifted
      }
    };

    const anchorNode = range.startContainer;
    const anchorEl =
      anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
    const li = anchorEl?.closest('li');

    // 1. Inside a list item: nest / outdent <li>
    if (li && richRef.current.contains(li)) {
      const list = li.parentElement;
      if (!list) return;
      const listTag = list.tagName.toLowerCase();
      if (listTag !== 'ul' && listTag !== 'ol') return;

      if (!e.shiftKey) {
        const prevLi = li.previousElementSibling;
        if (!prevLi || prevLi.tagName.toLowerCase() !== 'li') {
          return;
        }
        const lastChild = prevLi.lastElementChild;
        let subList: Element;
        if (
          lastChild &&
          (lastChild.tagName.toLowerCase() === 'ul' ||
            lastChild.tagName.toLowerCase() === 'ol')
        ) {
          subList = lastChild;
        } else {
          subList = document.createElement(listTag);
          prevLi.appendChild(subList);
        }
        subList.appendChild(li);
        restoreCaret();
        syncRichToMarkdown();
        return;
      }

      // Shift+Tab inside <li>: outdent up one list level if nested
      const parentLi = list.parentElement?.closest('li');
      if (!parentLi || !richRef.current.contains(parentLi)) {
        return;
      }
      const grandList = parentLi.parentElement;
      if (!grandList) return;

      const followingSiblings: Element[] = [];
      let nextEl = li.nextElementSibling;
      while (nextEl) {
        followingSiblings.push(nextEl);
        nextEl = nextEl.nextElementSibling;
      }

      grandList.insertBefore(li, parentLi.nextSibling);

      if (followingSiblings.length > 0) {
        const existingChildList = Array.from(li.children).find(
          (c) =>
            c.tagName.toLowerCase() === 'ul' || c.tagName.toLowerCase() === 'ol'
        );
        const childSubList =
          existingChildList ?? document.createElement(listTag);
        for (const sib of followingSiblings) {
          childSubList.appendChild(sib);
        }
        if (!existingChildList) {
          li.appendChild(childSubList);
        }
      }

      if (list.children.length === 0) {
        list.remove();
      }
      restoreCaret();
      syncRichToMarkdown();
      return;
    }

    // 2. Normal paragraph / heading block(s): indent/outdent via style.paddingLeft (2rem steps)
    const blockSelector = 'p, h1, h2, h3';
    const allBlocks = Array.from(
      richRef.current.querySelectorAll<HTMLElement>(blockSelector)
    ).filter((el) => !el.closest('blockquote, ul, ol'));

    let targetBlocks = allBlocks.filter((block) => range.intersectsNode(block));

    if (targetBlocks.length === 0) {
      const closest = anchorEl?.closest<HTMLElement>(blockSelector);
      if (closest && richRef.current.contains(closest) && !closest.closest('blockquote, ul, ol')) {
        targetBlocks = [closest];
      }
    }

    // If editor is empty or caret sits on a bare text node directly under richRef
    if (targetBlocks.length === 0) {
      if (e.shiftKey) return;
      if (
        richRef.current.innerHTML.trim() === '' ||
        richRef.current.innerHTML === '<br>'
      ) {
        const p = document.createElement('p');
        p.style.paddingLeft = '2rem';
        p.appendChild(document.createElement('br'));
        richRef.current.innerHTML = '';
        richRef.current.appendChild(p);
        const r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        syncRichToMarkdown();
        return;
      }
      if (anchorNode.nodeType === Node.TEXT_NODE && anchorNode.parentNode === richRef.current) {
        const p = document.createElement('p');
        p.style.paddingLeft = '2rem';
        richRef.current.insertBefore(p, anchorNode);
        p.appendChild(anchorNode);
        restoreCaret();
        syncRichToMarkdown();
        return;
      }
      return;
    }

    for (const block of targetBlocks) {
      const currentRem = parseIndentRem(
        block.style.paddingLeft || block.style.marginLeft || ''
      );
      if (!e.shiftKey) {
        const nextRem = Math.min(12, currentRem + 2);
        block.style.paddingLeft = `${nextRem}rem`;
      } else {
        if (currentRem > 0) {
          const nextRem = Math.max(0, currentRem - 2);
          if (nextRem > 0) {
            block.style.paddingLeft = `${nextRem}rem`;
          } else {
            block.style.removeProperty('padding-left');
            block.style.removeProperty('margin-left');
          }
        } else if (block.style.textIndent) {
          block.style.removeProperty('text-indent');
        }
        if (!block.getAttribute('style')?.trim()) {
          block.removeAttribute('style');
        }
      }
    }

    syncRichToMarkdown();
  };

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();

    const textarea = rawRef.current;
    const start = textarea ? textarea.selectionStart : value.length;
    const end = textarea ? textarea.selectionEnd : value.length;
    const res = applyRawTabIndent(value, start, end, e.shiftKey);
    if (!res.handled) return;

    if (res.nextValue !== value) {
      lastEmittedRef.current = res.nextValue;
      onChange(res.nextValue);
    }

    requestAnimationFrame(() => {
      if (rawRef.current) {
        rawRef.current.focus();
        rawRef.current.setSelectionRange(res.nextStart, res.nextEnd);
      }
    });
  };

  const stats = calculateReadingStats(value);
  const isHexValid = isSafeHexColor(
    hexInput.trim().startsWith('#') ? hexInput.trim() : `#${hexInput.trim()}`
  );

  const toolbarGroups: Array<
    Array<{
      action: FormatAction;
      label: string;
      shortLabel?: string;
      icon: React.ReactNode;
      popover?: ActivePopover;
    }>
  > = [
    [
      { action: 'bold', label: 'Bold (**text**)', icon: <Bold className="h-4 w-4" /> },
      { action: 'italic', label: 'Italic (_text_)', icon: <Italic className="h-4 w-4" /> },
      { action: 'underline', label: 'Underline', icon: <Underline className="h-4 w-4" /> },
      { action: 'h1', label: 'Heading 1', icon: <Heading1 className="h-4 w-4" /> },
      { action: 'h2', label: 'Heading 2', icon: <Heading2 className="h-4 w-4" /> },
      { action: 'h3', label: 'Heading 3', icon: <Heading3 className="h-4 w-4" /> },
      { action: 'ul', label: 'Bullet List', icon: <List className="h-4 w-4" /> },
      { action: 'ol', label: 'Numbered List', icon: <ListOrdered className="h-4 w-4" /> },
      { action: 'blockquote', label: 'Blockquote', icon: <Quote className="h-4 w-4" /> },
    ],
    [
      {
        action: 'calloutNote',
        label: 'Insert Note Callout (> [!NOTE])',
        shortLabel: 'Note',
        icon: <Info className="h-3.5 w-3.5 text-[#2563EB]" />,
      },
      {
        action: 'calloutTip',
        label: 'Insert Tip Callout (> [!TIP])',
        shortLabel: 'Tip',
        icon: <Lightbulb className="h-3.5 w-3.5 text-[#059669]" />,
      },
      {
        action: 'calloutImportant',
        label: 'Insert Important Callout (> [!IMPORTANT])',
        shortLabel: 'Important',
        icon: <AlertCircle className="h-3.5 w-3.5 text-[#7C3AED]" />,
      },
      {
        action: 'calloutWarning',
        label: 'Insert Warning Callout (> [!WARNING])',
        shortLabel: 'Warning',
        icon: <AlertTriangle className="h-3.5 w-3.5 text-[#D97706]" />,
      },
      {
        action: 'calloutCaution',
        label: 'Insert Caution Callout (> [!CAUTION])',
        shortLabel: 'Caution',
        icon: <OctagonAlert className="h-3.5 w-3.5 text-[#DC2626]" />,
      },
    ],
    [
      { action: 'alignLeft', label: 'Align Left', icon: <AlignLeft className="h-4 w-4" /> },
      { action: 'alignCenter', label: 'Align Center', icon: <AlignCenter className="h-4 w-4" /> },
      { action: 'alignRight', label: 'Align Right', icon: <AlignRight className="h-4 w-4" /> },
    ],
    [
      {
        action: 'color',
        label: 'Text Color',
        icon: (
          <span className="flex flex-col items-center">
            <Palette className="h-3.5 w-3.5" />
            <span
              className="mt-0.5 h-0.5 w-3.5 rounded-full"
              style={{ backgroundColor: customColor }}
            />
          </span>
        ),
        popover: 'color',
      },
    ],
    [
      { action: 'hr', label: 'Insert Horizontal Line (---)', icon: <Minus className="h-4 w-4" /> },
    ],
    [
      { action: 'link', label: 'Insert Link', icon: <Link2 className="h-4 w-4" />, popover: 'link' },
      { action: 'image', label: 'Insert Image / GIF', icon: <ImageIcon className="h-4 w-4" />, popover: 'image' },
      { action: 'video', label: 'Insert Video (YouTube / MP4)', icon: <Video className="h-4 w-4" />, popover: 'video' },
      { action: 'mathInline', label: 'Insert Inline Math ($...$)', icon: <Sigma className="h-4 w-4" />, popover: 'math' },
      { action: 'mathBlock', label: 'Insert Block Equation ($$...$$)', icon: <SquareFunction className="h-4 w-4" />, popover: 'math' },
    ],
  ];

  return (
    <div className="flex flex-col rounded-xl border border-[#E4E4E7] bg-white">
      {/* Sticky Formatting Toolbar */}
      <div className="sticky top-[57px] z-20 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-[#E4E4E7] bg-[#FAFAFA]/95 px-3 py-2 backdrop-blur-xs">
        <div
          className="flex flex-wrap items-center gap-1"
          role="toolbar"
          aria-label="Formatting tools"
        >
          {toolbarGroups.map((group, groupIdx) => (
            <React.Fragment key={groupIdx}>
              {groupIdx > 0 && (
                <span
                  aria-hidden="true"
                  className="mx-1 h-5 w-px bg-[#E4E4E7]"
                />
              )}
              <div className="flex items-center gap-0.5">
                {group.map((btn) => {
                  const isActive =
                    btn.popover !== undefined &&
                    activePopover === btn.popover &&
                    (btn.popover !== 'math' ||
                      (btn.action === 'mathInline' && mathMode === 'inline') ||
                      (btn.action === 'mathBlock' && mathMode === 'block'));
                  return (
                    <button
                      key={btn.action}
                      type="button"
                      title={btn.label}
                      aria-label={btn.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        if (btn.action === 'color') {
                          openPopover('color');
                        } else {
                          applyFormat(btn.action);
                        }
                      }}
                      className={`flex h-8 items-center justify-center rounded-lg whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] ${
                        btn.shortLabel ? 'gap-1 px-2 text-xs font-medium' : 'w-8'
                      } ${
                        isActive
                          ? 'bg-[#2563EB]/10 text-[#2563EB]'
                          : 'text-[#52525B] hover:bg-[#E4E4E7]/70 hover:text-[#18181B]'
                      }`}
                    >
                      {btn.icon}
                      {btn.shortLabel && <span>{btn.shortLabel}</span>}
                    </button>
                  );
                })}
              </div>
            </React.Fragment>
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

        {/* Customizable Text Color Popover */}
        {activePopover === 'color' && (
          <div className="absolute top-full left-3 z-30 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#18181B]">
                Text Color
              </span>
              <button
                type="button"
                onClick={handleClearColor}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]"
              >
                <Eraser className="h-3 w-3" />
                Clear Color
              </button>
            </div>

            {/* Brand & Editorial Swatches */}
            <div className="grid grid-cols-8 gap-1.5">
              {PRESET_TEXT_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={`${swatch.name} (${swatch.hex})`}
                  aria-label={`Apply ${swatch.name}`}
                  onClick={() => handleApplyColor(swatch.hex)}
                  className="h-7 w-7 rounded-lg border border-black/15 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>

            {/* Custom Color Input & Picker */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyColor(hexInput);
              }}
              className="mt-3 flex items-center gap-2 border-t border-[#E4E4E7] pt-3"
            >
              <label
                htmlFor="custom-color-picker"
                className="sr-only"
              >
                Pick custom color
              </label>
              <input
                id="custom-color-picker"
                type="color"
                value={isSafeHexColor(customColor) ? customColor : '#2d1f3d'}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setHexInput(e.target.value);
                }}
                className="h-8 w-9 cursor-pointer rounded-md border border-[#E4E4E7] bg-white p-0.5"
              />
              <input
                type="text"
                value={hexInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setHexInput(val);
                  const normalized = val.trim().startsWith('#')
                    ? val.trim()
                    : `#${val.trim()}`;
                  if (isSafeHexColor(normalized)) {
                    setCustomColor(normalized.toLowerCase());
                  }
                }}
                placeholder="#2d1f3d"
                aria-label="Custom hex color"
                className="min-w-0 flex-1 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!isHexValid}
                className="rounded-lg bg-[#18181B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#27272A] disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Apply
              </button>
            </form>
          </div>
        )}

        {/* Inline Link Popover */}
        {activePopover === 'link' && (
          <form
            onSubmit={handleInsertLink}
            className="absolute top-full left-3 z-30 mt-2 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2.5 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg"
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
                onClick={() => setActivePopover('none')}
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

        {/* Image / GIF Popover */}
        {activePopover === 'image' && (
          <form
            onSubmit={handleInsertImage}
            className="absolute top-full left-3 z-30 mt-2 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg"
          >
            <div className="text-xs font-semibold text-[#18181B]">
              Insert Image or GIF
            </div>
            <input
              type="text"
              required
              autoFocus
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/media.gif or /images/photo.jpg"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              placeholder="Alt text description (for accessibility)"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setActivePopover('none')}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8]"
              >
                Insert Image
              </button>
            </div>
          </form>
        )}

        {/* Video Embed Popover */}
        {activePopover === 'video' && (
          <form
            onSubmit={handleInsertVideo}
            className="absolute top-full left-3 z-30 mt-2 flex w-[min(400px,calc(100vw-2rem))] flex-col gap-2.5 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg"
          >
            <div className="text-xs font-semibold text-[#18181B]">
              Insert Video (YouTube, Vimeo, or MP4)
            </div>
            <input
              type="text"
              required
              autoFocus
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or .../video.mp4"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="Video title / caption (optional)"
              className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-sm text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
            {resolvedVideoPreview && (
              <p className="truncate font-mono text-[11px] text-[#71717A]">
                {resolvedVideoPreview.kind === 'iframe'
                  ? `Embed URL: ${resolvedVideoPreview.embedSrc}`
                  : `Direct video: ${resolvedVideoPreview.embedSrc}`}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setActivePopover('none')}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!resolvedVideoPreview}
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
              >
                Insert Video
              </button>
            </div>
          </form>
        )}

        {/* Math Equation Popover */}
        {activePopover === 'math' && (
          <form
            onSubmit={handleInsertMath}
            className="absolute top-full left-3 z-30 mt-2 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2.5 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#18181B]">
                Insert LaTeX Math Equation
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-[#F4F4F5] p-0.5">
                <button
                  type="button"
                  onClick={() => setMathMode('inline')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    mathMode === 'inline'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#71717A]'
                  }`}
                >
                  Inline ($...$)
                </button>
                <button
                  type="button"
                  onClick={() => setMathMode('block')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    mathMode === 'block'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#71717A]'
                  }`}
                >
                  Block ($$...$$)
                </button>
              </div>
            </div>

            <textarea
              rows={mathMode === 'block' ? 3 : 2}
              required
              autoFocus
              value={mathFormula}
              onChange={(e) => setMathFormula(e.target.value)}
              placeholder="e.g. \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
              className="w-full resize-none rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 font-mono text-xs text-[#18181B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />

            {mathPreviewHtml && (
              <div className="overflow-x-auto rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-center text-sm text-[#18181B]">
                <span dangerouslySetInnerHTML={{ __html: mathPreviewHtml }} />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setActivePopover('none')}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8]"
              >
                Insert Equation
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Scrollable Editor Surface */}
      <div className="h-[clamp(400px,58vh,680px)] overflow-y-auto scroll-smooth p-5 sm:p-6">
        {editorMode === 'rich' ? (
          <div
            ref={richRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncRichToMarkdown}
            onBlur={syncRichToMarkdown}
            onKeyDown={handleRichKeyDown}
            onPaste={handleRichPaste}
            data-placeholder="Write your Project Fibre story here. Use the sticky toolbar above for headings, underline, alignment, colors, media, and math — everything converts cleanly to Markdown..."
            className="rich-editor-surface min-h-full text-[15.5px] leading-[1.75] text-[#18181B] focus:outline-none"
          />
        ) : (
          <textarea
            ref={rawRef}
            value={value}
            onKeyDown={handleRawKeyDown}
            onChange={(e) => {
              lastEmittedRef.current = e.target.value;
              onChange(e.target.value);
            }}
            placeholder="# Heading&#10;&#10;Write or inspect clean Markdown directly..."
            spellCheck
            className="h-full min-h-full w-full resize-none bg-transparent font-mono text-[13.5px] leading-[1.75] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none"
          />
        )}
      </div>

      {/* Subtle Bottom Editor Footer */}
      <div className="flex items-center justify-between rounded-b-xl border-t border-[#E4E4E7] bg-[#FAFAFA] px-4 py-2 text-[12px] text-[#71717A] tabular-nums">
        <span>
          {editorMode === 'rich'
            ? 'Rich Text mode (auto-syncing to Markdown)'
            : 'Raw Markdown mode'}
        </span>
        <span>
          {stats.words} words ·{' '}
          {stats.minutes > 0 ? `${stats.minutes} min read` : '0 min read'}
        </span>
      </div>
    </div>
  );
};
