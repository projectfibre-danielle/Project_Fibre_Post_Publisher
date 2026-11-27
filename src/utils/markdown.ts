export type FormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'link'
  | 'blockquote'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'color'
  | 'clearColor'
  | 'hr'
  | 'image'
  | 'video'
  | 'mathInline'
  | 'mathBlock'
  | 'calloutNote'
  | 'calloutTip'
  | 'calloutImportant'
  | 'calloutWarning'
  | 'calloutCaution';

export type TextAlign = 'left' | 'center' | 'right';
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export const PRESET_TEXT_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Deep Plum', hex: '#2d1f3d' },
  { name: 'Blush Rose', hex: '#e8b4c8' },
  { name: 'Ink Black', hex: '#18181B' },
  { name: 'Cobalt Blue', hex: '#2563EB' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Crimson', hex: '#DC2626' },
  { name: 'Slate Muted', hex: '#64748B' },
];

export interface InlineToken {
  type:
    | 'text'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'code'
    | 'link'
    | 'image'
    | 'color'
    | 'math_inline'
    | 'br';
  text: string;
  href?: string;
  src?: string;
  alt?: string;
  color?: string;
  children?: InlineToken[];
}

export interface MarkdownListItem {
  tokens: InlineToken[];
  children?: Array<
    | { type: 'ul'; items: MarkdownListItem[] }
    | { type: 'ol'; items: MarkdownListItem[] }
  >;
}

export type MarkdownBlock =
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      tokens: InlineToken[];
      align?: TextAlign;
      paddingLeft?: string;
      textIndent?: string;
    }
  | {
      type: 'paragraph';
      tokens: InlineToken[];
      align?: TextAlign;
      paddingLeft?: string;
      textIndent?: string;
    }
  | { type: 'blockquote'; lines: InlineToken[][] }
  | { type: 'callout'; kind: CalloutKind; lines: InlineToken[][] }
  | { type: 'ul'; items: MarkdownListItem[] }
  | { type: 'ol'; items: MarkdownListItem[] }
  | { type: 'codeblock'; lang: string; code: string }
  | { type: 'math_block'; formula: string }
  | { type: 'image'; src: string; alt: string; align?: TextAlign }
  | {
      type: 'video';
      kind: 'iframe' | 'video';
      src: string;
      title: string;
      align?: TextAlign;
    }
  | {
      type: 'aligned';
      align?: TextAlign;
      paddingLeft?: string;
      textIndent?: string;
      blocks: MarkdownBlock[];
    }
  | { type: 'hr' };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

export function isSafeHexColor(color: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
    color.trim()
  );
}

export function normalizeColorToHex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSafeHexColor(trimmed)) return trimmed.toLowerCase();

  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(
    trimmed
  );
  if (!rgbMatch) return null;
  const r = Math.min(255, Number(rgbMatch[1])).toString(16).padStart(2, '0');
  const g = Math.min(255, Number(rgbMatch[2])).toString(16).padStart(2, '0');
  const b = Math.min(255, Number(rgbMatch[3])).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function resolveVideoEmbed(
  rawUrl: string
): { kind: 'iframe' | 'video'; embedSrc: string } | null {
  const trimmed = rawUrl.trim();
  if (!isSafeUrl(trimmed)) return null;

  if (trimmed.startsWith('/')) {
    return { kind: 'video', embedSrc: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      if (parsed.pathname.startsWith('/embed/')) {
        const videoId = parsed.pathname.split('/embed/')[1]?.split(/[/?]/)[0];
        if (videoId) {
          return {
            kind: 'iframe',
            embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
          };
        }
      }
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        if (v) {
          return {
            kind: 'iframe',
            embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(v)}`,
          };
        }
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/shorts/')[1]?.split(/[/?]/)[0];
        if (id) {
          return {
            kind: 'iframe',
            embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}`,
          };
        }
      }
    }

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[/?]/)[0];
      if (id) {
        return {
          kind: 'iframe',
          embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}`,
        };
      }
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const match = /\/(?:video\/)?(\d+)/.exec(parsed.pathname);
      if (match?.[1]) {
        return {
          kind: 'iframe',
          embedSrc: `https://player.vimeo.com/video/${match[1]}`,
        };
      }
    }

    return { kind: 'video', embedSrc: trimmed };
  } catch {
    return null;
  }
}

export function isAllowedIframeSrc(src: string): boolean {
  try {
    const parsed = new URL(src);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      ((host === 'youtube.com' && parsed.pathname.startsWith('/embed/')) ||
        (host === 'youtube-nocookie.com' &&
          parsed.pathname.startsWith('/embed/')) ||
        (host === 'player.vimeo.com' && parsed.pathname.startsWith('/video/')))
    );
  } catch {
    return false;
  }
}

