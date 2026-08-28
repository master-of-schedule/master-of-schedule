import { userGuideSections, type GuideBlock } from '../help/userGuide';
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

  if (block.type === 'image') {
    return (
      <figure key={index} className={styles.figure}>
        <img src={block.src} alt={block.alt} />
        <figcaption>{block.alt}</figcaption>
      </figure>
    );
  }

  return (
    <div key={index} className={styles.imageGrid}>
      {block.images.map((image) => (
        <figure key={image.alt} className={styles.figure}>
          <img src={image.src} alt={image.alt} />
          <figcaption>{image.alt}</figcaption>
        </figure>
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
          <p className={styles.kicker}>Руководство пользователя</p>
          <h1>Редактор нагрузки</h1>
          <p>Короткая встроенная справка по основным шагам работы: от учебного плана до экспорта результатов.</p>
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
