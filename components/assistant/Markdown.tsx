import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

// Just enough Markdown for assistant replies: paragraphs, "- " and "1. "
// lists, **bold**, `code` and links. Links only go to pages inside the app;
// anything else is shown as plain text, so a reply can't send people off-site.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1]) out.push(<strong key={key} className="font-semibold text-gray-900">{match[1]}</strong>);
    else if (match[2]) out.push(<code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">{match[2]}</code>);
    else if (match[4]?.startsWith('/') && !match[4].startsWith('//'))
      out.push(
        <Link key={key} href={match[4]} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
          {match[3]}
        </Link>
      );
    else out.push(match[3]);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split('\n');
        const bullet = /^\s*[-*•]\s+/;
        const numbered = /^\s*\d+[.)]\s+/;
        if (lines.every((line) => bullet.test(line) || numbered.test(line))) {
          const ordered = numbered.test(lines[0]!);
          const Tag = ordered ? 'ol' : 'ul';
          return (
            <Tag key={b} className={`space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-gray-400`}>
              {lines.map((line, l) => (
                <li key={l}>{inline(line.replace(ordered ? numbered : bullet, ''), `${b}-${l}`)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={b}>
            {lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                {inline(line.replace(/^#+\s+/, ''), `${b}-${l}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