export function buildVideoMarkdown(rawUrl: string, title?: string): string | null {
  const resolved = resolveVideoEmbed(rawUrl);
  if (!resolved) return null;
  const safeTitle = (title?.trim() || 'Embedded video').replace(/"/g, '&quot;');
  if (resolved.kind === 'iframe') {
    return `<iframe src="${resolved.embedSrc}" title="${safeTitle}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<video controls src="${resolved.embedSrc}" title="${safeTitle}"></video>`;
}

function getAttr(attrString: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(
    attrString
  );
  return match ? (match[1] ?? match[2] ?? '') : null;
}

export function parseInlineMarkdown(text: string, depth = 0): InlineToken[] {
  if (!text) return [];
  if (depth > 8) return [{ type: 'text', text }];

  const tokens: InlineToken[] = [];
  // Precedence order:
  // 1. <br />
  // 2. <span style="...">...</span> (color and/or text-decoration: underline)
  // 3. <u>...</u>
  // 4. <strong>...</strong> / <b>...</b>
  // 5. <em>...</em> / <i>...</i>
  // 6. ![alt](url)
  // 7. [label](url)
  // 8. `inline code`
  // 9. $inline math$
  // 10. ***bold italic*** or ___bold italic___
  // 11. **bold**
  // 12. _italic_ (primary italic syntax, safe against snake_case identifiers)
  // 13. *italic* (fallback for legacy posts)
  const pattern =
    /(<br\s*\/?>|<span\s+style=["']([^"']+)["']\s*>|<u>([\s\S]*?)<\/u>|<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>|<(?:em|i)>([\s\S]*?)<\/(?:em|i)>|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\$(?!\$)([^\n$]+?)\$|\*\*\*([^\n*]+?)\*\*\*|___([^\n_]+?)___|(?:\*\*([^\n]+?)\*\*)|(?:(?<![\w\\])_([^\n_]+?)_(?!\w))|(?:(?<!\*)\*(?!\*)([^\n*]+?)(?<!\*)\*(?!\*)))/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const full = match[0];

    if (/^<br\s*\/?>$/i.test(full)) {
      tokens.push({ type: 'br', text: '' });
    } else if (match[2] !== undefined) {
      const styleStr = match[2];
      const contentStart = pattern.lastIndex;
      const spanTagRe = /<span\b[^>]*>|<\/span>/gi;
      spanTagRe.lastIndex = contentStart;
      let spanDepth = 1;
      let closeStart = -1;
      let closeEnd = -1;
      let tagMatch: RegExpExecArray | null;

      while ((tagMatch = spanTagRe.exec(text)) !== null) {
        if (tagMatch[0].toLowerCase().startsWith('</span')) {
          spanDepth -= 1;
          if (spanDepth === 0) {
            closeStart = tagMatch.index;
            closeEnd = spanTagRe.lastIndex;
            break;
          }
        } else {
          spanDepth += 1;
        }
      }

      const inner =
        closeStart !== -1
          ? text.slice(contentStart, closeStart)
          : text.slice(contentStart);
      pattern.lastIndex = closeEnd !== -1 ? closeEnd : text.length;

      const colorMatch = /color\s*:\s*([^;]+)/i.exec(styleStr);
      const rawColor = colorMatch ? normalizeColorToHex(colorMatch[1]) : null;
      const hasUnderline = /text-decoration(?:-line)?\s*:\s*underline/i.test(styleStr);
      const innerTokens = parseInlineMarkdown(inner, depth + 1);

      if (rawColor && hasUnderline) {
        tokens.push({
          type: 'color',
          text: inner,
          color: rawColor,
          children: [
            {
              type: 'underline',
              text: inner,
              children: innerTokens,
            },
          ],
        });
      } else if (rawColor) {
        tokens.push({
          type: 'color',
          text: inner,
          color: rawColor,
          children: innerTokens,
        });
      } else if (hasUnderline) {
        tokens.push({
          type: 'underline',
          text: inner,
          children: innerTokens,
        });
      } else {
        tokens.push(...innerTokens);
      }
    } else if (match[3] !== undefined) {
      tokens.push({
        type: 'underline',
        text: match[3],
        children: parseInlineMarkdown(match[3], depth + 1),
      });
    } else if (match[4] !== undefined) {
      tokens.push({
        type: 'bold',
        text: match[4],
        children: parseInlineMarkdown(match[4], depth + 1),
      });
    } else if (match[5] !== undefined) {
      tokens.push({
        type: 'italic',
        text: match[5],
        children: parseInlineMarkdown(match[5], depth + 1),
      });
    } else if (match[6] !== undefined && match[7] !== undefined) {
      const src = match[7].trim();
      tokens.push({
        type: 'image',
        text: match[6],
        alt: match[6],
        src: isSafeUrl(src) ? src : '',
      });
    } else if (match[8] !== undefined && match[9] !== undefined) {
      const href = match[9].trim();
      tokens.push({
        type: 'link',
        text: match[8],
        href: isSafeUrl(href) ? href : '#',
        children: parseInlineMarkdown(match[8], depth + 1),
      });
    } else if (match[10] !== undefined) {
      tokens.push({ type: 'code', text: match[10] });
    } else if (match[11] !== undefined) {
      tokens.push({ type: 'math_inline', text: match[11].trim() });
    } else if (match[12] !== undefined || match[13] !== undefined) {
      const inner = match[12] ?? match[13];
      tokens.push({
        type: 'bold',
        text: inner,
        children: [
          {
            type: 'italic',
            text: inner,
            children: parseInlineMarkdown(inner, depth + 1),
          },
        ],
      });
    } else if (match[14] !== undefined) {
      tokens.push({
        type: 'bold',
        text: match[14],
        children: parseInlineMarkdown(match[14], depth + 1),
      });
    } else if (match[15] !== undefined || match[16] !== undefined) {
      const inner = match[15] ?? match[16];
      tokens.push({
        type: 'italic',
        text: inner,
        children: parseInlineMarkdown(inner, depth + 1),
      });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text }];
}

function extractAlignFromTag(openTagAttrs: string): TextAlign | null {
  const style = getAttr(openTagAttrs, 'style') ?? '';
  const styleAlign = /text-align\s*:\s*(left|center|right)/i.exec(style);
  if (styleAlign) {
    return styleAlign[1].toLowerCase() as TextAlign;
  }
  const attrAlign = getAttr(openTagAttrs, 'align');
  if (attrAlign && /^(left|center|right)$/i.test(attrAlign.trim())) {
    return attrAlign.trim().toLowerCase() as TextAlign;
  }
  return null;
}

export function isSafeCssLength(value: string): boolean {
  const trimmed = value.trim();
  const match = /^(\d+(?:\.\d+)?)(rem|em|px)$/i.exec(trimmed);
  if (!match) return false;
  return Number(match[1]) > 0;
}

export function parseIndentRem(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+(?:\.\d+)?)(rem|em|px)$/i.exec(trimmed);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const unit = match[2].toLowerCase();
  if (unit === 'px') return Math.round((num / 16) * 100) / 100;
  return num;
}

function extractBlockStylesFromTag(openTagAttrs: string): {
  align?: TextAlign;
  paddingLeft?: string;
  textIndent?: string;
} {
  const style = getAttr(openTagAttrs, 'style') ?? '';
  const align = extractAlignFromTag(openTagAttrs) ?? undefined;
  const padMatch = /padding-left\s*:\s*([^;]+)/i.exec(style);
  const marginMatch = /margin-left\s*:\s*([^;]+)/i.exec(style);
  const indentMatch = /text-indent\s*:\s*([^;]+)/i.exec(style);

  const rawPad = padMatch?.[1]?.trim() || marginMatch?.[1]?.trim() || '';
  const rawIndent = indentMatch?.[1]?.trim() || '';

  return {
    ...(align ? { align } : {}),
    ...(rawPad && isSafeCssLength(rawPad) ? { paddingLeft: rawPad } : {}),
    ...(rawIndent && isSafeCssLength(rawIndent) ? { textIndent: rawIndent } : {}),
  };
}

function measureLeadingIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count += 1;
    else if (ch === '\t') count += 2;
    else break;
  }
  return count;
}

function parseListBlock(
  lines: string[],
  startIdx: number
): {
  block: { type: 'ul' | 'ol'; items: MarkdownListItem[] };
  nextIdx: number;
} {
  const listLineRe = /^(?: *|\t*)(?:([-*+])|(\d+)\.)\s+(.*)$/;
  const firstMatch = listLineRe.exec(lines[startIdx]);
  const baseIndent = measureLeadingIndent(lines[startIdx]);
  const listType: 'ul' | 'ol' = firstMatch?.[1] ? 'ul' : 'ol';
  const items: MarkdownListItem[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const match = listLineRe.exec(lines[i]);
    if (!match) break;

    const indent = measureLeadingIndent(lines[i]);
    const itemType: 'ul' | 'ol' = match[1] ? 'ul' : 'ol';
    const content = match[3] ?? '';

    if (indent < baseIndent) {
      break;
    }

    if (indent > baseIndent) {
      if (items.length > 0) {
        const sub = parseListBlock(lines, i);
        const lastItem = items[items.length - 1];
        if (!lastItem.children) lastItem.children = [];
        lastItem.children.push(sub.block);
        i = sub.nextIdx;
        continue;
      }
      // List starts already indented without a parent item
      items.push({ tokens: parseInlineMarkdown(content.trim()) });
      i++;
      continue;
    }

    if (itemType !== listType) {
      break;
    }

    items.push({ tokens: parseInlineMarkdown(content.trim()) });
    i++;
  }

  return { block: { type: listType, items }, nextIdx: i };
}

