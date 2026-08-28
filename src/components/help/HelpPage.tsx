import { userGuideSections, type GuideBlock } from '@/help/userGuide';
import styles from './HelpPage.module.css';

function renderBlock(block: GuideBlock, index: number) {
  if (block.type === 'paragraph') {
    return <p key={index} className={styles.paragraph}>{block.text}</p>;
  }

  if (block.type === 'note') {
    return <div key={index} className={styles.note}>{block.text}</div>;
  }

  if (block.type === 'ordered') {
    return (
      <ol key={index} className={styles.list}>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    );
  }

  if (block.type === 'bullets') {
    return (
      <ul key={index} className={styles.list}>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'image') {
    return (
      <figure key={index} className={styles.figure}>
        <img src={block.src} alt={block.alt} />
        <figcaption>{block.alt}</figcaption>
      </figure>
    );
  }

  return (
    <div key={index} className={styles.hotkeyTable}>
      {block.rows.map((row) => (
        <div key={row.keys} className={styles.hotkeyRow}>
          <kbd>{row.keys}</kbd>
          <span>{row.action}</span>
        </div>
      ))}
    </div>
  );
}

export function HelpPage() {
  return (
    <div className={styles.page}>
      <aside className={styles.toc}>
        <div className={styles.tocTitle}>Содержание</div>
        {userGuideSections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className={styles.tocLink}>
            {section.title}
          </a>
        ))}
      </aside>

      <article className={styles.article}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Справочник пользователя</p>
          <h1>Редактор школьного расписания</h1>
          <p>Короткая встроенная справка по основным шагам: от загрузки данных и версий до редактора, проверки, замен и экспорта.</p>
        </header>

        {userGuideSections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section}>
            <h2>{section.title}</h2>
            {section.subtitle && <p className={styles.subtitle}>{section.subtitle}</p>}
            {section.blocks.map(renderBlock)}
          </section>
        ))}
      </article>
    </div>
  );
}
