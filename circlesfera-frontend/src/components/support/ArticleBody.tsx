import { linkPieces, parseArticleBody } from '../../utils/articleBody';

function Linked({ text }: { text: string }) {
  return (
    <>
      {linkPieces(text).map((piece, index) =>
        piece.href ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text, never reordered
            key={index}
            href={piece.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary underline underline-offset-2 break-all"
          >
            {piece.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text, never reordered
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The body of an article of the help centre. It is written as text and
 * shown as paragraphs, headings and lists; whatever else is typed in it is
 * shown as it was typed.
 */
export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-white/80">
      {parseArticleBody(body).map((block, index) =>
        block.type === 'heading' ? (
          <h2
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks of one body, never reordered
            key={index}
            className="pt-2 text-xl font-bold text-white"
          >
            {block.text}
          </h2>
        ) : block.type === 'list' ? (
          <ul
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks of one body, never reordered
            key={index}
            className="list-disc space-y-1 pl-5"
          >
            {block.items.map((item, itemIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items of one list, never reordered
              <li key={itemIndex}>
                <Linked text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks of one body, never reordered
            key={index}
            className="whitespace-pre-line wrap-break-word"
          >
            <Linked text={block.text} />
          </p>
        ),
      )}
    </div>
  );
}