function findMatchingClosingTag(
  lines: string[],
  startLineIdx: number,
  tagName: 'div' | 'p',
  afterOpenOnStartLine: string
): { innerMarkdown: string; endLineIdx: number } {
  const openRe = new RegExp(`<${tagName}(?:\\s+[^>]*)?>`, 'gi');
  const closeRe = new RegExp(`<\\/${tagName}>`, 'gi');

  // Helper to scan a single line for depth changes
  const scanLineForClose = (
    text: string,
    initialDepth: number
  ): { nextDepth: number; closeIndex: number } => {
    const events: Array<{ index: number; delta: number }> = [];
    openRe.lastIndex = 0;
    closeRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(text)) !== null) {
      events.push({ index: m.index, delta: 1 });
    }
    while ((m = closeRe.exec(text)) !== null) {
      events.push({ index: m.index, delta: -1 });
    }
    events.sort((a, b) => a.index - b.index);

    let depth = initialDepth;
    for (const ev of events) {
      depth += ev.delta;
      if (depth === 0) {
        return { nextDepth: 0, closeIndex: ev.index };
      }
    }
    return { nextDepth: depth, closeIndex: -1 };
  };

  // Check if closed on the very same opening line
  const sameLineCheck = scanLineForClose(afterOpenOnStartLine, 1);
  if (sameLineCheck.nextDepth === 0) {
    return {
      innerMarkdown: afterOpenOnStartLine.slice(0, sameLineCheck.closeIndex).trim(),
      endLineIdx: startLineIdx,
    };
  }

  let depth = sameLineCheck.nextDepth;
  const collected: string[] = [];
  if (afterOpenOnStartLine.trim()) {
    collected.push(afterOpenOnStartLine);
  }

  let idx = startLineIdx + 1;
  while (idx < lines.length) {
    const line = lines[idx];
    const res = scanLineForClose(line, depth);
    if (res.nextDepth === 0) {
      const beforeClose = line.slice(0, res.closeIndex);
      if (beforeClose.trim()) {
        collected.push(beforeClose);
      }
      return {
        innerMarkdown: collected.join('\n'),
        endLineIdx: idx,
      };
    }
    collected.push(line);
    depth = res.nextDepth;
    idx++;
  }

  return {
    innerMarkdown: collected.join('\n'),
    endLineIdx: lines.length - 1,
  };
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'codeblock', lang, code: codeLines.join('\n') });
      continue;
    }

    // Block math $$...$$ (single line or multi-line)
    if (trimmed.startsWith('$$')) {
      const singleLineMatch = /^\$\$([\s\S]+?)\$\$$/.exec(trimmed);
      if (singleLineMatch && trimmed.length > 4) {
        blocks.push({
          type: 'math_block',
          formula: singleLineMatch[1].trim(),
        });
        i++;
        continue;
      }
      const formulaLines: string[] = [];
      const afterOpen = trimmed.slice(2).trim();
      if (afterOpen) formulaLines.push(afterOpen);
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        formulaLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const closing = lines[i].trim().slice(0, -2).trim();
        if (closing) formulaLines.push(closing);
        i++;
      }
      blocks.push({
        type: 'math_block',
        formula: formulaLines.join('\n').trim(),
      });
      continue;
    }

    // Styled wrapper <div style="text-align: ...; padding-left: ..."> or <p style="...">
    const styledOpenMatch = /^<(div|p)\s+([^>]+)>(.*)$/i.exec(trimmed);
    if (styledOpenMatch) {
      const tagName = styledOpenMatch[1].toLowerCase() as 'div' | 'p';
      const styles = extractBlockStylesFromTag(styledOpenMatch[2]);
      if (styles.align || styles.paddingLeft || styles.textIndent) {
        const { innerMarkdown, endLineIdx } = findMatchingClosingTag(
          lines,
          i,
          tagName,
          styledOpenMatch[3] ?? ''
        );
        const innerBlocks = parseMarkdownBlocks(innerMarkdown);
        if (innerBlocks.length > 0) {
          blocks.push({
            type: 'aligned',
            ...(styles.align ? { align: styles.align } : {}),
            ...(styles.paddingLeft ? { paddingLeft: styles.paddingLeft } : {}),
            ...(styles.textIndent ? { textIndent: styles.textIndent } : {}),
            blocks: innerBlocks,
          });
        }
        i = endLineIdx + 1;
        continue;
      }
    }

    // Video iframe embed
    const iframeMatch = /^<iframe\s+([^>]+)>(?:<\/iframe>)?$/i.exec(trimmed);
    if (iframeMatch) {
      const src = getAttr(iframeMatch[1], 'src') ?? '';
      const title = getAttr(iframeMatch[1], 'title') ?? 'Embedded video';
      if (isAllowedIframeSrc(src)) {
        blocks.push({ type: 'video', kind: 'iframe', src, title });
        i++;
        continue;
      }
    }

    // HTML5 video embed
    const videoMatch = /^<video\s+([^>]+)>(?:<\/video>)?$/i.exec(trimmed);
    if (videoMatch) {
      const src = getAttr(videoMatch[1], 'src') ?? '';
      const title = getAttr(videoMatch[1], 'title') ?? 'Embedded video';
      if (isSafeUrl(src)) {
        blocks.push({ type: 'video', kind: 'video', src, title });
        i++;
        continue;
      }
    }

    // Standalone image block ![alt](url)
    const imageBlockMatch = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
    if (imageBlockMatch) {
      const src = imageBlockMatch[2].trim();
      if (isSafeUrl(src)) {
        blocks.push({
          type: 'image',
          alt: imageBlockMatch[1],
          src,
        });
        i++;
        continue;
      }
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headings H1-H3
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({
        type: 'heading',
        level,
        tokens: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Blockquote & GFM Callouts ([!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION])
    if (trimmed.startsWith('>')) {
      const rawQuoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        rawQuoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }

      const firstLine = rawQuoteLines[0]?.trim() ?? '';
      const calloutMatch =
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(firstLine);
      if (calloutMatch) {
        const kind = calloutMatch[1].toLowerCase() as CalloutKind;
        const remainder = calloutMatch[2]?.trim() ?? '';
        const bodyStrings = [
          ...(remainder ? [remainder] : []),
          ...rawQuoteLines.slice(1).map((l) => l.trim()),
        ].filter(Boolean);
        const calloutLines =
          bodyStrings.length > 0
            ? bodyStrings.map((line) => parseInlineMarkdown(line))
            : [[{ type: 'text' as const, text: '' }]];
        blocks.push({ type: 'callout', kind, lines: calloutLines });
        continue;
      }

      const quoteLines = rawQuoteLines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => parseInlineMarkdown(line));
      if (quoteLines.length > 0) {
        blocks.push({ type: 'blockquote', lines: quoteLines });
      }
      continue;
    }

    // Unordered or ordered list (with nested indentation support)
    if (/^(?:[-*+]|\d+\.)\s+/.test(trimmed)) {
      const { block, nextIdx } = parseListBlock(lines, i);
      blocks.push(block);
      i = nextIdx;
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s+|>\s?|[-*+]\s+|\d+\.\s+|```|\$\$|!\[[^\]]*\]\([^)\s]+\)$|<iframe\s|<video\s|<(?:div|p)\s+[^>]+>|-{3,}$|\*{3,}$)/.test(
        lines[i].trim()
      )
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        tokens: parseInlineMarkdown(paraLines.join(' ')),
      });
    }
  }

  return blocks;
}

function inlineTokensToHtml(tokens: InlineToken[]): string {
  return tokens
    .map((tok) => {
      const safe = escapeHtml(tok.text);
      const innerHtml = tok.children ? inlineTokensToHtml(tok.children) : safe;
      switch (tok.type) {
        case 'bold':
          return `<strong>${innerHtml}</strong>`;
        case 'italic':
          return `<em>${innerHtml}</em>`;
        case 'underline':
          return `<u>${innerHtml}</u>`;
        case 'code':
          return `<code>${safe}</code>`;
        case 'br':
          return '<br data-explicit-br="true" />';
        case 'math_inline':
          return `$${safe}$`;
        case 'color': {
          const hex = tok.color && isSafeHexColor(tok.color) ? tok.color : '#18181B';
          return `<span style="color: ${hex}">${innerHtml}</span>`;
        }
        case 'image': {
          const safeSrc = tok.src && isSafeUrl(tok.src) ? escapeHtml(tok.src) : '';
          const safeAlt = escapeHtml(tok.alt ?? '');
          return safeSrc ? `<img src="${safeSrc}" alt="${safeAlt}" />` : '';
        }
        case 'link': {
          const safeHref = tok.href && isSafeUrl(tok.href) ? escapeHtml(tok.href) : '#';
          return `<a href="${safeHref}">${innerHtml}</a>`;
        }
        default:
          return safe;
      }
    })
    .join('');
}

interface BlockHtmlStyleContext {
  align?: TextAlign;
  paddingLeft?: string;
  textIndent?: string;
}

function buildStyleAttr(ctx?: BlockHtmlStyleContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.align) parts.push(`text-align: ${ctx.align}`);
  if (ctx.paddingLeft) parts.push(`padding-left: ${ctx.paddingLeft}`);
  if (ctx.textIndent) parts.push(`text-indent: ${ctx.textIndent}`);
  return parts.length > 0 ? ` style="${parts.join('; ')}"` : '';
}

function listItemsToHtml(items: MarkdownListItem[]): string {
  return items
    .map((item) => {
      const textHtml = inlineTokensToHtml(item.tokens);
      const childrenHtml = (item.children ?? [])
        .map((child) =>
          child.type === 'ul'
            ? `<ul>${listItemsToHtml(child.items)}</ul>`
            : `<ol>${listItemsToHtml(child.items)}</ol>`
        )
        .join('');
      return `<li>${textHtml}${childrenHtml}</li>`;
    })
    .join('');
}

function blocksToHtml(
  blocks: MarkdownBlock[],
  styleCtx?: BlockHtmlStyleContext
): string {
  const styleAttr = buildStyleAttr(styleCtx);
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}${styleAttr}>${inlineTokensToHtml(block.tokens)}</h${block.level}>`;
        case 'paragraph':
          return `<p${styleAttr}>${inlineTokensToHtml(block.tokens)}</p>`;
        case 'blockquote':
          return `<blockquote${styleAttr}>${block.lines
            .map((line) => `<p>${inlineTokensToHtml(line)}</p>`)
            .join('')}</blockquote>`;
        case 'callout':
          return `<blockquote data-callout="${block.kind}"${styleAttr}>${block.lines
            .map((line) => `<p>${inlineTokensToHtml(line)}</p>`)
            .join('')}</blockquote>`;
        case 'ul':
          return `<ul${styleAttr}>${listItemsToHtml(block.items)}</ul>`;
        case 'ol':
          return `<ol${styleAttr}>${listItemsToHtml(block.items)}</ol>`;
        case 'codeblock':
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case 'math_block':
          return `<p${styleAttr}>$$${escapeHtml(block.formula)}$$</p>`;
        case 'image': {
          const safeSrc = isSafeUrl(block.src) ? escapeHtml(block.src) : '';
          const safeAlt = escapeHtml(block.alt);
          return safeSrc
            ? `<p${styleAttr}><img src="${safeSrc}" alt="${safeAlt}" /></p>`
            : '';
        }
        case 'video': {
          const safeSrc = escapeHtml(block.src);
          const safeTitle = escapeHtml(block.title);
          return `<figure data-video-embed="true" data-video-kind="${block.kind}" data-video-src="${safeSrc}" data-video-title="${safeTitle}" contenteditable="false"><span>Video: ${safeTitle}</span><span style="color: #71717A; font-family: monospace; font-size: 11px;">${safeSrc}</span></figure>`;
        }
        case 'aligned':
          return blocksToHtml(block.blocks, {
            align: block.align ?? styleCtx?.align,
            paddingLeft: block.paddingLeft ?? styleCtx?.paddingLeft,
            textIndent: block.textIndent ?? styleCtx?.textIndent,
          });
        case 'hr':
          return '<hr />';
      }
    })
    .join('');
}

