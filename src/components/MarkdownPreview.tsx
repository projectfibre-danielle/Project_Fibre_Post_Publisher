import React, { useState } from 'react';
import katex from 'katex';
import {
  AlertCircle,
  AlertTriangle,
  ImageOff,
  Info,
  Lightbulb,
  OctagonAlert,
} from 'lucide-react';
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
  if (align === 'left') return 'text-left';
  return '';
};

const PreviewImage: React.FC<{
  src: string;
  alt: string;
  align?: TextAlign;
}> = ({ src, alt, align }) => {
  const [failed, setFailed] = useState(false);

  if (!src || !isSafeUrl(src) || failed) {
    return (
      <div className="my-5 flex items-center justify-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-8 text-xs text-[#71717A]">
        <ImageOff className="h-4 w-4 shrink-0" />
        <span>{alt || 'Image preview unavailable'}</span>
      </div>
    );
  }

  const imgAlign =
    align === 'right' ? 'ml-auto' : align === 'left' ? 'mr-auto' : 'mx-auto';

  return (
    <figure className="my-5">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${imgAlign} max-h-[420px] max-w-full rounded-lg border border-[#E4E4E7] object-contain`}
      />
      {alt && alt !== 'Image' && (
        <figcaption
          className={`mt-2 text-xs text-[#71717A] ${alignClass(align) || 'text-center'}`}
        >
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

function renderInlineTokens(
  tokens: InlineToken[],
  inheritColor = false
): React.ReactNode {
  return tokens.map((token, idx) => {
    const childInheritColor = inheritColor || token.type === 'color';
    const inner = token.children
      ? renderInlineTokens(token.children, childInheritColor)
      : token.text;

    switch (token.type) {
      case 'bold':
        return (
          <strong
            key={idx}
            className={
              inheritColor ? 'font-semibold' : 'font-semibold text-[#18181B]'
            }
          >
            {inner}
          </strong>
        );
      case 'italic':
        return (
          <em
            key={idx}
            className={inheritColor ? 'italic' : 'italic text-[#27272A]'}
          >
            {inner}
          </em>
        );
      case 'underline':
        return (
          <span key={idx} className="underline underline-offset-4">
            {inner}
          </span>
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
            {inner}
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
            {inner}
          </a>
        );
      default:
        return <React.Fragment key={idx}>{token.text}</React.Fragment>;
    }
  });
}

function renderBlock(
  block: MarkdownBlock,
  index: number,
  inheritedAlign?: TextAlign
): React.ReactNode {
  const effectiveAlign =
    block.type === 'aligned' ? block.align : ('align' in block ? block.align : undefined) ?? inheritedAlign;
  const alignmentCls = alignClass(effectiveAlign);

  switch (block.type) {
    case 'aligned':
      return (
        <div
          key={index}
          className={alignClass(block.align)}
          style={{ textAlign: block.align }}
        >
          {block.blocks.map((inner, innerIdx) =>
            renderBlock(inner, innerIdx, block.align)
          )}
        </div>
      );
    case 'heading': {
      if (block.level === 1) {
        return (
          <h2
            key={index}
            className={`mt-8 mb-3 font-serif text-2xl font-semibold tracking-tight text-[#18181B] ${alignmentCls}`}
          >
            {renderInlineTokens(block.tokens)}
          </h2>
        );
      }
      if (block.level === 2) {
        return (
          <h3
            key={index}
            className={`mt-7 mb-2.5 font-serif text-xl font-semibold tracking-tight text-[#18181B] ${alignmentCls}`}
          >
            {renderInlineTokens(block.tokens)}
          </h3>
        );
      }
      return (
        <h4
          key={index}
          className={`mt-6 mb-2 font-serif text-lg font-semibold text-[#18181B] ${alignmentCls}`}
        >
          {renderInlineTokens(block.tokens)}
        </h4>
      );
    }
    case 'paragraph':
      return (
        <p
          key={index}
          className={`mb-4 text-[15.5px] leading-[1.75] text-[#27272A] ${alignmentCls}`}
        >
          {renderInlineTokens(block.tokens)}
        </p>
      );
    case 'blockquote':
      return (
        <blockquote
          key={index}
          className={`my-5 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5]/70 px-5 py-4 font-serif text-[16px] italic leading-[1.65] text-[#3F3F46] ${alignmentCls}`}
        >
          {block.lines.map((line, lineIdx) => (
            <p key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
              {renderInlineTokens(line)}
            </p>
          ))}
        </blockquote>
      );
    case 'callout': {
      const config =
        block.kind === 'note'
          ? {
              label: 'Note',
              wrapper: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1E3A8A]',
              heading: 'text-[#1D4ED8]',
              icon: <Info className="h-4 w-4 shrink-0 text-[#2563EB]" />,
            }
          : block.kind === 'tip'
            ? {
                label: 'Tip',
                wrapper: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#064E3B]',
                heading: 'text-[#047857]',
                icon: <Lightbulb className="h-4 w-4 shrink-0 text-[#059669]" />,
              }
            : block.kind === 'important'
              ? {
                  label: 'Important',
                  wrapper: 'border-[#DDD6FE] bg-[#F5F3FF] text-[#3B0764]',
                  heading: 'text-[#6D28D9]',
                  icon: <AlertCircle className="h-4 w-4 shrink-0 text-[#7C3AED]" />,
                }
              : block.kind === 'warning'
                ? {
                    label: 'Warning',
                    wrapper: 'border-[#FDE68A] bg-[#FFFBEB] text-[#78350F]',
                    heading: 'text-[#B45309]',
                    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-[#D97706]" />,
                  }
                : {
                    label: 'Caution',
                    wrapper: 'border-[#FECACA] bg-[#FEF2F2] text-[#7F1D1D]',
                    heading: 'text-[#B91C1C]',
                    icon: <OctagonAlert className="h-4 w-4 shrink-0 text-[#DC2626]" />,
                  };
      return (
        <aside
          key={index}
          aria-label={config.label}
          className={`my-5 rounded-xl border px-5 py-4 text-[15px] leading-[1.7] ${config.wrapper} ${alignmentCls}`}
        >
          <div className={`mb-1.5 flex items-center gap-2 text-xs font-semibold ${config.heading}`}>
            {config.icon}
            <span>{config.label}</span>
          </div>
          {block.lines.map((line, lineIdx) => (
            <p key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
              {renderInlineTokens(line, true)}
            </p>
          ))}
        </aside>
      );
    }
    case 'ul':
      return (
        <ul
          key={index}
          className={`mb-4 list-disc space-y-1.5 text-[15.5px] leading-[1.7] text-[#27272A] ${
            effectiveAlign && effectiveAlign !== 'left'
              ? `list-inside ${alignmentCls}`
              : 'pl-6'
          }`}
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
          className={`mb-4 list-decimal space-y-1.5 text-[15.5px] leading-[1.7] text-[#27272A] ${
            effectiveAlign && effectiveAlign !== 'left'
              ? `list-inside ${alignmentCls}`
              : 'pl-6'
          }`}
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
          className="my-5 overflow-x-auto rounded-lg border border-[#E4E4E7] bg-[#18181B] p-4 text-left font-mono text-[13px] leading-relaxed text-[#F4F4F5]"
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
      return (
        <PreviewImage
          key={index}
          src={block.src}
          alt={block.alt}
          align={effectiveAlign}
        />
      );
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
