import type { Toast } from '../hooks/useDrinkStatus.js';

export interface ToastBarProps {
  toast: Toast;
  onUndo: () => void;
}

export function ToastBar({ toast, onUndo }: ToastBarProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}
    >
      <span className="toast__text">{toast.text}</span>
      {toast.kind === 'undo' && (
        <button type="button" className="toast__undo" onClick={onUndo}>
          取り消す
        </button>
      )}
    </div>
  );
}
