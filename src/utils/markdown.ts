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
  | 'br'
  | 'image'
  | 'video'
  | 'mathInline'
  | 'mathBlock'
  | 'calloutNote'
  | 'calloutTip'
  | 'calloutImportant';

export type TextAlign = 'left' | 'center' | 'right';
export type CalloutKind = 'note' | 'tip' | 'important';

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

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; tokens: InlineToken[]; align?: TextAlign }
  | { type: 'paragraph'; tokens: InlineToken[]; align?: TextAlign }
  | { type: 'blockquote'; lines: InlineToken[][] }
  | { type: 'callout'; kind: CalloutKind; lines: InlineToken[][] }
  | { type: 'ul'; items: InlineToken[][] }
  | { type: 'ol'; items: InlineToken[][] }
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
  | { type: 'aligned'; align: TextAlign; blocks: MarkdownBlock[] }
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
    /(<br\s*\/?>|<span\s+style=["']([^"']+)["']\s*>([\s\S]*?)<\/span>|<u>([\s\S]*?)<\/u>|<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>|<(?:em|i)>([\s\S]*?)<\/(?:em|i)>|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\$(?!\$)([^\n$]+?)\$|\*\*\*([^\n*]+?)\*\*\*|___([^\n_]+?)___|(?:\*\*([^\n]+?)\*\*)|(?:(?<![\w\\])_([^\n_]+?)_(?!\w))|(?:(?<!\*)\*(?!\*)([^\n*]+?)(?<!\*)\*(?!\*)))/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const full = match[0];

    if (/^<br\s*\/?>$/i.test(full)) {
      tokens.push({ type: 'br', text: '' });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const styleStr = match[2];
      const inner = match[3];
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
    } else if (match[4] !== undefined) {
      tokens.push({
        type: 'underline',
        text: match[4],
        children: parseInlineMarkdown(match[4], depth + 1),
      });
    } else if (match[5] !== undefined) {
      tokens.push({
        type: 'bold',
        text: match[5],
        children: parseInlineMarkdown(match[5], depth + 1),
      });
    } else if (match[6] !== undefined) {
      tokens.push({
        type: 'italic',
        text: match[6],
        children: parseInlineMarkdown(match[6], depth + 1),
      });
    } else if (match[7] !== undefined && match[8] !== undefined) {
      const src = match[8].trim();
      tokens.push({
        type: 'image',
        text: match[7],
        alt: match[7],
        src: isSafeUrl(src) ? src : '',
      });
    } else if (match[9] !== undefined && match[10] !== undefined) {
      const href = match[10].trim();
      tokens.push({
        type: 'link',
        text: match[9],
        href: isSafeUrl(href) ? href : '#',
        children: parseInlineMarkdown(match[9], depth + 1),
      });
    } else if (match[11] !== undefined) {
      tokens.push({ type: 'code', text: match[11] });
    } else if (match[12] !== undefined) {
      tokens.push({ type: 'math_inline', text: match[12].trim() });
    } else if (match[13] !== undefined || match[14] !== undefined) {
      const inner = match[13] ?? match[14];
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
    } else if (match[15] !== undefined) {
      tokens.push({
        type: 'bold',
        text: match[15],
        children: parseInlineMarkdown(match[15], depth + 1),
      });
    } else if (match[16] !== undefined || match[17] !== undefined) {
      const inner = match[16] ?? match[17];
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

    // Aligned wrapper <div style="text-align: ..."> or <div align="..."> or <p style="text-align: ...">
    const alignedOpenMatch = /^<(div|p)\s+([^>]+)>(.*)$/i.exec(trimmed);
    if (alignedOpenMatch) {
      const tagName = alignedOpenMatch[1].toLowerCase() as 'div' | 'p';
      const align = extractAlignFromTag(alignedOpenMatch[2]);
      if (align) {
        const { innerMarkdown, endLineIdx } = findMatchingClosingTag(
          lines,
          i,
          tagName,
          alignedOpenMatch[3] ?? ''
        );
        const innerBlocks = parseMarkdownBlocks(innerMarkdown);
        if (innerBlocks.length > 0) {
          blocks.push({ type: 'aligned', align, blocks: innerBlocks });
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

    // Blockquote & GFM Callouts ([!NOTE], [!TIP], [!IMPORTANT])
    if (trimmed.startsWith('>')) {
      const rawQuoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        rawQuoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }

      const firstLine = rawQuoteLines[0]?.trim() ?? '';
      const calloutMatch = /^\[!(NOTE|TIP|IMPORTANT)\]\s*(.*)$/i.exec(firstLine);
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

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push(parseInlineMarkdown(content));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(parseInlineMarkdown(content));
        i++;
      }
      blocks.push({ type: 'ol', items });
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

function blocksToHtml(blocks: MarkdownBlock[], align?: TextAlign): string {
  const alignAttr = align ? ` style="text-align: ${align}"` : '';
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}${alignAttr}>${inlineTokensToHtml(block.tokens)}</h${block.level}>`;
        case 'paragraph':
          return `<p${alignAttr}>${inlineTokensToHtml(block.tokens)}</p>`;
        case 'blockquote':
          return `<blockquote${alignAttr}>${block.lines
            .map((line) => `<p>${inlineTokensToHtml(line)}</p>`)
            .join('')}</blockquote>`;
        case 'callout':
          return `<blockquote data-callout="${block.kind}"${alignAttr}>${block.lines
            .map((line) => `<p>${inlineTokensToHtml(line)}</p>`)
            .join('')}</blockquote>`;
        case 'ul':
          return `<ul${alignAttr}>${block.items
            .map((item) => `<li>${inlineTokensToHtml(item)}</li>`)
            .join('')}</ul>`;
        case 'ol':
          return `<ol${alignAttr}>${block.items
            .map((item) => `<li>${inlineTokensToHtml(item)}</li>`)
            .join('')}</ol>`;
        case 'codeblock':
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case 'math_block':
          return `<p${alignAttr}>$$${escapeHtml(block.formula)}$$</p>`;
        case 'image': {
          const safeSrc = isSafeUrl(block.src) ? escapeHtml(block.src) : '';
          const safeAlt = escapeHtml(block.alt);
          return safeSrc
            ? `<p${alignAttr}><img src="${safeSrc}" alt="${safeAlt}" /></p>`
            : '';
        }
        case 'video': {
          const safeSrc = escapeHtml(block.src);
          const safeTitle = escapeHtml(block.title);
          return `<figure data-video-embed="true" data-video-kind="${block.kind}" data-video-src="${safeSrc}" data-video-title="${safeTitle}" contenteditable="false"><span>Video: ${safeTitle}</span><span style="color: #71717A; font-family: monospace; font-size: 11px;">${safeSrc}</span></figure>`;
        }
        case 'aligned':
          return blocksToHtml(block.blocks, block.align);
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
    case 'b': {
      const trimmed = inner.trim();
      if (!trimmed) return '';
      const leading = inner.startsWith(' ') ? ' ' : '';
      const trailing = inner.endsWith(' ') ? ' ' : '';
      return `${leading}**${trimmed}**${trailing}`;
    }
    case 'em':
    case 'i': {
      const trimmed = inner.trim();
      if (!trimmed) return '';
      const leading = inner.startsWith(' ') ? ' ' : '';
      const trailing = inner.endsWith(' ') ? ' ' : '';
      return `${leading}_${trimmed}_${trailing}`;
    }
    case 'u': {
      const trimmed = inner.trim();
      if (!trimmed) return '';
      const leading = inner.startsWith(' ') ? ' ' : '';
      const trailing = inner.endsWith(' ') ? ' ' : '';
      return `${leading}<span style="text-decoration: underline;">${trimmed}</span>${trailing}`;
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
    case 'font':
    case 'span': {
      if (!inner.trim()) return inner;
      let output = inner;
      const isUnderline = /underline/i.test(
        el.style?.textDecoration || el.style?.textDecorationLine || ''
      );
      const isItalic = el.style?.fontStyle === 'italic';
      const isBold =
        el.style?.fontWeight === 'bold' ||
        Number(el.style?.fontWeight) >= 600;
      const rawColor = el.style?.color || el.getAttribute('color') || '';
      const hex = rawColor ? normalizeColorToHex(rawColor) : null;

      if (isItalic) {
        output = `_${output.trim()}_`;
      }
      if (isBold) {
        output = `**${output.trim()}**`;
      }
      if (isUnderline) {
        output = `<span style="text-decoration: underline;">${output}</span>`;
      }
      if (hex) {
        output = `<span style="color: ${hex}">${output}</span>`;
      }
      return output;
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

function wrapAlignedMarkdown(align: TextAlign | null, content: string): string {
  if (!content) return '';
  if (!align || align === 'left') return content;
  return `<div style="text-align: ${align}">\n\n${content}\n\n</div>`;
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

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = Number(tag[1]);
    const children = Array.from(el.childNodes);
    const text = children
      .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
      .join('')
      .trim();
    const md = text ? `${'#'.repeat(level)} ${text}` : '';
    return wrapAlignedMarkdown(align, md);
  }

  if (tag === 'blockquote') {
    const calloutAttr = el.getAttribute('data-callout')?.toLowerCase();
    const calloutTag =
      calloutAttr === 'note' || calloutAttr === 'tip' || calloutAttr === 'important'
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
    return wrapAlignedMarkdown(align, md);
  }

  if (tag === 'ul') {
    const items = Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((li) => {
        const children = Array.from(li.childNodes);
        const text = children
          .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
          .join('')
          .trim();
        return text ? `- ${text}` : '';
      })
      .filter(Boolean);
    return wrapAlignedMarkdown(align, items.join('\n'));
  }

  if (tag === 'ol') {
    const items = Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((li, index) => {
        const children = Array.from(li.childNodes);
        const text = children
          .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
          .join('')
          .trim();
        return text ? `${index + 1}. ${text}` : '';
      })
      .filter(Boolean);
    return wrapAlignedMarkdown(align, items.join('\n'));
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
      return wrapAlignedMarkdown(align, inner);
    }
    const children = Array.from(el.childNodes);
    const text = children
      .map((c, idx) => serializeInlineNode(c, idx === children.length - 1))
      .join('')
      .trim();
    return wrapAlignedMarkdown(align, text);
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

  if (action === 'br') {
    const inserted = '<br />';
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
    action === 'calloutImportant'
  ) {
    const tag =
      action === 'calloutNote'
        ? 'NOTE'
        : action === 'calloutTip'
          ? 'TIP'
          : 'IMPORTANT';
    const placeholder =
      action === 'calloutNote'
        ? 'Useful information readers should know.'
        : action === 'calloutTip'
          ? 'Helpful advice for doing things better or more easily.'
          : 'Key information readers need to know.';
    const cleaned = lines
      .map((line) =>
        line
          .replace(/^>\s*/, '')
          .replace(/^\[!(NOTE|TIP|IMPORTANT)\]\s*/i, '')
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
