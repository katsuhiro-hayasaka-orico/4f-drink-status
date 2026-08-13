import type { Toast } from '../hooks/useDrinkStatus.js';

export interface ToastBarProps {
  toast: Toast;
  onUndo: () => void;
  /** Opens the feedback dialog — the thanks toast carries a small link to it. */
  onFeedback: () => void;
}

export function ToastBar({ toast, onUndo, onFeedback }: ToastBarProps) {
  return (
    <div role="status" className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}>
      <span className="toast__text">{toast.text}</span>
      {toast.kind === 'undo' && (
        <button type="button" className="toast__undo" onClick={onUndo}>
          取り消す
        </button>
      )}
      {toast.kind === 'thanks' && (
        <button type="button" className="toast__undo" onClick={onFeedback}>
          ご意見を聞かせてください
        </button>
      )}
    </div>
  );
}
