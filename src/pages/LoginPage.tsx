import { useState, useRef, useEffect } from 'react';
import type { User } from '../types';
import { getAllUsers, signIn } from '../lib/auth';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [selected, setSelected] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    setLoadError('');
    getAllUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err) => {
        if (!cancelled) {
          const detail = err?.message || err?.error_description || JSON.stringify(err);
          setLoadError(`تعذّر الاتصال بالخادم: ${detail}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const rightRow = users.filter((u) => u.row === 'right');
  const leftRow  = users.filter((u) => u.row === 'left');

  useEffect(() => {
    if (selected) {
      passwordRef.current?.focus();
    }
  }, [selected]);

  const handleUserSelect = (user: User) => {
    setSelected(user);
    setPassword('');
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const authedUser = await signIn(selected.id, password);
      if (authedUser) {
        onLogin(authedUser);
        return;
      }
      setError('كلمة المرور غير صحيحة');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      setPassword('');
      passwordRef.current?.focus();
    } catch {
      setError('تعذّر تسجيل الدخول، تحقق من الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 pb-10 overflow-hidden">
      {/* Background mesh */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 70%), radial-gradient(ellipse 60% 80% at 80% 100%, rgba(168,85,247,0.12) 0%, transparent 70%), #06091a',
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-7 animate-slide-up">
        {/* Logo / Title */}
        <div className="text-center select-none">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-4"
            style={{
              width: 72,
              height: 72,
              background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
              boxShadow: '0 0 30px rgba(59,130,246,0.6), 0 0 60px rgba(59,130,246,0.25)',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1
            className="text-3xl font-black gradient-text"
            style={{ fontFamily: "'Tajawal', sans-serif", letterSpacing: '-0.01em' }}
          >
            فريق العباقرة
          </h1>
          <p className="text-white/40 text-sm mt-1">اختر حسابك للمتابعة</p>
        </div>

        {/* User grid */}
        {loadingUsers && (
          <div className="w-full flex flex-col items-center gap-3 py-6">
            <div
              className="w-8 h-8 rounded-full animate-spin-slow"
              style={{ border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa' }}
            />
            <p className="text-white/30 text-xs">جاري تحميل الحسابات...</p>
          </div>
        )}

        {!loadingUsers && loadError && (
          <div className="w-full glass-md rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-red-400 text-sm">{loadError}</p>
            <button
              onClick={() => setReloadTick((t) => t + 1)}
              className="text-xs font-bold px-4 py-2 rounded-lg text-white/70"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {!loadingUsers && !loadError && (
          <div className="w-full flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2.5">
              {rightRow.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  active={selected?.id === user.id}
                  onClick={() => handleUserSelect(user)}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {leftRow.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  active={selected?.id === user.id}
                  onClick={() => handleUserSelect(user)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Password section */}
        <div
          className="w-full glass-md rounded-2xl overflow-hidden transition-all duration-500"
          style={{
            maxHeight: selected ? 200 : 0,
            opacity: selected ? 1 : 0,
            padding: selected ? '20px' : '0 20px',
            borderColor: selected ? `${selected.color}40` : 'rgba(255,255,255,0.12)',
            boxShadow: selected ? `0 0 24px ${selected.color}30` : 'none',
          }}
        >
          {selected && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-center text-white/60 text-sm">
                مرحباً يا{' '}
                <span className="font-bold text-white">{selected.name}</span>
              </p>

              {/* Password input */}
              <div
                className={`relative rounded-xl overflow-hidden transition-all duration-150 ${shaking ? 'animate-[shake_0.4s_ease]' : ''}`}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${error ? '#ef4444' : `${selected.color}60`}`,
                  boxShadow: error ? '0 0 12px rgba(239,68,68,0.4)' : `0 0 12px ${selected.color}30`,
                }}
              >
                <input
                  ref={passwordRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  disabled={submitting}
                  onChange={(e) => {
                    setPassword(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="● ● ● ● ● ●"
                  className="w-full bg-transparent text-center text-white text-2xl py-3 px-4 font-exo disabled:opacity-50"
                  style={{
                    letterSpacing: '0.3em',
                    caretColor: selected.color,
                  }}
                  autoComplete="current-password"
                />
                {/* Shimmer line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-px"
                  style={{ background: `linear-gradient(90deg,transparent,${selected.color},transparent)` }}
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs text-center animate-scale-in">{error}</p>
              )}

              <button
                type="submit"
                disabled={password.length !== 6 || submitting}
                className="w-full rounded-xl py-3 font-bold text-white transition-all duration-300 disabled:opacity-30"
                style={{
                  background: `linear-gradient(135deg,${selected.color},${selected.gradient.includes(',') ? selected.gradient.split(',').slice(-1)[0].replace(')', '').trim() : selected.color})`,
                  boxShadow: password.length === 6 ? `0 0 20px ${selected.color}60` : 'none',
                  fontSize: '1rem',
                  fontFamily: "'Tajawal', sans-serif",
                }}
              >
                {submitting ? '...جاري الدخول' : 'دخول'}
              </button>
            </form>
          )}
        </div>

        {!selected && !loadingUsers && !loadError && (
          <p className="text-white/25 text-xs text-center">
            اختر اسمك من الأعلى
          </p>
        )}
      </div>
    </div>
  );
}

function UserCard({ user, active, onClick }: { user: User; active: boolean; onClick: () => void }) {
  const initials = user.name.slice(0, 2);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl p-2.5 transition-all duration-300 select-none"
      style={{
        background: active
          ? `${user.color}20`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? user.color : 'rgba(255,255,255,0.08)'}`,
        boxShadow: active
          ? `0 0 18px ${user.color}50, 0 0 40px ${user.color}20`
          : 'none',
        transform: active ? 'scale(1.06) translateY(-2px)' : 'scale(1)',
      }}
    >
      {/* Avatar */}
      <div
        className="rounded-xl flex items-center justify-center font-black text-sm relative overflow-hidden"
        style={{
          width: 44,
          height: 44,
          background: active ? user.gradient : `${user.color}22`,
          boxShadow: active ? `0 0 14px ${user.color}60` : 'none',
          transition: 'all 0.3s ease',
          fontFamily: "'Tajawal', sans-serif",
        }}
      >
        {active && (
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)',
            }}
          />
        )}
        <span
          className="relative"
          style={{ color: active ? 'white' : user.color, textShadow: active ? '0 1px 4px rgba(0,0,0,0.4)' : 'none' }}
        >
          {initials}
        </span>
      </div>

      {/* Name */}
      <span
        className="text-xs font-semibold transition-colors duration-300"
        style={{
          color: active ? 'white' : 'rgba(255,255,255,0.55)',
          fontFamily: "'Tajawal', sans-serif",
          textShadow: active ? `0 0 10px ${user.color}` : 'none',
        }}
      >
        {user.name}
      </span>
    </button>
  );
}
