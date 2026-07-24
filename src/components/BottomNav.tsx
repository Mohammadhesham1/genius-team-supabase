import type { PageName } from '../types';

interface BottomNavProps {
  currentPage: PageName;
  navigate: (page: PageName) => void;
}

function IconStats() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  );
}

function IconGroup() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6"  cy="8" r="2.5"/>
      <circle cx="12" cy="8" r="2.5"/>
      <circle cx="18" cy="8" r="2.5"/>
      <path d="M1 20c0-3 2-5 5-5h2M8 20c0-3 2-5 5-5h2M15 20c0-3 2-5 5-5"/>
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  );
}

function IconDumbbell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="10" width="4" height="4" rx="1"/>
      <rect x="18" y="10" width="4" height="4" rx="1"/>
      <rect x="4" y="8" width="3" height="8" rx="1"/>
      <rect x="17" y="8" width="3" height="8" rx="1"/>
      <line x1="7" y1="12" x2="17" y2="12" strokeWidth="2.5"/>
    </svg>
  );
}

function IconSwords() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2l7.5 7.5-9 9L5 11l9-9z"/>
      <path d="M2 22l5-5M6 15l-4 4M15 8l1 1"/>
      <path d="M14 10l-8 8 2 2 8-8"/>
    </svg>
  );
}

const NAV_ITEMS: { page: PageName; label: string; Icon: () => JSX.Element; color: string }[] = [
  { page: 'stats',    label: 'إحصائيات', Icon: IconStats,    color: '#a855f7' },
  { page: 'group',    label: 'تدريب جماعي',  Icon: IconGroup,    color: '#3b82f6' },
  { page: 'home',     label: 'الرئيسية',  Icon: IconHome,     color: '#60a5fa' },
  { page: 'solo',     label: 'تمرين فردي', Icon: IconDumbbell, color: '#10b981' },
  { page: 'oneonone', label: '1 v 1',     Icon: IconSwords,   color: '#ef4444' },
];

export default function BottomNav({ currentPage, navigate }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 px-4"
      style={{ direction: 'ltr' }}
    >
      <div
        className="glass-strong rounded-2xl flex items-center w-full max-w-sm"
        style={{
          padding: '10px 8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {NAV_ITEMS.map(({ page, label, Icon, color }) => {
          const active = currentPage === page || (page === 'home' && currentPage === 'subject');
          return (
            <button
              key={page}
              onClick={() => navigate(page)}
              className="flex-1 flex flex-col items-center gap-1 relative py-1 rounded-xl transition-all duration-300"
              style={{
                color: active ? color : 'rgba(255,255,255,0.4)',
              }}
              aria-label={label}
            >
              {active && (
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: `${color}18`,
                    boxShadow: `0 0 16px ${color}40, inset 0 0 16px ${color}10`,
                  }}
                />
              )}
              <span
                className="relative"
                style={{
                  filter: active ? `drop-shadow(0 0 6px ${color})` : 'none',
                  transition: 'filter 0.3s ease',
                }}
              >
                <Icon />
              </span>
              <span
                className="relative text-[9px] font-medium"
                style={{
                  fontFamily: "'Tajawal', sans-serif",
                  direction: 'rtl',
                  textShadow: active ? `0 0 8px ${color}` : 'none',
                  transition: 'text-shadow 0.3s ease',
                }}
              >
                {label}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    width: 20,
                    height: 3,
                    background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                    boxShadow: `0 0 8px ${color}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
