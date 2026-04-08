import { useMemo } from 'react';
import { useStore } from '../store';
import { shortTeacherName } from '../logic/groupNames';
import { useToast } from '../hooks/useToast';
import type { CurriculumPlan } from '../types';
import styles from './HomeroomPage.module.css';

interface Props {
  plan: CurriculumPlan | null;
}

export function HomeroomPage({ plan }: Props) {
  const { teachers, homeroomAssignments, setHomeroom, removeHomeroom } = useStore();
  const { notify } = useToast();

  if (!plan) {
    return (
      <div>
        <h2>Классные руководители</h2>
        <p style={{ color: '#888' }}>Сначала загрузите учебный план (вкладка 1)</p>
      </div>
    );
  }

  function getTeacherId(className: string): string {
    return homeroomAssignments.find((h) => h.className === className)?.teacherId ?? '';
  }

  // З18-7: build lookup map for name → teacherId
  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [teachers],
  );
  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teachers) map.set(shortTeacherName(t.name), t.id);
    return map;
  }, [teachers]);

  function handleNameInput(className: string, name: string) {
    if (!name.trim()) {
      removeHomeroom(className);
      return;
    }
    const teacherId = nameToId.get(name.trim());
    if (teacherId) {
      setHomeroom(className, teacherId);
      notify(`Классный руководитель назначен: ${name.trim()} — ${className}`, 'success');
    }
  }

  const assigned = plan.classNames.filter((cn) => getTeacherId(cn));
  const unassigned = plan.classNames.filter((cn) => !getTeacherId(cn));

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Классные руководители</h2>
      <p className={styles.note}>
        Каждому классу автоматически добавляется «Разговоры о важном» (1 ч/нед) —
        ведёт классный руководитель.
      </p>

      <div className={styles.progress}>
        <div
          className={styles.progressBar}
          style={{ width: `${(assigned.length / plan.classNames.length) * 100}%` }}
        />
      </div>
      <p className={styles.progressText}>
        Назначено: {assigned.length} / {plan.classNames.length}
      </p>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Класс</th>
            <th>Классный руководитель</th>
            <th>Разговоры о важном</th>
          </tr>
        </thead>
        <tbody>
          {plan.classNames.map((cn) => {
            const tid = getTeacherId(cn);
            const teacher = teachers.find((t) => t.id === tid);
            return (
              <tr key={cn}>
                <td className={styles.className}>{cn}</td>
                <td>
                  <input
                    list="homeroom-teachers"
                    className={`${styles.select} ${!tid ? styles.selectEmpty : ''}`}
                    defaultValue={teacher ? shortTeacherName(teacher.name) : ''}
                    placeholder="начните вводить фамилию…"
                    onBlur={(e) => handleNameInput(cn, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                </td>
                <td className={styles.razgovory}>
                  {teacher ? (
                    <span className={styles.razgovoryOk} title={teacher.name}>1 ч — {shortTeacherName(teacher.name)}</span>
                  ) : (
                    <span className={styles.razgovoryMissing}>не назначен</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="homeroom-teachers">
        {sortedTeachers.map((t) => (
          <option key={t.id} value={shortTeacherName(t.name)} />
        ))}
      </datalist>

      {unassigned.length > 0 && (
        <p className={styles.warning}>
          Не назначены классные руководители для: {unassigned.join(', ')}
        </p>
      )}
    </div>
  );
}