export function markdownToSafeHtml(markdown: string): string {
  if (!markdown.trim()) return '';
  const blocks = parseMarkdownBlocks(markdown);
  return blocksToHtml(blocks);
}

function serializeInlineNode(node: Node, isLastChild = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return el.hasAttribute('data-explicit-br') || !isLastChild ? '<br />' : '';
  }

  if (tag === 'img') {
    const src = el.getAttribute('src')?.trim() ?? '';
    const alt = el.getAttribute('alt')?.trim() ?? '';
    return src && isSafeUrl(src) ? `![${alt}](${src})` : '';
  }

  const children = Array.from(el.childNodes);
  const inner = children
    .map((child, idx) => serializeInlineNode(child, idx === children.length - 1))
    .join('');

  switch (tag) {
    case 'strong':
    case 'b':
    case 'em':
    case 'i':
    case 'u':
    case 'font':
    case 'span': {
      const isSemanticTag = tag !== 'span' && tag !== 'font';
      const trimmed = inner.trim();
      if (!trimmed) return isSemanticTag ? '' : inner;

      const isUnderline =
        tag === 'u' ||
        /underline/i.test(
          el.style?.textDecoration || el.style?.textDecorationLine || ''
        );
      const isItalic =
        tag === 'em' || tag === 'i' || el.style?.fontStyle === 'italic';
      const isBold =
        tag === 'strong' ||
        tag === 'b' ||
        el.style?.fontWeight === 'bold' ||
        Number(el.style?.fontWeight) >= 600;
      const rawColor = el.style?.color || el.getAttribute('color') || '';
      const hex = rawColor ? normalizeColorToHex(rawColor) : null;

      if (!isBold && !isItalic && !isUnderline && !hex) {
        return inner;
      }

      const leading = inner.startsWith(' ') ? ' ' : '';
      const trailing = inner.endsWith(' ') ? ' ' : '';
      let output = trimmed;

      if (isItalic) {
        output = `_${output}_`;
      }
      if (isBold) {
        output = `**${output}**`;
      }
      if (hex && isUnderline) {
        output = `<span style="color: ${hex}; text-decoration: underline;">${output}</span>`;
      } else if (isUnderline) {
        output = `<span style="text-decoration: underline;">${output}</span>`;
      } else if (hex) {
        output = `<span style="color: ${hex}">${output}</span>`;
      }

      return `${leading}${output}${trailing}`;
    }
    case 'code': {
      const trimmed = inner.trim();
      return trimmed ? `\`${trimmed}\`` : '';
    }
    case 'a': {
      const href = el.getAttribute('href')?.trim() ?? '';
      const label = inner.trim() || href;
      if (!label) return '';
      return href && isSafeUrl(href) ? `[${label}](${href})` : label;
    }
    default:
      return inner;
  }
}

function getElementAlign(el: HTMLElement): TextAlign | null {
  const alignValue = (el.style?.textAlign || el.getAttribute('align') || '')
    .trim()
    .toLowerCase();
  if (alignValue === 'center' || alignValue === 'right') {
    return alignValue;
  }
  return null;
}

function getElementPaddingLeft(el: HTMLElement): string | null {
  const raw = (el.style?.paddingLeft || el.style?.marginLeft || '').trim();
  if (!raw || !isSafeCssLength(raw)) return null;
  if (/px$/i.test(raw)) {
    const rem = parseIndentRem(raw);
    return rem > 0 ? `${rem}rem` : null;
  }
  return raw;
}

function getElementTextIndent(el: HTMLElement): string | null {
  const raw = (el.style?.textIndent || '').trim();
  if (!raw || !isSafeCssLength(raw)) return null;
  return raw;
}

