import type { Toast } from '../hooks/useDrinkStatus.js';

export interface ToastBarProps {
  toast: Toast;
  onUndo: () => void;
  /** Opens the feedback dialog — the thanks and milestone toasts link to it. */
  onFeedback: () => void;
}

const MODIFIER: Partial<Record<Toast['kind'], string>> = {
  error: ' toast--error',
  celebrate: ' toast--celebrate',
};

export function ToastBar({ toast, onUndo, onFeedback }: ToastBarProps) {
  return (
    <div role="status" className={`toast${MODIFIER[toast.kind] ?? ''}`}>
      <span className="toast__text">{toast.text}</span>
      {/* Undoable from the tap: while sending, the hook remembers the wish
          and deletes the row the moment the server minted it. */}
      {(toast.kind === 'sending' || toast.kind === 'undo') && (
        <button type="button" className="toast__undo" onClick={onUndo}>
          取り消す
        </button>
      )}
      {/* The milestone toast keeps the same invitation: it is the one moment
          someone is most likely to have something to say. */}
      {(toast.kind === 'thanks' || toast.kind === 'celebrate') && (
        <button type="button" className="toast__undo" onClick={onFeedback}>
          ご意見を聞かせてください
        </button>
      )}
    </div>
  );
}
