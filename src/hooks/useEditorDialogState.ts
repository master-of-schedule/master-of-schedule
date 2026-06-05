import { useCallback, useMemo, useReducer } from 'react';
import {
  reduceEditorDialog,
  type ChangeRoomDialogData,
  type MoveRoomDialogData,
  type ReplacementDialogData,
  type RoomDialogData,
} from '@/logic';

export function useEditorDialogState() {
  const [dialog, dispatch] = useReducer(reduceEditorDialog, { type: 'none' });

  const openRoom = useCallback(
    (data: RoomDialogData) => dispatch({ type: 'OPEN_ROOM', data }),
    []
  );
  const openReplacement = useCallback(
    (data: ReplacementDialogData) => dispatch({ type: 'OPEN_REPLACEMENT', data }),
    []
  );
  const openChangeRoom = useCallback(
    (data: ChangeRoomDialogData) => dispatch({ type: 'OPEN_CHANGE_ROOM', data }),
    []
  );
  const openMoveRoom = useCallback(
    (data: MoveRoomDialogData) => dispatch({ type: 'OPEN_MOVE_ROOM', data }),
    []
  );
  const close = useCallback(() => dispatch({ type: 'CLOSE' }), []);

  return useMemo(
    () => ({
      dialog,
      openRoom,
      openReplacement,
      openChangeRoom,
      openMoveRoom,
      close,
    }),
    [dialog, openRoom, openReplacement, openChangeRoom, openMoveRoom, close]
  );
}