function wrapStyledMarkdown(
  styles: {
    align?: TextAlign | null;
    paddingLeft?: string | null;
    textIndent?: string | null;
  },
  content: string
): string {
  if (!content) return '';
  const parts: string[] = [];
  if (styles.align && styles.align !== 'left') {
    parts.push(`text-align: ${styles.align}`);
  }
  if (styles.paddingLeft) {
    parts.push(`padding-left: ${styles.paddingLeft}`);
  }
  if (styles.textIndent) {
    parts.push(`text-indent: ${styles.textIndent}`);
  }
  if (parts.length === 0) return content;
  return `<div style="${parts.join('; ')}">\n\n${content}\n\n</div>`;
}

function serializeListNode(listEl: HTMLElement, depth = 0): string {
  const tag = listEl.tagName.toLowerCase();
  const isOrdered = tag === 'ol';
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let itemIndex = 0;

  for (const child of Array.from(listEl.children)) {
    const childTag = child.tagName.toLowerCase();
    if (childTag === 'ul' || childTag === 'ol') {
      const nested = serializeListNode(child as HTMLElement, depth + 1);
      if (nested) lines.push(nested);
      continue;
    }
    if (childTag !== 'li') continue;

    itemIndex += 1;
    const inlineNodes: Node[] = [];
    const nestedLists: HTMLElement[] = [];

    for (const liChild of Array.from(child.childNodes)) {
      if (liChild.nodeType === Node.ELEMENT_NODE) {
        const subTag = (liChild as HTMLElement).tagName.toLowerCase();
        if (subTag === 'ul' || subTag === 'ol') {
          nestedLists.push(liChild as HTMLElement);
          continue;
        }
      }
      inlineNodes.push(liChild);
    }

    const text = inlineNodes
      .map((c, idx) => serializeInlineNode(c, idx === inlineNodes.length - 1))
      .join('')
      .trim();

    if (text) {
      const prefix = isOrdered ? `${itemIndex}. ` : '- ';
      lines.push(`${indent}${prefix}${text}`);
    }

    for (const sub of nestedLists) {
      const nested = serializeListNode(sub, depth + 1);
      if (nested) lines.push(nested);
    }
  }

  return lines.join('\n');
}

function serializeBlockNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00A0/g, ' ').trim();
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'hr') return '---';

  if (tag === 'figure' && el.getAttribute('data-video-embed') === 'true') {
    const kind = el.getAttribute('data-video-kind') === 'iframe' ? 'iframe' : 'video';
    const src = el.getAttribute('data-video-src') ?? '';
    const title = (el.getAttribute('data-video-title') ?? 'Embedded video').replace(
      /"/g,
      '&quot;'
    );
    if (!src) return '';
    if (kind === 'iframe' && isAllowedIframeSrc(src)) {
      return `<iframe src="${src}" title="${title}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`;
    }
    if (kind === 'video' && isSafeUrl(src)) {
      return `<video controls src="${src}" title="${title}"></video>`;
    }
    return '';
  }

  const align = getElementAlign(el);
  const paddingLeft = getElementPaddingLeft(el);
  const textIndent = getElementTextIndent(el);
  const blockStyles = { align, paddingLeft, textIndent };
  const blockHex = el.style?.color ? normalizeColorToHex(el.style.color) : null;
  const applyBlockColor = (text: string): string =>
    text && blockHex ? `<span style="color: ${blockHex}">${text}</span>` : text;

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = Number(tag[1]);
    const children = Array.from(el.childNodes);
    const text = applyBlockColor(
      children
        .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
        .join('')
        .trim()
    );
    const md = text ? `${'#'.repeat(level)} ${text}` : '';
    return wrapStyledMarkdown(blockStyles, md);
  }

  if (tag === 'blockquote') {
    const calloutAttr = el.getAttribute('data-callout')?.toLowerCase();
    const calloutTag =
      calloutAttr === 'note' ||
      calloutAttr === 'tip' ||
      calloutAttr === 'important' ||
      calloutAttr === 'warning' ||
      calloutAttr === 'caution'
        ? calloutAttr.toUpperCase()
        : null;

    const childBlocks = Array.from(el.childNodes)
      .map(serializeBlockNode)
      .filter(Boolean)
      .join('\n');
    const children = Array.from(el.childNodes);
    const fallback =
      childBlocks ||
      children
        .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
        .join('')
        .trim();

    if (!fallback && !calloutTag) return '';

    const bodyLines = (fallback || '')
      .split('\n')
      .map((line) => (line.trim() ? `> ${line.trim()}` : '>'));
    const md = calloutTag
      ? [`> [!${calloutTag}]`, ...bodyLines].join('\n')
      : bodyLines.join('\n');
    return wrapStyledMarkdown(blockStyles, md);
  }

  if (tag === 'ul' || tag === 'ol') {
    const serialized = serializeListNode(el, 0);
    return wrapStyledMarkdown(blockStyles, serialized);
  }

  if (tag === 'pre') {
    const codeText = el.textContent ?? '';
    return `\`\`\`\n${codeText.replace(/\n+$/, '')}\n\`\`\``;
  }

  if (tag === 'p' || tag === 'div') {
    const hasNestedBlocks = Array.from(el.children).some((child) =>
      [
        'p',
        'div',
        'h1',
        'h2',
        'h3',
        'ul',
        'ol',
        'blockquote',
        'pre',
        'hr',
        'figure',
      ].includes(child.tagName.toLowerCase())
    );
    if (hasNestedBlocks) {
      const inner = Array.from(el.childNodes)
        .map(serializeBlockNode)
        .filter(Boolean)
        .join('\n\n');
      return wrapStyledMarkdown(blockStyles, inner);
    }
    const children = Array.from(el.childNodes);
    const text = applyBlockColor(
      children
        .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
        .join('')
        .trim()
    );
    return wrapStyledMarkdown(blockStyles, text);
  }

  const children = Array.from(el.childNodes);
  return children
    .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
    .join('')
    .trim();
}

