import { useState, useEffect } from 'react';
import type { User, PageName, Subject } from '../types';
import { getUserSubjects } from '../lib/api/subjects';

interface HomePageProps {
  user: User;
  navigate: (page: PageName, params?: Record<string, string>) => void;
}

// ── Greeting logic ─────────────────────────────────────────────────────────
function buildGreeting(user: User): string {
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 15; // 5am – 2:59pm

  // Possible greetings (some time-dependent)
  const greetings = [
    isMorning ? `صباح الخير يا` : `مساء الخير يا`,
    `أهلا يا`,
    `Welcome home,`,
    user.row === 'right' ? `منور يا` : `منورة يا`,
  ];

  const idx = Math.floor(Math.random() * greetings.length);
  const prefix = greetings[idx];

  // Determine display name
  let displayName: string;
  const isEnglish = prefix.startsWith('Welcome');

  if (isEnglish) {
    // هبة: may use Ms Donadei
    if (user.id === 'heba' && user.nicknames?.length && Math.random() > 0.45) {
      displayName = user.nicknames[0]; // Ms Donadei
    } else {
      displayName = user.nameEn;
    }
  } else {
    // For محمد، حسن، عمر: randomly use nickname
    if (user.nicknames?.length && !user.hebaEnglishOnly && Math.random() > 0.45) {
      const nick = user.nicknames[Math.floor(Math.random() * user.nicknames.length)];
      displayName = nick;
    } else {
      displayName = user.name;
    }
  }

  return `${prefix} ${displayName}`;
}

