import type { ReactNode } from 'react';

export interface SectionProps {
  title: string;
  note?: ReactNode;
  footnote?: ReactNode;
  id?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/** The repeated 「● 見出し ＋ 補足」 block that opens every section. */
export function Section({ title, note, footnote, id, ariaLabel, children }: SectionProps) {
  return (
    <section id={id} className="section" aria-label={ariaLabel ?? title}>
      <div className="section__head">
        <span className="section__bullet" aria-hidden="true" />
        <h2 className="section__title">{title}</h2>
        {note && <span className="section__note">{note}</span>}
      </div>
      {children}
      {footnote && <p className="section__footnote">{footnote}</p>}
    </section>
  );
}