export function domToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = () => {
    const cleaned = inlineBuffer.trim();
    if (cleaned) blocks.push(cleaned);
    inlineBuffer = '';
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineBuffer += (child.textContent ?? '').replace(/\u00A0/g, ' ');
      continue;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      const isBlock = [
        'p',
        'div',
        'h1',
        'h2',
        'h3',
        'ul',
        'ol',
        'blockquote',
        'pre',
        'hr',
        'figure',
      ].includes(tag);

      if (isBlock) {
        flushInlineBuffer();
        const serialized = serializeBlockNode(child);
        if (serialized) blocks.push(serialized);
      } else {
        inlineBuffer += serializeInlineNode(child, false);
      }
    }
  }

  flushInlineBuffer();

  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyRawMarkdownFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: FormatAction,
  options?: {
    url?: string;
    label?: string;
    color?: string;
    formula?: string;
  }
): { nextValue: string; nextStart: number; nextEnd: number } {
  const selected = value.slice(selectionStart, selectionEnd);

  if (action === 'bold') {
    const inner = selected || 'bold text';
    const inserted = `**${inner}**`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + 2,
      nextEnd: selectionStart + 2 + inner.length,
    };
  }

  if (action === 'italic') {
    const inner = selected || 'italic text';
    const inserted = `_${inner}_`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + 1,
      nextEnd: selectionStart + 1 + inner.length,
    };
  }

  if (action === 'underline') {
    const unwrapMatch =
      /^<span\s+style=["']\s*text-decoration\s*:\s*underline\s*;?\s*["']\s*>([\s\S]*)<\/span>$/i.exec(
        selected
      );
    if (unwrapMatch) {
      const unwrapped = unwrapMatch[1];
      const nextValue =
        value.slice(0, selectionStart) + unwrapped + value.slice(selectionEnd);
      return {
        nextValue,
        nextStart: selectionStart,
        nextEnd: selectionStart + unwrapped.length,
      };
    }
    const inner = selected || 'underlined text';
    const prefix = '<span style="text-decoration: underline;">';
    const inserted = `${prefix}${inner}</span>`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + prefix.length,
      nextEnd: selectionStart + prefix.length + inner.length,
    };
  }

  if (action === 'link') {
    const label = (options?.label?.trim() || selected || 'link text').trim();
    const url = (options?.url?.trim() || 'https://').trim();
    const inserted = `[${label}](${url})`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + inserted.length,
      nextEnd: selectionStart + inserted.length,
    };
  }

  if (action === 'image') {
    const alt = (options?.label?.trim() || selected || 'Image description').trim();
    const url = (options?.url?.trim() || 'https://').trim();
    const inserted = `![${alt}](${url})`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + inserted.length,
      nextEnd: selectionStart + inserted.length,
    };
  }

  if (action === 'video') {
    const embed =
      buildVideoMarkdown(options?.url ?? '', options?.label) ||
      `<video controls src="${options?.url?.trim() || ''}"></video>`;
    const prefix = selectionStart > 0 && value[selectionStart - 1] !== '\n' ? '\n\n' : '';
    const suffix = selectionEnd < value.length && value[selectionEnd] !== '\n' ? '\n\n' : '';
    const inserted = `${prefix}${embed}${suffix}`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + inserted.length,
      nextEnd: selectionStart + inserted.length,
    };
  }

  if (action === 'color') {
    const hex =
      options?.color && isSafeHexColor(options.color)
        ? options.color.toLowerCase()
        : '#2d1f3d';
    const cleanSelected = selected.replace(
      /^<span\s+style=["']\s*color:\s*#[0-9a-fA-F]{3,8}\s*;?\s*["']\s*>([\s\S]*)<\/span>$/i,
      '$1'
    );
    const inner = cleanSelected || 'colored text';
    const inserted = `<span style="color: ${hex}">${inner}</span>`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    const prefixLen = `<span style="color: ${hex}">`.length;
    return {
      nextValue,
      nextStart: selectionStart + prefixLen,
      nextEnd: selectionStart + prefixLen + inner.length,
    };
  }

  if (action === 'clearColor') {
    const stripped = selected.replace(
      /<span\s+style=["']\s*color:\s*#[0-9a-fA-F]{3,8}\s*;?\s*["']\s*>([\s\S]*?)<\/span>/gi,
      '$1'
    );
    const nextValue =
      value.slice(0, selectionStart) + stripped + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart,
      nextEnd: selectionStart + stripped.length,
    };
  }

  if (action === 'hr') {
    const prefix = selectionStart > 0 && value[selectionStart - 1] !== '\n' ? '\n\n' : '';
    const inserted = `${prefix}---\n\n`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + inserted.length,
      nextEnd: selectionStart + inserted.length,
    };
  }

  if (action === 'mathInline') {
    const inner = (options?.formula ?? selected) || 'E = mc^2';
    const inserted = `$${inner}$`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + 1,
      nextEnd: selectionStart + 1 + inner.length,
    };
  }

  if (action === 'mathBlock') {
    const inner =
      (options?.formula ?? selected) ||
      '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}';
    const prefix = selectionStart > 0 && value[selectionStart - 1] !== '\n' ? '\n\n' : '';
    const suffix = selectionEnd < value.length && value[selectionEnd] !== '\n' ? '\n\n' : '';
    const inserted = `${prefix}$$\n${inner}\n$$${suffix}`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    const offset = prefix.length + 3;
    return {
      nextValue,
      nextStart: selectionStart + offset,
      nextEnd: selectionStart + offset + inner.length,
    };
  }

  // Line/block-based transformations: headings, lists, blockquotes, alignment
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const blockSlice = value.slice(lineStart, lineEnd);

  if (
    action === 'alignLeft' ||
    action === 'alignCenter' ||
    action === 'alignRight'
  ) {
    const unwrapped = blockSlice
      .replace(
        /^<(?:div|p)\s+(?:style=["']\s*text-align:\s*(?:left|center|right)\s*;?\s*["']|align=["'](?:left|center|right)["'])\s*>\s*\n*/i,
        ''
      )
      .replace(/\n*<\/(?:div|p)>$/i, '')
      .trim();
    const content = unwrapped || 'Aligned text';
    const replacement =
      action === 'alignLeft'
        ? content
        : `<div style="text-align: ${action === 'alignCenter' ? 'center' : 'right'}">\n\n${content}\n\n</div>`;
    const nextValue =
      value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    return {
      nextValue,
      nextStart: lineStart,
      nextEnd: lineStart + replacement.length,
    };
  }

  const lines = blockSlice.split('\n');
  let transformedLines: string[] = lines;

  if (action === 'h1' || action === 'h2' || action === 'h3') {
    const prefix = action === 'h1' ? '# ' : action === 'h2' ? '## ' : '### ';
    transformedLines = lines.map((line) => {
      const stripped = line.replace(/^#{1,6}\s+/, '');
      return `${prefix}${stripped || 'Heading'}`;
    });
  } else if (action === 'ul') {
    transformedLines = lines.map((line) => {
      const stripped = line.replace(/^([-*+]|\d+\.)\s+/, '');
      return `- ${stripped || 'List item'}`;
    });
  } else if (action === 'ol') {
    transformedLines = lines.map((line, idx) => {
      const stripped = line.replace(/^([-*+]|\d+\.)\s+/, '');
      return `${idx + 1}. ${stripped || 'List item'}`;
    });
  } else if (action === 'blockquote') {
    transformedLines = lines.map((line) => {
      const stripped = line.replace(/^>\s?/, '');
      return `> ${stripped || 'Quote'}`;
    });
  } else if (
    action === 'calloutNote' ||
    action === 'calloutTip' ||
    action === 'calloutImportant' ||
    action === 'calloutWarning' ||
    action === 'calloutCaution'
  ) {
    const tag =
      action === 'calloutNote'
        ? 'NOTE'
        : action === 'calloutTip'
          ? 'TIP'
          : action === 'calloutImportant'
            ? 'IMPORTANT'
            : action === 'calloutWarning'
              ? 'WARNING'
              : 'CAUTION';
    const placeholder =
      action === 'calloutNote'
        ? 'Useful information readers should know.'
        : action === 'calloutTip'
          ? 'Helpful advice for doing things better or more easily.'
          : action === 'calloutImportant'
            ? 'Key information readers need to know.'
            : action === 'calloutWarning'
              ? 'Urgent info that needs immediate attention to avoid problems.'
              : 'Advises about risks or negative outcomes of certain actions.';
    const cleaned = lines
      .map((line) =>
        line
          .replace(/^>\s*/, '')
          .replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '')
          .trim()
      )
      .filter(Boolean);
    const bodyLines = cleaned.length > 0 ? cleaned : [placeholder];
    const replacement = `> [!${tag}]\n${bodyLines.map((l) => `> ${l}`).join('\n')}`;
    const nextValue =
      value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    return {
      nextValue,
      nextStart: lineStart + `> [!${tag}]\n> `.length,
      nextEnd: lineStart + replacement.length,
    };
  }

  const replacement = transformedLines.join('\n');
  const nextValue =
    value.slice(0, lineStart) + replacement + value.slice(lineEnd);
  return {
    nextValue,
    nextStart: lineStart,
    nextEnd: lineStart + replacement.length,
  };
}

export function applyRawTabIndent(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  isShift: boolean
): { nextValue: string; nextStart: number; nextEnd: number; handled: boolean } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

  // Check if inside a fenced code block (``` ... ```)
  const beforeCursor = value.slice(0, lineStart);
  const fenceMatches = beforeCursor.match(/^```/gm);
  const inFencedCode = Boolean(fenceMatches && fenceMatches.length % 2 === 1);

  const selectedBlock = value.slice(lineStart, lineEnd);
  const selectedLines = selectedBlock.split('\n');
  const listLineRe = /^(?: *|\t*)(?:[-*+]|\d+\.)\s+/;
  const nonEmptyLines = selectedLines.filter((l) => l.trim().length > 0);
  const isListSelection =
    nonEmptyLines.length > 0 && nonEmptyLines.every((l) => listLineRe.test(l));

  // 1. Inside fenced code block OR on list item line(s): 2-space indent/outdent
  if (inFencedCode || isListSelection) {
    if (!isShift) {
      const indented = selectedLines
        .map((l) => (l.length > 0 || selectedLines.length === 1 ? `  ${l}` : l))
        .join('\n');
      const nextValue =
        value.slice(0, lineStart) + indented + value.slice(lineEnd);
      const addedChars = indented.length - selectedBlock.length;
      const firstLineShift =
        selectedLines[0].length > 0 || selectedLines.length === 1 ? 2 : 0;
      return {
        nextValue,
        nextStart: selectionStart + firstLineShift,
        nextEnd: selectionEnd + addedChars,
        handled: true,
      };
    } else {
      let removedFirst = 0;
      let removedTotal = 0;
      const outdented = selectedLines
        .map((l, idx) => {
          const m = /^( {1,2}|\t)/.exec(l);
          if (!m) return l;
          const len = m[1].length;
          if (idx === 0) removedFirst = len;
          removedTotal += len;
          return l.slice(len);
        })
        .join('\n');
      if (removedTotal === 0) {
        return {
          nextValue: value,
          nextStart: selectionStart,
          nextEnd: selectionEnd,
          handled: true,
        };
      }
      const nextValue =
        value.slice(0, lineStart) + outdented + value.slice(lineEnd);
      const nextStart = Math.max(lineStart, selectionStart - removedFirst);
      const nextEnd = Math.max(nextStart, selectionEnd - removedTotal);
      return { nextValue, nextStart, nextEnd, handled: true };
    }
  }

  // 2. Check if cursor/selection is inside or on an existing <div style="..."> or <p style="...">
  const findEnclosingStyledWrapper = (): {
    tag: 'div' | 'p';
    openStart: number;
    openEnd: number;
    attrs: string;
    closeStart: number;
    closeEnd: number;
  } | null => {
    // Check if the selected slice itself starts with an open wrapper and ends with its close tag
    const selfOpen = /^<(div|p)\s+([^>]+)>/i.exec(selectedBlock.trim());
    if (selfOpen) {
      const tag = selfOpen[1].toLowerCase() as 'div' | 'p';
      const leadingWs = selectedBlock.length - selectedBlock.trimStart().length;
      const openStart = lineStart + leadingWs;
      const openEnd = openStart + selfOpen[0].length;
      const closeRe = new RegExp(`</${tag}>\\s*$`, 'i');
      const closeM = closeRe.exec(selectedBlock);
      if (closeM) {
        const closeStart = lineStart + closeM.index;
        const closeEnd = lineEnd;
        return {
          tag,
          openStart,
          openEnd,
          attrs: selfOpen[2],
          closeStart,
          closeEnd,
        };
      }
    }

    // Otherwise scan backwards for an unclosed <div style="..."> or <p style="...">
    const prefixText = value.slice(0, lineStart);
    const tagRe = /<(div|p)\s+([^>]+)>|<\/(div|p)>/gi;
    const stack: Array<{
      tag: 'div' | 'p';
      openStart: number;
      openEnd: number;
      attrs: string;
    }> = [];
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(prefixText)) !== null) {
      if (m[1]) {
        stack.push({
          tag: m[1].toLowerCase() as 'div' | 'p',
          openStart: m.index,
          openEnd: tagRe.lastIndex,
          attrs: m[2],
        });
      } else if (m[3]) {
        const closingTag = m[3].toLowerCase();
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].tag === closingTag) {
            stack.splice(s, 1);
            break;
          }
        }
      }
    }

    if (stack.length === 0) return null;
    const candidate = stack[stack.length - 1];
    const closeTagRe = new RegExp(`</${candidate.tag}>`, 'i');
    const afterOpen = value.slice(lineEnd);
    const closeMatch = closeTagRe.exec(afterOpen);
    if (!closeMatch) return null;

    return {
      tag: candidate.tag,
      openStart: candidate.openStart,
      openEnd: candidate.openEnd,
      attrs: candidate.attrs,
      closeStart: lineEnd + closeMatch.index,
      closeEnd: lineEnd + closeMatch.index + closeMatch[0].length,
    };
  };

  const updateIndentInAttrs = (
    attrs: string,
    applyIndent: boolean
  ): { nextTagAttrs: string | null; changed: boolean } => {
    const existingStyle = getAttr(attrs, 'style') ?? '';
    const decls: Array<[string, string]> = [];
    for (const part of existingStyle.split(';')) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = part.slice(0, colonIdx).trim().toLowerCase();
      const val = part.slice(colonIdx + 1).trim();
      if (prop && val) decls.push([prop, val]);
    }

    const indentIdx = decls.findIndex(([prop]) => prop === 'text-indent');
    let changed = false;

    if (applyIndent) {
      if (indentIdx !== -1) {
        if (decls[indentIdx][1] !== '2em') {
          decls[indentIdx] = ['text-indent', '2em'];
          changed = true;
        }
      } else {
        decls.push(['text-indent', '2em']);
        changed = true;
      }
    } else {
      for (let idx = decls.length - 1; idx >= 0; idx--) {
        const prop = decls[idx][0];
        if (prop === 'text-indent' || prop === 'padding-left' || prop === 'margin-left') {
          decls.splice(idx, 1);
          changed = true;
        }
      }
      if (!changed) {
        return { nextTagAttrs: attrs, changed: false };
      }
    }

    if (!changed) {
      return { nextTagAttrs: attrs, changed: false };
    }

    const remainingAttrs = attrs
      .replace(/style\s*=\s*(?:"[^"]*"|'[^']*')/i, '')
      .trim();

    if (decls.length === 0) {
      if (!remainingAttrs) {
        return { nextTagAttrs: null, changed: true };
      }
      return { nextTagAttrs: remainingAttrs, changed: true };
    }

    const nextStyle = decls.map(([k, v]) => `${k}: ${v}`).join('; ');
    const nextAttrs = remainingAttrs
      ? `${remainingAttrs} style="${nextStyle}"`
      : `style="${nextStyle}"`;
    return { nextTagAttrs: nextAttrs, changed: true };
  };

  const wrapper = findEnclosingStyledWrapper();
  if (wrapper) {
    const { nextTagAttrs, changed } = updateIndentInAttrs(wrapper.attrs, !isShift);
    if (!changed) {
      return {
        nextValue: value,
        nextStart: selectionStart,
        nextEnd: selectionEnd,
        handled: true,
      };
    }

    if (nextTagAttrs === null) {
      // Unwrap the <div style="...">...</div> cleanly
      const rawInner = value.slice(wrapper.openEnd, wrapper.closeStart);
      const leadingTrimMatch = /^\n{1,2}/.exec(rawInner);
      const trailingTrimMatch = /\n{1,2}$/.exec(rawInner);
      const leadLen = leadingTrimMatch ? leadingTrimMatch[0].length : 0;
      const trailLen = trailingTrimMatch ? trailingTrimMatch[0].length : 0;
      const inner = rawInner.slice(leadLen, rawInner.length - trailLen);

      const nextValue =
        value.slice(0, wrapper.openStart) + inner + value.slice(wrapper.closeEnd);
      const removedBefore = wrapper.openEnd - wrapper.openStart + leadLen;
      const nextStart = Math.max(wrapper.openStart, selectionStart - removedBefore);
      const nextEnd = Math.max(nextStart, selectionEnd - removedBefore);
      return { nextValue, nextStart, nextEnd, handled: true };
    }

    const nextOpenTag = `<${wrapper.tag} ${nextTagAttrs}>`;
    const oldOpenLen = wrapper.openEnd - wrapper.openStart;
    const diff = nextOpenTag.length - oldOpenLen;
    const nextValue =
      value.slice(0, wrapper.openStart) +
      nextOpenTag +
      value.slice(wrapper.openEnd);

    const nextStart =
      selectionStart >= wrapper.openEnd ? selectionStart + diff : selectionStart;
    const nextEnd =
      selectionEnd >= wrapper.openEnd ? selectionEnd + diff : selectionEnd;
    return { nextValue, nextStart, nextEnd, handled: true };
  }

  // 3. Plain paragraph without wrapper
  if (isShift) {
    return {
      nextValue: value,
      nextStart: selectionStart,
      nextEnd: selectionEnd,
      handled: true,
    };
  }

  // Expand to full contiguous non-empty paragraph if cursor is collapsed inside plain lines
  let paraStart = lineStart;
  let paraEnd = lineEnd;
  if (selectionStart === selectionEnd && selectedBlock.trim().length > 0) {
    while (paraStart > 0) {
      const prevNl = value.lastIndexOf('\n', paraStart - 2);
      const prevLineStart = prevNl === -1 ? 0 : prevNl + 1;
      const prevLine = value.slice(prevLineStart, paraStart - 1);
      if (
        prevLine.trim() === '' ||
        /^(#{1,3}\s+|>\s?|[-*+]\s+|\d+\.\s+|```|\$\$|<\/?(?:div|p|iframe|video)|-{3,}$|\*{3,}$)/.test(
          prevLine.trim()
        )
      ) {
        break;
      }
      paraStart = prevLineStart;
    }
    while (paraEnd < value.length) {
      const nextNl = value.indexOf('\n', paraEnd + 1);
      const nextLineEnd = nextNl === -1 ? value.length : nextNl;
      const nextLine = value.slice(paraEnd + 1, nextLineEnd);
      if (
        nextLine.trim() === '' ||
        /^(#{1,3}\s+|>\s?|[-*+]\s+|\d+\.\s+|```|\$\$|<\/?(?:div|p|iframe|video)|-{3,}$|\*{3,}$)/.test(
          nextLine.trim()
        )
      ) {
        break;
      }
      paraEnd = nextLineEnd;
    }
  }

  const paraContent = value.slice(paraStart, paraEnd);
  const openTag = '<div style="text-indent: 2em">\n\n';
  const closeTag = '\n\n</div>';

  if (paraContent.trim() === '') {
    const inserted = `${openTag}${closeTag}`;
    const nextValue = value.slice(0, paraStart) + inserted + value.slice(paraEnd);
    const caret = paraStart + openTag.length;
    return { nextValue, nextStart: caret, nextEnd: caret, handled: true };
  }

  const inserted = `${openTag}${paraContent}${closeTag}`;
  const nextValue = value.slice(0, paraStart) + inserted + value.slice(paraEnd);
  return {
    nextValue,
    nextStart: selectionStart + openTag.length,
    nextEnd: selectionEnd + openTag.length,
    handled: true,
  };
}

