import { useWheelStore } from '../state/store';

/** Single polite live region for every status message. */
export function Announcer() {
  const notice = useWheelStore((s) => s.notice);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {notice && <span key={notice.id}>{notice.text}</span>}
    </div>
  );
}
