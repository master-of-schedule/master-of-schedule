/**
 * RoomPanel - View and mark room occupancy for a selected room on a given day.
 * Session-only tool for weekly and technical schedule types.
 * Mirror of AbsentPanel but indexed by room instead of teacher.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { DAYS } from '@/types';
import type { Day, LessonNumber } from '@/types';
import { useScheduleStore, useUIStore, useDataStore } from '@/stores';
import { getRoomLessonsOnDay } from '@/logic';
import { DatalistInput } from '@/components/common/DatalistInput';
import styles from './RoomPanel.module.css';

export function RoomPanel() {
  const schedule = useScheduleStore((state) => state.schedule);
  const rooms = useDataStore((state) => state.rooms);
  const roomPanelRoom = useUIStore((state) => state.roomPanelRoom);
  const roomPanelDay = useUIStore((state) => state.roomPanelDay);
  const roomPanelMarkedCells = useUIStore((state) => state.roomPanelMarkedCells);
  const roomPanelLessons = useUIStore((state) => state.roomPanelLessons);
  const { setRoomPanel, setRoomPanelLessons, toggleRoomPanelCell, clearRoomPanelMarked } = useUIStore();

  // Sorted room short names + set for O(1) lookup
  const roomNameSet = useRef(new Set<string>());
  const roomNames = (() => {
    const names = Object.values(rooms).map(r => r.shortName).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    roomNameSet.current = new Set(names);
    return names;
  })();

  const [roomInput, setRoomInput] = useState(roomPanelRoom ?? '');

  useEffect(() => {
    setRoomInput(roomPanelRoom ?? '');
  }, [roomPanelRoom]);

  // Capture snapshot when both room and day are set and snapshot is empty
  useEffect(() => {
    if (roomPanelRoom && roomPanelDay && roomPanelLessons.length === 0) {
      const lessons = getRoomLessonsOnDay(schedule, roomPanelRoom, roomPanelDay);
      if (lessons.length > 0) {
        setRoomPanelLessons(lessons.map(({ className, lessonNum, lessons: ls }) => ({
          className,
          lessonNum,
          subjects: ls.map(l => l.subject),
        })));
      }
    }
  }, [roomPanelRoom, roomPanelDay, roomPanelLessons.length, schedule, setRoomPanelLessons]);

  const handleRoomInputChange = useCallback((value: string) => {
    setRoomInput(value);
    setRoomPanel(roomNameSet.current.has(value) ? value : null, roomPanelDay);
  }, [roomPanelDay, setRoomPanel]);

  const handleRoomBlur = useCallback(() => {
    if (!roomNameSet.current.has(roomInput)) {
      setRoomInput(roomPanelRoom ?? '');
    }
  }, [roomInput, roomPanelRoom]);

  const handleDayChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const day = (e.target.value || null) as Day | null;
    setRoomPanel(roomPanelRoom, day);
  }, [roomPanelRoom, setRoomPanel]);

  const handleToggle = useCallback((className: string, day: Day, lessonNum: LessonNumber) => {
    toggleRoomPanelCell(className, day, lessonNum);
  }, [toggleRoomPanelCell]);

  const markedCount = roomPanelMarkedCells.size;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Кабинет</h3>
        {markedCount > 0 && (
          <button className={styles.clearButton} onClick={clearRoomPanelMarked} title="Очистить все отметки">
            Сброс ({markedCount})
          </button>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.selectors}>
          <DatalistInput
            id="room-panel-options"
            className={styles.select}
            options={roomNames}
            value={roomInput}
            onChange={handleRoomInputChange}
            onBlur={handleRoomBlur}
            placeholder="Кабинет..."
          />

          <select
            className={styles.select}
            value={roomPanelDay ?? ''}
            onChange={handleDayChange}
          >
            <option value="">День...</option>
            {DAYS.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        {roomPanelRoom && roomPanelDay && (
          <div className={styles.list}>
            {roomPanelLessons.length === 0 ? (
              <div className={styles.empty}>Нет занятий</div>
            ) : (
              roomPanelLessons.map(({ className, lessonNum, subjects }) => {
                const key = `${className}|${roomPanelDay}|${lessonNum}`;
                const isChecked = roomPanelMarkedCells.has(key);

                return (
                  <label key={key} className={`${styles.item} ${isChecked ? styles.checked : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(className, roomPanelDay, lessonNum)}
                      className={styles.checkbox}
                    />
                    <span className={styles.lessonNum}>Ур. {lessonNum}</span>
                    <span className={styles.className}>{className}</span>
                    <span className={styles.subject}>
                      {subjects.join(', ')}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
