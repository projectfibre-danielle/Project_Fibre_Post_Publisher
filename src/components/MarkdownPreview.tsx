import React, { useState } from 'react';
import katex from 'katex';
import { ImageOff } from 'lucide-react';
import {
  calculateReadingStats,
  InlineToken,
  isAllowedIframeSrc,
  isSafeUrl,
  MarkdownBlock,
  parseMarkdownBlocks,
  TextAlign,
} from '../utils/markdown';
import { parseTagsInput, slugify } from '../utils/storage';

interface MarkdownPreviewProps {
  title: string;
  slug: string;
  date: string;
  categoryTags: string;
  summary: string;
  content: string;
}

const alignClass = (align?: TextAlign): string => {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
};

const PreviewImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || !isSafeUrl(src) || failed) {
    return (
      <div className="my-5 flex items-center justify-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-8 text-xs text-[#71717A]">
        <ImageOff className="h-4 w-4 shrink-0" />
        <span>{alt || 'Image preview unavailable'}</span>
      </div>
    );
  }

  return (
    <figure className="my-5">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="mx-auto max-h-[420px] max-w-full rounded-lg border border-[#E4E4E7] object-contain"
      />
      {alt && alt !== 'Image' && (
        <figcaption className="mt-2 text-center text-xs text-[#71717A]">
          {alt}
        </figcaption>
      )}
    </figure>
  );
};

function renderMathHtml(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return formula;
  }
}

function renderInlineTokens(tokens: InlineToken[]): React.ReactNode {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={idx} className="font-semibold text-[#18181B]">
            {token.text}
          </strong>
        );
      case 'italic':
        return (
          <em key={idx} className="italic text-[#27272A]">
            {token.text}
          </em>
        );
      case 'code':
        return (
          <code
            key={idx}
            className="rounded bg-[#F4F4F5] px-1.5 py-0.5 font-mono text-[0.85em] text-[#18181B]"
          >
            {token.text}
          </code>
        );
      case 'br':
        return <br key={idx} />;
      case 'color':
        return (
          <span key={idx} style={{ color: token.color || '#18181B' }}>
            {token.children ? renderInlineTokens(token.children) : token.text}
          </span>
        );
      case 'math_inline':
        return (
          <span
            key={idx}
            className="inline-block align-middle"
            dangerouslySetInnerHTML={{
              __html: renderMathHtml(token.text, false),
            }}
          />
        );
      case 'image':
        return (
          <PreviewImage
            key={idx}
            src={token.src || ''}
            alt={token.alt || ''}
          />
        );
      case 'link':
        return (
          <a
            key={idx}
            href={token.href || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563EB] underline decoration-[#2563EB]/40 underline-offset-4 transition-colors hover:decoration-[#2563EB]"
          >
            {token.text}
          </a>
        );
      default:
        return <React.Fragment key={idx}>{token.text}</React.Fragment>;
    }
  });
}

