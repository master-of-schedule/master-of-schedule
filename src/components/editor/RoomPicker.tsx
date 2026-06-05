/**
 * RoomPicker - Modal for selecting a room when assigning a lesson
 */

import { useMemo, useState } from 'react';
import type { Day, LessonNumber, Room } from '@/types';
import { useDataStore, useScheduleStore } from '@/stores';
import { getAvailableRooms } from '@/logic';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import styles from './RoomPicker.module.css';

interface RoomPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (room: Room) => void;
  day: Day;
  lessonNum: LessonNumber;
  preferredSubject?: string;
  preferredRoom?: string;
  /** Student count for capacity validation */
  studentCount?: number;
  targetClassName?: string;
}

export function RoomPicker({
  isOpen,
  onClose,
  onSelect,
  day,
  lessonNum,
  preferredSubject,
  preferredRoom,
  studentCount,
  targetClassName,
}: RoomPickerProps) {
  const rooms = useDataStore((state) => state.rooms);
  const classes = useDataStore((state) => state.classes);
  const schedule = useScheduleStore((state) => state.schedule);

  const [filter, setFilter] = useState('');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  // Get available rooms for this slot
  const roomList = useMemo(() => Object.values(rooms), [rooms]);

  const availableRooms = useMemo(
    () => getAvailableRooms(schedule, rooms, day, lessonNum, classes, studentCount, targetClassName),
    [schedule, rooms, day, lessonNum, classes, studentCount, targetClassName]
  );

  const availableRoomIds = useMemo(
    () => new Set(availableRooms.map((r) => r.id)),
    [availableRooms]
  );

  // Filter and sort rooms
  const displayedRooms = useMemo(() => {
    let list = showOnlyAvailable ? availableRooms : roomList;

    // Apply text filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      list = list.filter(
        (room) =>
          room.fullName.toLowerCase().includes(lowerFilter) ||
          room.shortName.toLowerCase().includes(lowerFilter)
      );
    }

    // Sort: preferred room first, then regular rooms, then multiClass, then by name
    const isMultiClass = (room: Room) => (room.multiClass ?? 1) > 1;
    const isPreferred = (room: Room) => preferredRoom && room.shortName === preferredRoom;
    return list.sort((a, b) => {
      if (isPreferred(a) !== isPreferred(b)) {
        return isPreferred(a) ? -1 : 1;
      }
      if (isMultiClass(a) !== isMultiClass(b)) {
        return isMultiClass(a) ? 1 : -1;
      }
      return a.fullName.localeCompare(b.fullName, 'ru');
    });
  }, [roomList, availableRooms, showOnlyAvailable, filter, preferredRoom]);

  const handleSelect = (room: Room) => {
    onSelect(room);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выбор кабинета">
      <div className={styles.content}>
        <div className={styles.controls}>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Поиск кабинета..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={showOnlyAvailable}
              onChange={(e) => setShowOnlyAvailable(e.target.checked)}
            />
            Только свободные
          </label>
        </div>

        <div className={styles.info}>
          {day}, {lessonNum} урок
          {preferredSubject && <span> • {preferredSubject}</span>}
        </div>

        <div className={styles.roomList}>
          {displayedRooms.length === 0 ? (
            <div className={styles.empty}>
              {filter ? 'Кабинеты не найдены' : (
                <>
                  Нет свободных кабинетов
                  <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-xs)' }}>
                    Все кабинеты заняты на этом уроке. Снимите галочку «Только свободные»
                  </span>
                </>
              )}
            </div>
          ) : (
            displayedRooms.map((room) => {
              const isAvailable = availableRoomIds.has(room.id);
              const isMultiClass = (room.multiClass ?? 1) > 1;
              const isDefault = preferredRoom === room.shortName;
              return (
                <button
                  key={room.id}
                  className={`${styles.roomButton} ${!isAvailable ? styles.occupied : ''} ${isMultiClass ? styles.virtual : ''} ${isDefault ? styles.preferred : ''}`}
                  onClick={() => handleSelect(room)}
                  disabled={!isAvailable && !isMultiClass}
                >
                  <span className={styles.roomName}>
                    {room.fullName}
                    {isDefault && <span className={styles.defaultBadge}> (по умолч.)</span>}
                  </span>
                  <span className={styles.roomShort}>{room.shortName}</span>
                  {room.capacity && (
                    <span className={styles.roomCapacity}>{room.capacity} мест</span>
                  )}
                  {isMultiClass && (
                    <span className={styles.virtualBadge}>Мульти ({room.multiClass})</span>
                  )}
                  {!isAvailable && !isMultiClass && (
                    <span className={styles.occupiedBadge}>Занят</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} title="Закрыть без выбора">
            Отмена
          </Button>
        </div>
      </div>
    </Modal>
  );
}
