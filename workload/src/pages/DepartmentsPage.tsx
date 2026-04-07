import { useState } from 'react';
import { useStore } from '../store';
import { deriveInitials, shortTeacherName } from '../logic/groupNames';
import { useToast } from '../hooks/useToast';
import { generateId } from '../utils/generateId';
import type { DeptGroup, DeptTable } from '../types';
import styles from './DepartmentsPage.module.css';

export function DepartmentsPage() {
  const {
    deptGroups, teachers, curriculumPlan,
    addTeacher, deleteTeacher,
    addDeptGroup, updateDeptGroup, deleteDeptGroup, moveDeptGroup,
    addDeptTable, updateDeptTable, deleteDeptTable, moveDeptTable,
  } = useStore();
  const { notify } = useToast();

  // Accordion state — one group and one table open at a time
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);

  // Add-group form
  const [newGroupName, setNewGroupName] = useState('');
  const [addGroupError, setAddGroupError] = useState('');

  // Add-table form (per group)
  const [addingTableForGroup, setAddingTableForGroup] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [addTableError, setAddTableError] = useState('');

  // Add-teacher form (per table)
  const [addingTeacherFor, setAddingTeacherFor] = useState<{ groupId: string; tableId: string } | null>(null);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [addTeacherError, setAddTeacherError] = useState('');

  const allSubjectNames = curriculumPlan
    ? [...new Set(curriculumPlan.grades.flatMap((g) => g.subjects.map((s) => s.name)))].sort((a, b) =>
        a.localeCompare(b, 'ru'),
      )
    : [];

  function getSubjectShortName(name: string): string {
    if (!curriculumPlan) return name;
    for (const g of curriculumPlan.grades) {
      const s = g.subjects.find((s) => s.name === name);
      if (s?.shortName) return s.shortName;
    }
    return name;
  }

  // ── Group handlers ──────────────────────────────────────────────────────────

  function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name) { setAddGroupError('Введите название'); return; }
    if (deptGroups.find((g) => g.name === name)) { setAddGroupError('Кафедра с таким именем уже есть'); return; }
    const groupId = generateId("dept");
    addDeptGroup({ id: groupId, name, tables: [{ id: `${groupId}-t1`, name, teacherIds: [], subjectFilter: [] }] });
    setNewGroupName('');
    setAddGroupError('');
    notify(`Группа «${name}» добавлена`, 'success');
  }

  function handleDeleteGroup(group: DeptGroup) {
    if (confirm(`Удалить кафедру «${group.name}» со всеми таблицами?`)) {
      deleteDeptGroup(group.id);
      if (expandedGroupId === group.id) setExpandedGroupId(null);
      notify(`Группа «${group.name}» удалена`, 'error');
    }
  }

  function handleRenameGroup(group: DeptGroup, name: string) {
    if (name.trim()) updateDeptGroup(group.id, { name: name.trim() });
  }

  function toggleGroup(groupId: string) {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
    setExpandedTableId(null);
  }

  // ── Table handlers ──────────────────────────────────────────────────────────

  function openAddTable(groupId: string) {
    setAddingTableForGroup(groupId);
    setNewTableName('');
    setAddTableError('');
  }

  function handleAddTable(groupId: string) {
    const name = newTableName.trim();
    if (!name) { setAddTableError('Введите название'); return; }
    addDeptTable(groupId, { id: generateId("dept"), name, teacherIds: [], subjectFilter: [] });
    setNewTableName('');
    setAddTableError('');
    setAddingTableForGroup(null);
    notify('Таблица добавлена', 'success');
  }

  function handleDeleteTable(groupId: string, table: DeptTable) {
    if (confirm(`Удалить таблицу «${table.name}»?`)) {
      deleteDeptTable(groupId, table.id);
      if (expandedTableId === table.id) setExpandedTableId(null);
      notify('Таблица удалена', 'error');
    }
  }

  function handleRenameTable(groupId: string, table: DeptTable, name: string) {
    if (name.trim()) updateDeptTable(groupId, table.id, { name: name.trim() });
  }

  function toggleTable(tableId: string) {
    setExpandedTableId((prev) => (prev === tableId ? null : tableId));
  }

  // ── Teacher handlers ────────────────────────────────────────────────────────

  function openAddTeacher(groupId: string, tableId: string) {
    setAddingTeacherFor({ groupId, tableId });
    setNewTeacherName('');
    setAddTeacherError('');
  }

  function handleAddTeacher(groupId: string, table: DeptTable) {
    const name = newTeacherName.trim();
    if (!name) { setAddTeacherError('Введите ФИО'); return; }
    const existing = teachers.find((t) => t.name === name);
    if (existing) {
      if (!table.teacherIds.includes(existing.id)) {
        updateDeptTable(groupId, table.id, { teacherIds: [...table.teacherIds, existing.id] });
      }
    } else {
      const id = generateId("t");
      addTeacher({ id, name, initials: deriveInitials(name), subjects: [] });
      updateDeptTable(groupId, table.id, { teacherIds: [...table.teacherIds, id] });
    }
    setNewTeacherName('');
    setAddTeacherError('');
    setAddingTeacherFor(null);
  }

  function handleRemoveTeacher(groupId: string, table: DeptTable, teacherId: string, teacherName: string) {
    updateDeptTable(groupId, table.id, { teacherIds: table.teacherIds.filter((id) => id !== teacherId) });
    if (confirm(`Удалить «${teacherName}» из списка учителей полностью?`)) {
      deleteTeacher(teacherId);
    }
  }

  function toggleSubject(groupId: string, table: DeptTable, subjectName: string) {
    const next = table.subjectFilter.includes(subjectName)
      ? table.subjectFilter.filter((s) => s !== subjectName)
      : [...table.subjectFilter, subjectName];
    updateDeptTable(groupId, table.id, { subjectFilter: next });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Кафедры</h2>
      <p className={styles.hint}>
        Каждая кафедра — это одна или несколько таблиц. Раскройте кафедру, затем таблицу, чтобы добавить учителей и настроить предметы.
      </p>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Название новой кафедры"
          value={newGroupName}
          onChange={(e) => { setNewGroupName(e.target.value); setAddGroupError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
        />
        <button className={styles.addBtn} onClick={handleAddGroup}>+ Кафедра</button>
        {addGroupError && <span className={styles.error}>{addGroupError}</span>}
      </div>

      <div className={styles.list}>
        {deptGroups.map((group) => {
          const groupExpanded = expandedGroupId === group.id;
          const groupIndex = deptGroups.indexOf(group);
          const totalTeachers = teachers.filter((t) =>
            group.tables.some((tbl) => tbl.teacherIds.includes(t.id)),
          ).length;

          return (
            <div key={group.id} className={styles.card}>
              {/* ── Group header ── */}
              <div className={styles.cardHeader}>
                <button className={styles.toggle} onClick={() => toggleGroup(group.id)}>
                  {groupExpanded ? '▾' : '▸'}
                </button>
                <div className={styles.moveBtns}>
                  <button
                    className={styles.moveBtn}
                    onClick={() => moveDeptGroup(group.id, 'up')}
                    disabled={groupIndex === 0}
                    title="Переместить вверх"
                  >▲</button>
                  <button
                    className={styles.moveBtn}
                    onClick={() => moveDeptGroup(group.id, 'down')}
                    disabled={groupIndex === deptGroups.length - 1}
                    title="Переместить вниз"
                  >▼</button>
                </div>
                <input
                  className={styles.deptName}
                  defaultValue={group.name}
                  onBlur={(e) => handleRenameGroup(group, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <span className={styles.memberCount}>
                  {group.tables.length} {group.tables.length === 1 ? 'таблица' : group.tables.length < 5 ? 'таблицы' : 'таблиц'}
                  {totalTeachers > 0 && ` · ${totalTeachers} уч.`}
                </span>
                <button className={styles.deleteBtn} onClick={() => handleDeleteGroup(group)} title="Удалить кафедру">✕</button>
              </div>

              {/* ── Group body: list of tables ── */}
              {groupExpanded && (
                <div className={styles.groupBody}>
                  {group.tables.map((table) => {
                    const tableExpanded = expandedTableId === table.id;
                    const tableIndex = group.tables.indexOf(table);
                    const tableMembers = teachers
                      .filter((t) => table.teacherIds.includes(t.id))
                      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
                    const isAddingHere = addingTeacherFor?.tableId === table.id && addingTeacherFor?.groupId === group.id;

                    return (
                      <div key={table.id} className={styles.tableCard}>
                        {/* ── Table header ── */}
                        <div className={styles.tableCardHeader}>
                          <button className={styles.toggle} onClick={() => toggleTable(table.id)}>
                            {tableExpanded ? '▾' : '▸'}
                          </button>
                          <div className={styles.moveBtns}>
                            <button
                              className={styles.moveBtn}
                              onClick={() => moveDeptTable(group.id, table.id, 'up')}
                              disabled={tableIndex === 0}
                              title="Переместить вверх"
                            >▲</button>
                            <button
                              className={styles.moveBtn}
                              onClick={() => moveDeptTable(group.id, table.id, 'down')}
                              disabled={tableIndex === group.tables.length - 1}
                              title="Переместить вниз"
                            >▼</button>
                          </div>
                          <input
                            className={styles.tableName}
                            defaultValue={table.name}
                            onBlur={(e) => handleRenameTable(group.id, table, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                          <span className={styles.memberCount}>
                            {tableMembers.length > 0
                              ? tableMembers.slice(0, 6).map((t) => shortTeacherName(t.name)).join(', ') +
                                (tableMembers.length > 6 ? ` +${tableMembers.length - 6}` : '')
                              : 'нет учителей'}
                          </span>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => handleDeleteTable(group.id, table)}
                            title="Удалить таблицу"
                          >✕</button>
                        </div>

                        {/* ── Table body: teachers + subject filter ── */}
                        {tableExpanded && (
                          <div className={styles.teacherList}>
                            {isAddingHere ? (
                              <div className={styles.addTeacherRow}>
                                <datalist id="teacher-suggestions">
                                  {teachers
                                    .filter((t) => !table.teacherIds.includes(t.id))
                                    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                                    .map((t) => <option key={t.id} value={t.name} />)}
                                </datalist>
                                <input
                                  className={styles.addTeacherInput}
                                  list="teacher-suggestions"
                                  placeholder="Иванов Иван Иванович"
                                  value={newTeacherName}
                                  onChange={(e) => { setNewTeacherName(e.target.value); setAddTeacherError(''); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddTeacher(group.id, table);
                                    if (e.key === 'Escape') setAddingTeacherFor(null);
                                  }}
                                  autoFocus
                                />
                                <button className={styles.addTeacherBtn} onClick={() => handleAddTeacher(group.id, table)}>Добавить</button>
                                <button className={styles.deleteBtn} onClick={() => setAddingTeacherFor(null)}>✕</button>
                                {addTeacherError && <span className={styles.addTeacherError}>{addTeacherError}</span>}
                              </div>
                            ) : (
                              <button className={styles.addTeacherBtn} onClick={() => openAddTeacher(group.id, table.id)}>
                                + Учитель
                              </button>
                            )}

                            {tableMembers.map((t) => (
                              <div key={t.id} className={styles.teacherRow}>
                                <span className={styles.teacherName} title={t.name}>{shortTeacherName(t.name)}</span>
                                <span className={styles.teacherInitials}>{t.initials}</span>
                                <button
                                  className={styles.deleteBtn}
                                  onClick={() => handleRemoveTeacher(group.id, table, t.id, t.name)}
                                  title="Убрать из таблицы"
                                >✕</button>
                              </div>
                            ))}
                            {tableMembers.length === 0 && !isAddingHere && (
                              <p className={styles.noTeachers}>Учителей нет</p>
                            )}

                            <div className={styles.subjectSection}>
                              <p className={styles.subjectSectionLabel}>
                                Предметы таблицы
                                {table.subjectFilter.length === 0 && (
                                  <span className={styles.subjectSectionHint}> — все (не ограничено)</span>
                                )}
                              </p>
                              {allSubjectNames.length === 0 ? (
                                <p className={styles.noTeachers}>Сначала загрузите учебный план</p>
                              ) : (
                                <div className={styles.subjectList}>
                                  {allSubjectNames.map((name) => (
                                    <label key={name} className={styles.subjectRow}>
                                      <input
                                        type="checkbox"
                                        checked={table.subjectFilter.includes(name)}
                                        onChange={() => toggleSubject(group.id, table, name)}
                                      />
                                      <span title={name}>{getSubjectShortName(name)}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Add table form ── */}
                  {addingTableForGroup === group.id ? (
                    <div className={styles.addTableRow}>
                      <input
                        className={styles.addTeacherInput}
                        placeholder="Название таблицы"
                        value={newTableName}
                        onChange={(e) => { setNewTableName(e.target.value); setAddTableError(''); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTable(group.id);
                          if (e.key === 'Escape') setAddingTableForGroup(null);
                        }}
                        autoFocus
                      />
                      <button className={styles.addTeacherBtn} onClick={() => handleAddTable(group.id)}>Добавить</button>
                      <button className={styles.deleteBtn} onClick={() => setAddingTableForGroup(null)}>✕</button>
                      {addTableError && <span className={styles.addTeacherError}>{addTableError}</span>}
                    </div>
                  ) : (
                    <button className={styles.addTableBtn} onClick={() => openAddTable(group.id)}>
                      + Таблица
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