export function applyRawEnterReset(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { nextValue: string; nextStart: number; nextEnd: number; handled: boolean } {
  const prefixText = value.slice(0, selectionStart);
  const tagRe = /<(div|p)\s+([^>]+)>|<\/(div|p)>/gi;
  const stack: Array<{
    tag: 'div' | 'p';
    openStart: number;
    openEnd: number;
    attrs: string;
  }> = [];
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(prefixText)) !== null) {
    if (m[1]) {
      stack.push({
        tag: m[1].toLowerCase() as 'div' | 'p',
        openStart: m.index,
        openEnd: tagRe.lastIndex,
        attrs: m[2],
      });
    } else if (m[3]) {
      const closingTag = m[3].toLowerCase();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].tag === closingTag) {
          stack.splice(s, 1);
          break;
        }
      }
    }
  }

  if (stack.length === 0) {
    return { nextValue: value, nextStart: selectionStart, nextEnd: selectionEnd, handled: false };
  }

  const candidate = stack[stack.length - 1];
  const styles = extractBlockStylesFromTag(candidate.attrs);
  if (!styles.textIndent && !styles.paddingLeft) {
    return { nextValue: value, nextStart: selectionStart, nextEnd: selectionEnd, handled: false };
  }

  const closeTagRe = new RegExp(`</${candidate.tag}>`, 'i');
  const afterSel = value.slice(selectionEnd);
  const closeMatch = closeTagRe.exec(afterSel);
  if (!closeMatch) {
    return { nextValue: value, nextStart: selectionStart, nextEnd: selectionEnd, handled: false };
  }

  const closeStart = selectionEnd + closeMatch.index;
  const closeEnd = closeStart + closeMatch[0].length;
  const beforeCaret = value.slice(candidate.openEnd, selectionStart);
  const afterCaret = value.slice(selectionEnd, closeStart);

  const rawClose =
    candidate.tag === 'div'
      ? `${beforeCaret.replace(/\s+$/, '')}\n\n</div>`
      : `${beforeCaret.replace(/\s+$/, '')}</p>`;

  const trailingRest = value.slice(closeEnd).replace(/^\n+/, '');
  const nextStyleParts: string[] = [];
  if (styles.align && styles.align !== 'left') {
    nextStyleParts.push(`text-align: ${styles.align}`);
  }
  const hasRemainingWrapper = nextStyleParts.length > 0;
  const nextOpen = hasRemainingWrapper
    ? `<${candidate.tag} style="${nextStyleParts.join('; ')}">${candidate.tag === 'div' ? '\n\n' : ''}`
    : '';
  const nextClose = hasRemainingWrapper
    ? `${candidate.tag === 'div' ? '\n\n' : ''}</${candidate.tag}>`
    : '';

  const afterTrimmed = afterCaret.trim();
  const separator = '\n\n';
  const afterSection = afterTrimmed
    ? `${nextOpen}${afterTrimmed}${nextClose}`
    : `${nextOpen}${nextClose}`;

  const suffix = trailingRest
    ? `\n\n${trailingRest}`
    : '';

  const replacement = `${rawClose}${separator}${afterSection}${suffix}`;
  const nextValue =
    value.slice(0, candidate.openEnd) + replacement + value.slice(closeEnd + (value.slice(closeEnd).length - trailingRest.length));

  const caretOffset = candidate.openEnd + rawClose.length + separator.length + nextOpen.length;
  return {
    nextValue,
    nextStart: caretOffset,
    nextEnd: caretOffset,
    handled: true,
  };
}

export function calculateReadingStats(markdown: string): {
  words: number;
  minutes: number;
} {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`[\]()$-]/g, ' ')
    .trim();
  if (!plain) return { words: 0, minutes: 0 };
  const words = plain.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return { words, minutes };
}