function renderBlock(block: MarkdownBlock, index: number): React.ReactNode {
  switch (block.type) {
    case 'aligned':
      return (
        <div key={index} className={alignClass(block.align)}>
          {block.blocks.map((inner, innerIdx) => renderBlock(inner, innerIdx))}
        </div>
      );
    case 'heading': {
      if (block.level === 1) {
        return (
          <h2
            key={index}
            className={`mt-8 mb-3 font-serif text-2xl font-semibold tracking-tight text-[#18181B] ${alignClass(block.align)}`}
          >
            {renderInlineTokens(block.tokens)}
          </h2>
        );
      }
      if (block.level === 2) {
        return (
          <h3
            key={index}
            className={`mt-7 mb-2.5 font-serif text-xl font-semibold tracking-tight text-[#18181B] ${alignClass(block.align)}`}
          >
            {renderInlineTokens(block.tokens)}
          </h3>
        );
      }
      return (
        <h4
          key={index}
          className={`mt-6 mb-2 font-serif text-lg font-semibold text-[#18181B] ${alignClass(block.align)}`}
        >
          {renderInlineTokens(block.tokens)}
        </h4>
      );
    }
    case 'paragraph':
      return (
        <p
          key={index}
          className={`mb-4 text-[15.5px] leading-[1.75] text-[#27272A] ${alignClass(block.align)}`}
        >
          {renderInlineTokens(block.tokens)}
        </p>
      );
    case 'blockquote':
      return (
        <blockquote
          key={index}
          className="my-5 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5]/70 px-5 py-4 font-serif text-[16px] italic leading-[1.65] text-[#3F3F46]"
        >
          {block.lines.map((line, lineIdx) => (
            <p key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
              {renderInlineTokens(line)}
            </p>
          ))}
        </blockquote>
      );
    case 'ul':
      return (
        <ul
          key={index}
          className="mb-4 list-disc space-y-1.5 pl-6 text-[15.5px] leading-[1.7] text-[#27272A]"
        >
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineTokens(item)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol
          key={index}
          className="mb-4 list-decimal space-y-1.5 pl-6 text-[15.5px] leading-[1.7] text-[#27272A]"
        >
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineTokens(item)}</li>
          ))}
        </ol>
      );
    case 'codeblock':
      return (
        <pre
          key={index}
          className="my-5 overflow-x-auto rounded-lg border border-[#E4E4E7] bg-[#18181B] p-4 font-mono text-[13px] leading-relaxed text-[#F4F4F5]"
        >
          <code>{block.code}</code>
        </pre>
      );
    case 'math_block':
      return (
        <div
          key={index}
          className="my-5 overflow-x-auto rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3 text-center text-[#18181B]"
          dangerouslySetInnerHTML={{
            __html: renderMathHtml(block.formula, true),
          }}
        />
      );
    case 'image':
      return <PreviewImage key={index} src={block.src} alt={block.alt} />;
    case 'video':
      if (block.kind === 'iframe' && isAllowedIframeSrc(block.src)) {
        return (
          <div key={index} className="my-5">
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-[#E4E4E7] bg-black">
              <iframe
                src={block.src}
                title={block.title || 'Embedded video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
            {block.title && block.title !== 'Embedded video' && (
              <p className="mt-2 text-center text-xs text-[#71717A]">
                {block.title}
              </p>
            )}
          </div>
        );
      }
      return (
        <div key={index} className="my-5">
          <video
            controls
            src={isSafeUrl(block.src) ? block.src : ''}
            className="w-full rounded-lg border border-[#E4E4E7] bg-black"
          />
          {block.title && block.title !== 'Embedded video' && (
            <p className="mt-2 text-center text-xs text-[#71717A]">
              {block.title}
            </p>
          )}
        </div>
      );
    case 'hr':
      return <hr key={index} className="my-7 border-t border-[#E4E4E7]" />;
  }
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  title,
  slug,
  date,
  categoryTags,
  summary,
  content,
}) => {
  const blocks = parseMarkdownBlocks(content);
  const { tags } = parseTagsInput(categoryTags);
  const { words, minutes } = calculateReadingStats(content);
  const resolvedSlug = slugify(slug.trim() || title.trim());

  return (
    <article className="mx-auto max-w-[68ch] px-1 py-2">
      <header className="border-b border-[#E4E4E7] pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[#71717A] tabular-nums">
          <span>{date || 'Undated'}</span>
          {tags.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{tags.join(' / ')}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{words} words</span>
          {minutes > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{minutes} min read</span>
            </>
          )}
        </div>

        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#18181B] [text-wrap:balance] sm:text-[2.125rem] sm:leading-[1.18]">
          {title.trim() || 'Untitled Draft'}
        </h1>

        {summary.trim() && (
          <p className="mt-3 text-[16px] leading-relaxed text-[#52525B]">
            {summary.trim()}
          </p>
        )}

        {resolvedSlug && (
          <p className="mt-3 font-mono text-[12px] text-[#A1A1AA]">
            /posts/{resolvedSlug}
          </p>
        )}
      </header>

      <div className="pt-6">
        {blocks.length > 0 ? (
          blocks.map((block, idx) => renderBlock(block, idx))
        ) : (
          <p className="text-[15px] italic text-[#A1A1AA]">
            Start writing in the editor to see your formatted Project Fibre article preview here.
          </p>
        )}
      </div>
    </article>
  );
};
