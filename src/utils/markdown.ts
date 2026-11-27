export type FormatAction =
  | 'bold'
  | 'italic'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'link'
  | 'blockquote';

export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  text: string;
  href?: string;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; tokens: InlineToken[] }
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'blockquote'; lines: InlineToken[][] }
  | { type: 'ul'; items: InlineToken[][] }
  | { type: 'ol'; items: InlineToken[][] }
  | { type: 'codeblock'; lang: string; code: string }
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

export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined && match[3] !== undefined) {
      const href = match[3].trim();
      tokens.push({
        type: 'link',
        text: match[2],
        href: isSafeUrl(href) ? href : '#',
      });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'code', text: match[4] });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      tokens.push({ type: 'bold', text: match[5] ?? match[6] });
    } else if (match[7] !== undefined || match[8] !== undefined) {
      tokens.push({ type: 'italic', text: match[7] ?? match[8] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text }];
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

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: InlineToken[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const content = lines[i].trim().replace(/^>\s?/, '');
        if (content) {
          quoteLines.push(parseInlineMarkdown(content));
        }
        i++;
      }
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
      !/^(#{1,3}\s+|>\s?|[-*+]\s+|\d+\.\s+|```|-{3,}$|\*{3,}$)/.test(
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
      switch (tok.type) {
        case 'bold':
          return `<strong>${safe}</strong>`;
        case 'italic':
          return `<em>${safe}</em>`;
        case 'code':
          return `<code>${safe}</code>`;
        case 'link': {
          const safeHref = tok.href && isSafeUrl(tok.href) ? escapeHtml(tok.href) : '#';
          return `<a href="${safeHref}">${safe}</a>`;
        }
        default:
          return safe;
      }
    })
    .join('');
}

export function markdownToSafeHtml(markdown: string): string {
  if (!markdown.trim()) return '';
  const blocks = parseMarkdownBlocks(markdown);
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${inlineTokensToHtml(block.tokens)}</h${block.level}>`;
        case 'paragraph':
          return `<p>${inlineTokensToHtml(block.tokens)}</p>`;
        case 'blockquote':
          return `<blockquote>${block.lines
            .map((line) => `<p>${inlineTokensToHtml(line)}</p>`)
            .join('')}</blockquote>`;
        case 'ul':
          return `<ul>${block.items
            .map((item) => `<li>${inlineTokensToHtml(item)}</li>`)
            .join('')}</ul>`;
        case 'ol':
          return `<ol>${block.items
            .map((item) => `<li>${inlineTokensToHtml(item)}</li>`)
            .join('')}</ol>`;
        case 'codeblock':
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case 'hr':
          return '<hr />';
      }
    })
    .join('');
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  const inner = Array.from(el.childNodes).map(serializeInlineNode).join('');

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
      return `${leading}*${trimmed}*${trailing}`;
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

function serializeBlockNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\u00A0/g, ' ').trim();
    return text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'hr') return '---';

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const level = Number(tag[1]);
    const text = Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  if (tag === 'blockquote') {
    const childBlocks = Array.from(el.childNodes)
      .map(serializeBlockNode)
      .filter(Boolean)
      .join('\n');
    const fallback = childBlocks || Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
    if (!fallback) return '';
    return fallback
      .split('\n')
      .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
      .join('\n');
  }

  if (tag === 'ul') {
    const items = Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((li) => {
        const text = Array.from(li.childNodes).map(serializeInlineNode).join('').trim();
        return text ? `- ${text}` : '';
      })
      .filter(Boolean);
    return items.join('\n');
  }

  if (tag === 'ol') {
    const items = Array.from(el.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((li, index) => {
        const text = Array.from(li.childNodes).map(serializeInlineNode).join('').trim();
        return text ? `${index + 1}. ${text}` : '';
      })
      .filter(Boolean);
    return items.join('\n');
  }

  if (tag === 'pre') {
    const codeText = el.textContent ?? '';
    return `\`\`\`\n${codeText.replace(/\n+$/, '')}\n\`\`\``;
  }

  if (tag === 'p' || tag === 'div') {
    const hasNestedBlocks = Array.from(el.children).some((child) =>
      ['p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'pre'].includes(
        child.tagName.toLowerCase()
      )
    );
    if (hasNestedBlocks) {
      return Array.from(el.childNodes)
        .map(serializeBlockNode)
        .filter(Boolean)
        .join('\n\n');
    }
    const text = Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
    return text;
  }

  return Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
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
      ].includes(tag);

      if (isBlock) {
        flushInlineBuffer();
        const serialized = serializeBlockNode(child);
        if (serialized) blocks.push(serialized);
      } else {
        inlineBuffer += serializeInlineNode(child);
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
  linkInput?: { url: string; label?: string }
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
    const inserted = `*${inner}*`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + 1,
      nextEnd: selectionStart + 1 + inner.length,
    };
  }

  if (action === 'link') {
    const label = (linkInput?.label?.trim() || selected || 'link text').trim();
    const url = (linkInput?.url?.trim() || 'https://').trim();
    const inserted = `[${label}](${url})`;
    const nextValue =
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    return {
      nextValue,
      nextStart: selectionStart + inserted.length,
      nextEnd: selectionStart + inserted.length,
    };
  }

  // Line-based transformations: headings, lists, blockquotes
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const blockSlice = value.slice(lineStart, lineEnd);
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
    .replace(/[#>*_`[\]()-]/g, ' ')
    .trim();
  if (!plain) return { words: 0, minutes: 0 };
  const words = plain.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return { words, minutes };
}
