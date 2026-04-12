/**
 * RoomsTable - Display and edit rooms
 */

import { useMemo, useCallback } from 'react';
import type { Room } from '@/types';
import { useDataStore } from '@/stores';
import { useDataTable } from '@/hooks/useDataTable';
import { Button } from '@/components/common/Button';
import { TableActions } from '@/components/common/TableActions';
import { useToast } from '@/components/common/Toast';
import { RoomEditModal } from './RoomEditModal';
import styles from './DataTable.module.css';

export function RoomsTable() {
  const rooms = useDataStore((state) => state.rooms);
  const deleteRoom = useDataStore((state) => state.deleteRoom);
  const { showToast } = useToast();

  const { search, setSearch, editingItem: editingRoom, isAddingNew, copyLabel,
          openEdit, openNew, closeModal, showCopied } = useDataTable<Room>();

  // Convert rooms map to sorted array
  const roomsList = useMemo(() => {
    return Object.values(rooms).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'ru')
    );
  }, [rooms]);

  // Filter by search
  const filteredRooms = useMemo(() => {
    if (!search.trim()) return roomsList;
    const query = search.toLowerCase();
    return roomsList.filter(
      (r) =>
        r.fullName.toLowerCase().includes(query) ||
        r.shortName.toLowerCase().includes(query)
    );
  }, [roomsList, search]);

  const handleCopyTable = useCallback(() => {
    const header = ['Название', 'Код', 'Вместимость', 'Мультикласс'].join('\t');
    const rows = filteredRooms.map(r =>
      [r.fullName, r.shortName, r.capacity ?? '', r.multiClass && r.multiClass > 1 ? `${r.multiClass}` : ''].join('\t')
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    showCopied();
  }, [filteredRooms, showCopied]);

  const handleDelete = useCallback(
    async (room: Room) => {
      if (confirm(`Удалить кабинет "${room.fullName}"?`)) {
        await deleteRoom(room.id);
        showToast(`Кабинет «${room.shortName || room.fullName}» удалён`, 'error');
      }
    },
    [deleteRoom, showToast]
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="primary" onClick={openNew} title="Добавить запись вручную">
          + Добавить
        </Button>
        <Button variant="secondary" onClick={handleCopyTable} title="Скопировать таблицу в буфер обмена (TSV)">
          {copyLabel}
        </Button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
              <th>Код</th>
              <th>Вместимость</th>
              <th>Мультикласс</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filteredRooms.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {search ? 'Ничего не найдено' : (
                    <>
                      Нет кабинетов
                      <br />
                      <span style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'normal' }}>
                        Загрузите данные из Excel или добавьте вручную
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredRooms.map((room) => (
                <tr key={room.id}>
                  <td className={styles.nameCell}>{room.fullName}</td>
                  <td>{room.shortName}</td>
                  <td className={styles.capacityCell}>{room.capacity ?? '—'}</td>
                  <td className={styles.capacityCell}>
                    {room.multiClass && room.multiClass > 1 ? (
                      <span className={styles.multiClassBadge}>×{room.multiClass}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <TableActions
                    onEdit={() => openEdit(room)}
                    onDelete={() => handleDelete(room)}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filteredRooms.length} из {roomsList.length} кабинетов
      </div>

      {(editingRoom || isAddingNew) && (
        <RoomEditModal
          room={editingRoom}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
