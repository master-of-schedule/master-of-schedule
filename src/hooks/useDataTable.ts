/**
 * Shared state management for data table components.
 * Handles search, edit/add modal open state, and clipboard copy feedback.
 */

import { useState, useCallback } from 'react';

export interface UseDataTableResult<T> {
  search: string;
  setSearch: (s: string) => void;
  editingItem: T | null;
  isAddingNew: boolean;
  copyLabel: string;
  openEdit: (item: T) => void;
  openNew: () => void;
  closeModal: () => void;
  showCopied: () => void;
}

export function useDataTable<T>(): UseDataTableResult<T> {
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Копировать таблицу');

  const openEdit = useCallback((item: T) => setEditingItem(item), []);
  const openNew = useCallback(() => setIsAddingNew(true), []);
  const closeModal = useCallback(() => {
    setEditingItem(null);
    setIsAddingNew(false);
  }, []);
  const showCopied = useCallback(() => {
    setCopyLabel('Скопировано!');
    setTimeout(() => setCopyLabel('Копировать таблицу'), 1500);
  }, []);

  return { search, setSearch, editingItem, isAddingNew, copyLabel, openEdit, openNew, closeModal, showCopied };
}
