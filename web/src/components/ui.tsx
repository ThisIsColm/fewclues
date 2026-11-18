import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import s from './ui.module.css';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' };

export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  return <button type="button" className={`${s.btn} ${s[variant]} ${className}`} {...rest} />;
}

export function IconButton({ label, icon, ...rest }: { label: string; icon: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={s.iconBtn} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

const ICONS = {
  stats: 'M5 20V10M12 20V4M19 20v-7',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  close: 'M18 6 6 18M6 6l12 12',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  league: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M5 12l7-7 7 7',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  down: 'M12 5v14M19 12l-7 7-7-7',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={s.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className={s.wordmark} style={{ fontSize: size }}>
      percentle<span>%</span>
    </span>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'streak' }) {
  return <span className={`${s.pill} ${tone === 'streak' ? s.pillStreak : ''}`}>{children}</span>;
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <section className={`${s.card} ${className}`} {...rest}>
      {children}
    </section>
  );
}

export const ui = s;

/** Native <dialog> bottom sheet: focus-trapped, Esc closes, tap the backdrop to close. */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className={s.sheetHead}>
            <h2 id="sheet-title">{title}</h2>
            <IconButton label="Close" icon="close" onClick={onClose} />
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

let toastSetter: ((m: string | null) => void) | null = null;
let toastTimer: number | undefined;
export function toast(msg: string) {
  toastSetter?.(msg);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastSetter?.(null), 2400);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  return (
    <div role="status" aria-live="polite">
      {msg && <div className={s.toast}>{msg}</div>}
    </div>
  );
}
