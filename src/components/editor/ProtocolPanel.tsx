/**
 * ProtocolPanel - History/undo visualization panel
 */

import { useMemo } from 'react';
import { useScheduleStore, useDataStore } from '@/stores';
import { Button } from '@/components/common/Button';
import styles from './ProtocolPanel.module.css';

/** Highlight class names in a description string */
function highlightDescription(text: string, classNames: string[]): React.ReactNode {
  if (classNames.length === 0) return text;

  // Build regex matching any class name, longest first to avoid partial matches
  const sorted = [...classNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

  const parts = text.split(pattern);
  const classSet = new Set(classNames);

  return parts.map((part, i) =>
    classSet.has(part)
      ? <span key={i} className={styles.className}>{part}</span>
      : part
  );
}

export function ProtocolPanel() {
  const history = useScheduleStore((state) => state.history);
  const historyIndex = useScheduleStore((state) => state.historyIndex);
  const undo = useScheduleStore((state) => state.undo);
  const redo = useScheduleStore((state) => state.redo);
  const undoAll = useScheduleStore((state) => state.undoAll);
  const clearHistory = useScheduleStore((state) => state.clearHistory);
  const goToHistoryEntry = useScheduleStore((state) => state.goToHistoryEntry);
  const classes = useDataStore((state) => state.classes);

  const classNames = useMemo(() => classes.map(c => c.name), [classes]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Протокол</h3>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="small"
            onClick={undo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
          >
            ↩
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={redo}
            disabled={!canRedo}
            title="Повторить (Ctrl+Y)"
          >
            ↪
          </Button>
        </div>
      </div>

      <div className={styles.list}>
        {history.length === 0 ? (
          <div className={styles.empty}>
            История пуста
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-xs)' }}>
              Действия в сетке будут записываться сюда
            </span>
          </div>
        ) : (
          // Reverse order: newest entries at top
          [...history].reverse().map((entry, reverseIndex) => {
            const index = history.length - 1 - reverseIndex;
            const isCurrent = index === historyIndex;
            const isUndone = index > historyIndex;

            return (
              <div
                key={entry.id}
                className={`${styles.entry} ${isCurrent ? styles.current : ''} ${isUndone ? styles.undone : ''} ${!isCurrent ? styles.clickable : ''}`}
                onClick={!isCurrent ? () => goToHistoryEntry(index) : undefined}
                title={!isCurrent ? 'Восстановить это состояние' : undefined}
              >
                <span className={styles.time}>
                  {new Date(entry.timestamp).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className={styles.description}>{highlightDescription(entry.description, classNames)}</span>
              </div>
            );
          })
        )}
      </div>

      {history.length > 0 && (
        <div className={styles.footer}>
          <Button
            variant="ghost"
            size="small"
            onClick={undoAll}
            disabled={!canUndo}
            title="Отменить всё"
          >
            Отменить всё
          </Button>
          <Button variant="ghost" size="small" onClick={clearHistory} title="Очистить историю">
            Очистить
          </Button>
        </div>
      )}
    </div>
  );
}