// ── Subject icon SVGs ──────────────────────────────────────────────────────
const SUBJECT_ICONS: Record<string, JSX.Element> = {
  geography: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  history:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  literature:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  science:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5m4 0h10m0-11v11m0 0H5m14 0v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4"/></svg>,
  general:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
  sports:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24M20 12h-4M8 12H4M12 4v4M12 20v-4"/></svg>,
  tech:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  mental:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14Z"/></svg>,
  cinema:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  music:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  art:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.47-1.125-.29-.289-.438-.652-.438-1.042a1.8 1.8 0 0 1 1.8-1.8h2.13c3.117 0 5.33-2.37 5.33-5.24C22 6.22 17.523 2 12 2z"/></svg>,
  quickwit:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

export default function HomePage({ user, navigate }: HomePageProps) {
  const [greeting, setGreeting] = useState(() => buildGreeting(user));
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Refresh greeting on mount (once per session would be enough)
  useEffect(() => {
    setGreeting(buildGreeting(user));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserSubjects(user.id)
      .then((list) => {
        if (!cancelled) setSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="relative min-h-dvh flex flex-col pb-28 overflow-hidden">
      {/* Top greeting card */}
      <div className="px-4 pt-6">
        <GreetingCard user={user} greeting={greeting} />
      </div>

      {/* Section header */}
      <div className="px-4 mt-7 mb-3 flex items-center gap-3">
        <h2
          className="text-base font-bold text-white/80"
          style={{ fontFamily: "'Tajawal', sans-serif" }}
        >
          الفروع
        </h2>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
        <span className="text-white/30 text-xs font-exo">{subjects.length}</span>
      </div>

      {/* Subject cards grid */}
      {loading ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl animate-glow-pulse"
              style={{ height: 108, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="px-4">
          <p className="text-white/30 text-sm text-center py-8" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            لا توجد فروع مسندة لك بعد
          </p>
        </div>
      ) : (
        <div className="px-4 grid grid-cols-2 gap-3">
          {subjects.map((subject, i) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              index={i}
              onClick={() => navigate('subject', { subjectId: subject.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Greeting Card ──────────────────────────────────────────────────────────
function GreetingCard({ user, greeting }: { user: User; greeting: string }) {
  const hour = new Date().getHours();
  const timeLabel =
    hour >= 5 && hour < 12 ? 'الصباح' :
    hour >= 12 && hour < 17 ? 'الظهيرة' :
    hour >= 17 && hour < 21 ? 'المساء' : 'الليل';

  const timeIcon =
    hour >= 5 && hour < 12
      ? <SunIcon />
      : hour >= 17 || hour < 5
      ? <MoonIcon />
      : <CloudIcon />;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${user.color}20, rgba(255,255,255,0.03))`,
        border: `1px solid ${user.color}35`,
        boxShadow: `0 4px 32px ${user.color}25, inset 0 1px 0 rgba(255,255,255,0.08)`,
        padding: '20px 20px 18px',
      }}
    >
      {/* Shimmer line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${user.color}80,transparent)` }}
      />

      {/* Decorative circle */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${user.color}22 0%, transparent 70%)`,
          filter: 'blur(16px)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: `${user.color}22`,
                color: user.color,
                border: `1px solid ${user.color}40`,
              }}
            >
              {timeLabel}
            </span>
          </div>
          <p
            className="text-xl font-bold text-white mt-2 leading-snug"
            style={{ fontFamily: "'Tajawal', sans-serif", direction: 'rtl' }}
          >
            {greeting}
          </p>
          <p className="text-white/35 text-sm mt-1.5" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            مرحباً بك في منصة التدريب
          </p>
        </div>

        <div
          className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center"
          style={{
            background: user.gradient,
            boxShadow: `0 0 20px ${user.color}50`,
          }}
        >
          <span className="text-white w-7 h-7">{timeIcon}</span>
        </div>
      </div>
    </div>
  );
}

// ── Subject Card ───────────────────────────────────────────────────────────
function SubjectCard({
  subject,
  index,
  onClick,
}: {
  subject: Subject;
  index: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl overflow-hidden text-right transition-all duration-300 animate-slide-up"
      style={{
        animationDelay: `${index * 60}ms`,
        padding: '18px 16px',
        background: `linear-gradient(145deg, ${subject.gradFrom}22, ${subject.gradTo}12)`,
        border: `1px solid ${subject.color}30`,
        boxShadow: hovered
          ? `0 8px 32px ${subject.glow}, 0 0 0 1px ${subject.color}50`
          : `0 2px 12px ${subject.color}15`,
        transform: hovered ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)',
      }}
    >
      {/* Top shimmer */}
      <div
        className="absolute top-0 left-0 right-0 h-px transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg,transparent,${subject.color}90,transparent)`,
          opacity: hovered ? 1 : 0.4,
        }}
      />

      {/* Decorative glow circle */}
      <div
        className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle, ${subject.color}30 0%, transparent 70%)`,
          filter: 'blur(12px)',
          opacity: hovered ? 1 : 0.5,
        }}
      />

      {/* Icon */}
      <div
        className="mb-3 w-10 h-10 rounded-xl flex items-center justify-center relative"
        style={{
          background: `${subject.color}18`,
          border: `1px solid ${subject.color}35`,
          color: subject.color,
          boxShadow: hovered ? `0 0 14px ${subject.color}50` : 'none',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        <span className="w-5 h-5">{SUBJECT_ICONS[subject.id] ?? <DefaultIcon />}</span>
      </div>

      {/* Name */}
      <p
        className="text-sm font-bold text-white leading-tight"
        style={{ fontFamily: "'Tajawal', sans-serif", textShadow: hovered ? `0 0 12px ${subject.color}` : 'none' }}
      >
        {subject.name}
      </p>
      <p className="text-xs text-white/30 mt-0.5" style={{ fontFamily: "'Exo 2', sans-serif" }}>
        {subject.nameEn}
      </p>

      {/* Arrow */}
      <div
        className="absolute bottom-3 left-3 transition-all duration-300"
        style={{ color: subject.color, opacity: hovered ? 1 : 0.4, transform: hovered ? 'translateX(-3px)' : 'translateX(0)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </div>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  );
}
function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  );
}
