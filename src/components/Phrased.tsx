import { Fragment } from 'react';

/**
 * Text with a <wbr> between its phrases — the only places it may break once
 * its container has `word-break: keep-all`. See src/lib/phrases.ts.
 */
export function Phrased({ parts }: { parts: readonly string[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
