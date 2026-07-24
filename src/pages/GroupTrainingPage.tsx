import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, PageName, Subject } from '../types';
import { getUserSubjects, getSubjectById } from '../lib/api/subjects';
import { getAllUsers } from '../lib/auth';
import {
  pickNextRound,
  getGroupRoundQuestions,
  createGroupSession,
  submitGroupAnswer,
  updateGroupSessionProgress,
  completeGroupSession,
  type GroupQuestion,
} from '../lib/api/group';

interface GroupTrainingPageProps {
  user: User;
  navigate: (page: PageName, params?: Record<string, string>) => void;
}

type Phase = 'pick-subject' | 'no-questions' | 'ready' | 'timer' | 'grace' | 'reveal' | 'timer2' | 'grace2' | 'second-reveal' | 'assign-member' | 'round-summary';

const TIMER1 = 20;
const TIMER2 = 10;
const GRACE = 6;

interface RoundEntry {
  qIdx: number;
  correct: boolean;
  timeMs: number;
  memberId?: string;
  attempt: 1 | 2;
}

export default function GroupTrainingPage({ user, navigate: _navigate }: GroupTrainingPageProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [roundPreview, setRoundPreview] = useState<Record<string, number>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [subjectId, setSubjectId] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  const [roundNo, setRoundNo] = useState(1);
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<GroupQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick-subject');
  const [timeLeft, setTimeLeft] = useState(TIMER1);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [entries, setEntries] = useState<RoundEntry[]>([]);
  const [pendingEntry, setPendingEntry] = useState<Partial<RoundEntry>>({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentQ = questions[qIdx];
  const rightRow = allUsers.filter((u) => u.row === 'right');
  const leftRow  = allUsers.filter((u) => u.row === 'left');

  useEffect(() => {
    getAllUsers().then(setAllUsers).catch(() => setAllUsers([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSubjects(true);
    getUserSubjects(user.id)
      .then(async (list) => {
        if (cancelled) return;
        setSubjects(list);
        const rounds = await Promise.all(list.map((s) => pickNextRound(s.id).catch(() => 1)));
        if (cancelled) return;
        const map: Record<string, number> = {};
        list.forEach((s, i) => { map[s.id] = rounds[i]; });
        setRoundPreview(map);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSubjects(false);
      });
    return () => { cancelled = true; };
  }, [user.id]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startCountdown = useCallback((seconds: number, onDone: () => void) => {
    stopTimer();
    const t0 = Date.now();
    setStartTime(t0);
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); timerRef.current = null; onDone(); return 0; }
        return t - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    if (phase === 'grace') startCountdown(GRACE, () => setPhase('reveal'));
    else if (phase === 'timer2') startCountdown(TIMER2, () => setPhase('grace2'));
    else if (phase === 'grace2') startCountdown(GRACE, () => setPhase('second-reveal'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startSubject = async (sid: string) => {
    setLoadingQuestions(true);
    setSubjectId(sid);
    try {
      const [s, nextRound] = await Promise.all([getSubjectById(sid), pickNextRound(sid)]);
      const qs = await getGroupRoundQuestions(sid, nextRound);
      setSubject(s);
      setRoundNo(nextRound);

      if (qs.length === 0) {
        setPhase('no-questions');
        return;
      }
      const newSessionId = await createGroupSession(sid, nextRound, user.id);
      setSessionId(newSessionId);
      setQuestions(qs);
      setQIdx(0);
      setEntries([]);
      setPhase('ready');
    } catch {
      setPhase('no-questions');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const beginTimer = () => {
    setPhase('timer');
    startCountdown(TIMER1, () => setPhase('grace'));
  };

  const handleAnswerButton = () => {
    const e = Date.now() - startTime;
    setElapsed(e);
    stopTimer();
    if (phase === 'timer') setPhase('grace');
    else if (phase === 'timer2') setPhase('grace2');
  };

  const handleCorrect = () => {
    setPendingEntry({ correct: true, timeMs: elapsed, attempt: phase === 'reveal' ? 1 : 2 });
    setPhase('assign-member');
  };

  const handleWrong = () => {
    if (phase === 'reveal') {
      // Give second chance
      setPhase('timer2');
      return;
    }
    // Final wrong — persist (no one credited) and move on.
    if (currentQ) {
      submitGroupAnswer({
        sessionId,
        position: currentQ.position,
        attemptNo: 2,
        timeMs: elapsed,
        isCorrect: false,
        creditedUserId: null,
      }).catch(() => {});
    }
    setEntries((e) => [...e, { qIdx, correct: false, timeMs: elapsed, attempt: 2 }]);
    nextQuestion();
  };

  const assignMember = (memberId: string) => {
    if (currentQ) {
      submitGroupAnswer({
        sessionId,
        position: currentQ.position,
        attemptNo: (pendingEntry.attempt ?? 1) as 1 | 2,
        timeMs: pendingEntry.timeMs ?? elapsed,
        isCorrect: true,
        creditedUserId: memberId,
      }).catch(() => {});
    }
    setEntries((e) => [...e, { ...pendingEntry, qIdx, memberId } as RoundEntry]);
    setPendingEntry({});
    nextQuestion();
  };

  const nextQuestion = () => {
    const next = qIdx + 1;
    if (next >= questions.length) {
      completeGroupSession(sessionId).catch(() => {});
      setShowSummary(true);
      setPhase('round-summary');
      return;
    }
    updateGroupSessionProgress(sessionId, next).catch(() => {});
    setQIdx(next);
    setPhase('ready');
  };

  const timerMax = phase === 'timer' || phase === 'grace' ? TIMER1 : TIMER2;
  const timerColor = timeLeft > 10 ? '#10b981' : timeLeft > 5 ? '#f59e0b' : '#ef4444';

  if (phase === 'pick-subject') {
    return (
      <div className="relative min-h-dvh flex flex-col pb-28">
        <div className="px-4 pt-12 pb-4">
          <h1 className="text-2xl font-black gradient-text" style={{ fontFamily: "'Tajawal',sans-serif" }}>التدريب الجماعي</h1>
          <p className="text-white/35 text-sm mt-1" style={{ fontFamily: "'Tajawal',sans-serif" }}>اختر فرعاً للجلسة</p>
        </div>
        {loadingSubjects ? (
          <div className="px-4 grid grid-cols-2 gap-3 mt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl animate-glow-pulse" style={{ height: 72, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
            ))}
          </div>
        ) : (
          <div className="px-4 grid grid-cols-2 gap-3 mt-2">
            {subjects.map((s) => (
              <button
                key={s.id}
                onClick={() => startSubject(s.id)}
                disabled={loadingQuestions}
                className="rounded-2xl p-4 text-right transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
                style={{ background: `${s.color}15`, border: `1px solid ${s.color}30` }}
              >
                <p className="font-bold text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{s.name}</p>
                <p className="text-white/30 text-xs font-exo mt-0.5">الجولة {roundPreview[s.id] ?? '...'}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'no-questions') {
    return (
      <div className="relative min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-4xl">🧩</p>
        <p className="text-white font-bold" style={{ fontFamily: "'Tajawal',sans-serif" }}>
          لسه مفيش أسئلة جماعية لهذا الفرع
        </p>
        <p className="text-white/30 text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>
          أضف أسئلة في جدول group_round_questions على Supabase
        </p>
        <button
          onClick={() => { setPhase('pick-subject'); setSubjectId(''); setSubject(null); }}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}
        >
          رجوع للفروع
        </button>
      </div>
    );
  }

  if (phase === 'round-summary' && showSummary && subject) {
    return (
      <RoundSummary
        entries={entries}
        questions={questions}
        subject={subject}
        users={allUsers}
        onClose={() => { setPhase('pick-subject'); setSubjectId(''); setSubject(null); setShowSummary(false); }}
      />
    );
  }

  if (loadingQuestions || !currentQ || !subject) {
    return (
      <div className="relative min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-spin-slow" style={{ border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa' }} />
      </div>
    );
  }

  const isAnswerPhase = phase === 'timer' || phase === 'timer2';

  return (
    <div className="relative min-h-dvh flex flex-col pb-28 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-10 pb-3 flex items-center gap-3">
        <button
          onClick={() => { stopTimer(); setPhase('pick-subject'); setSubjectId(''); setSubject(null); }}
          className="w-9 h-9 rounded-xl flex items-center justify-center glass-md"
          style={{ color: subject.color }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: subject.color, fontFamily: "'Tajawal',sans-serif" }}>{subject.name} — جولة {roundNo}</p>
          <p className="text-white/30 text-xs font-exo">{qIdx + 1} / {questions.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm font-bold font-exo">{entries.filter((e) => e.correct).length}</span>
          <span className="text-white/20 text-xs">/</span>
          <span className="text-white/40 text-sm font-exo">{entries.length}</span>
        </div>
        <button onClick={() => setShowSidebar(!showSidebar)} className="w-9 h-9 rounded-xl flex items-center justify-center glass-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="px-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        {/* Question card */}
        <div
          className="rounded-2xl p-5"
          style={{ background: `${subject.color}0e`, border: `1px solid ${subject.color}25`, boxShadow: `0 4px 24px ${subject.glow}` }}
        >
          <p className="text-lg font-bold text-white text-center" style={{ fontFamily: "'Tajawal',sans-serif", direction: 'rtl' }}>
            {currentQ.question}
          </p>
        </div>

        {/* Ready / Timer states */}
        {phase === 'ready' && (
          <button
            onClick={beginTimer}
            className="w-full rounded-2xl py-5 font-black text-white text-xl"
            style={{ background: `linear-gradient(135deg,${subject.gradFrom},${subject.gradTo})`, boxShadow: `0 0 28px ${subject.glow}`, fontFamily: "'Tajawal',sans-serif" }}
          >
            ابدأ التايمر
          </button>
        )}

        {(phase === 'timer' || phase === 'timer2' || phase === 'grace' || phase === 'grace2') && (
          <div className="flex flex-col items-center gap-4">
            {/* Timer ring */}
            <div className="relative w-24 h-24">
              <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
                <circle className="timer-track" cx="48" cy="48" r="44" strokeWidth="4"/>
                <circle
                  className="timer-fill"
                  cx="48" cy="48" r="44"
                  strokeWidth="4"
                  stroke={timerColor}
                  strokeDasharray="276.46"
                  strokeDashoffset={276.46 - (timeLeft / timerMax) * 276.46}
                  style={{ filter: `drop-shadow(0 0 6px ${timerColor})` }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black font-exo" style={{ color: timerColor, textShadow: `0 0 10px ${timerColor}` }}>{timeLeft}</span>
                <span className="text-white/30 text-[9px] font-exo">{phase === 'timer' ? 'جولة ١' : phase === 'timer2' ? 'جولة ٢' : 'وقت'}</span>
              </div>
            </div>

            {isAnswerPhase && (
              <button
                onClick={handleAnswerButton}
                className="w-full rounded-2xl py-4 font-black text-white text-base"
                style={{ background: `linear-gradient(135deg,${subject.gradFrom},${subject.gradTo})`, boxShadow: `0 0 20px ${subject.glow}`, fontFamily: "'Tajawal',sans-serif" }}
              >
                إجابة
              </button>
            )}
          </div>
        )}

        {/* Reveal correct answer */}
        {(phase === 'reveal' || phase === 'second-reveal') && (
          <div className="flex flex-col gap-3 animate-slide-up">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <p className="text-green-400/60 text-xs mb-1" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإجابة الصحيحة</p>
              <p className="text-white font-bold text-base" style={{ fontFamily: "'Tajawal',sans-serif" }}>{currentQ.answer}</p>
            </div>

            {/* Elapsed */}
            {elapsed > 0 && (
              <p className="text-white/30 text-xs text-center font-exo">
                وقت الإجابة: {(elapsed / 1000).toFixed(1)}s
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCorrect}
                className="rounded-xl py-3.5 font-bold text-base"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', fontFamily: "'Tajawal',sans-serif", boxShadow: '0 0 16px rgba(16,185,129,0.25)' }}
              >
                صح
              </button>
              <button
                onClick={handleWrong}
                className="rounded-xl py-3.5 font-bold text-base"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontFamily: "'Tajawal',sans-serif", boxShadow: '0 0 16px rgba(239,68,68,0.25)' }}
              >
                {phase === 'reveal' ? 'غلط (جولة ٢)' : 'غلط'}
              </button>
            </div>
          </div>
        )}

        {/* Assign to member */}
        {phase === 'assign-member' && (
          <div className="flex flex-col gap-3 animate-slide-up">
            <p className="text-white/50 text-sm text-center" style={{ fontFamily: "'Tajawal',sans-serif" }}>من أجاب؟</p>

            {/* Right row */}
            <div className="grid grid-cols-4 gap-2">
              {rightRow.map((u) => (
                <button
                  key={u.id}
                  onClick={() => assignMember(u.id)}
                  className="rounded-xl py-3 flex flex-col items-center gap-1 transition-all duration-200 hover:scale-[1.04]"
                  style={{ background: `${u.color}15`, border: `1px solid ${u.color}30` }}
                >
                  <span className="text-xs font-bold text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{u.name}</span>
                </button>
              ))}
            </div>

            {/* Left row */}
            <div className="grid grid-cols-4 gap-2">
              {leftRow.map((u) => (
                <button
                  key={u.id}
                  onClick={() => assignMember(u.id)}
                  className="rounded-xl py-3 flex flex-col items-center gap-1 transition-all duration-200 hover:scale-[1.04]"
                  style={{ background: `${u.color}15`, border: `1px solid ${u.color}30` }}
                >
                  <span className="text-xs font-bold text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nav arrows */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center gap-4 px-4 z-30">
        <button
          onClick={() => { if (qIdx > 0) { stopTimer(); setQIdx((q) => q - 1); setPhase('ready'); } }}
          disabled={qIdx === 0}
          className="w-10 h-10 rounded-xl flex items-center justify-center glass disabled:opacity-20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button
          onClick={() => { stopTimer(); nextQuestion(); }}
          disabled={qIdx >= questions.length - 1}
          className="w-10 h-10 rounded-xl flex items-center justify-center glass disabled:opacity-20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      {showSidebar && subject && (
        <GroupSidebar questions={questions} currentIdx={qIdx} entries={entries} subject={subject}
          onSelect={(i) => { stopTimer(); setQIdx(i); setPhase('ready'); setShowSidebar(false); }}
          onClose={() => setShowSidebar(false)} />
      )}
    </div>
  );
}

// ── Round Summary ──────────────────────────────────────────────────────────
function RoundSummary({ entries, questions, subject, users, onClose }: {
  entries: RoundEntry[];
  questions: GroupQuestion[];
  subject: Subject;
  users: User[];
  onClose: () => void;
}) {
  const correct = entries.filter((e) => e.correct);
  const wrong   = entries.filter((e) => !e.correct);
  const avgAll  = entries.length ? (entries.reduce((a, e) => a + e.timeMs, 0) / entries.length / 1000).toFixed(1) : '—';
  const avgOk   = correct.length ? (correct.reduce((a, e) => a + e.timeMs, 0) / correct.length / 1000).toFixed(1) : '—';
  const avgBad  = wrong.length ? (wrong.reduce((a, e) => a + e.timeMs, 0) / wrong.length / 1000).toFixed(1) : '—';

  // Per-member scores
  const memberMap: Record<string, number> = {};
  entries.forEach((e) => { if (e.memberId && e.correct) memberMap[e.memberId] = (memberMap[e.memberId] ?? 0) + 1; });

  return (
    <div className="relative min-h-dvh flex flex-col pb-28 overflow-y-auto">
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center glass-md" style={{ color: subject.color }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h1 className="text-xl font-black text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>ملخص الجولة</h1>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'صحيحة', value: correct.length, color: '#34d399' },
            { label: 'خاطئة', value: wrong.length, color: '#f87171' },
            { label: 'المجموع', value: entries.length, color: '#60a5fa' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl p-3 text-center" style={{ background: `${s.color}0e`, border: `1px solid ${s.color}25` }}>
              <p className="text-2xl font-black font-exo" style={{ color: s.color }}>{s.value}</p>
              <p className="text-white/40 text-xs mt-0.5" style={{ fontFamily: "'Tajawal',sans-serif" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Speed stats */}
        <div className="glass-md rounded-2xl p-4">
          <p className="text-white/50 text-xs mb-3" style={{ fontFamily: "'Tajawal',sans-serif" }}>متوسط السرعة</p>
          {[
            { label: 'الكلية', value: avgAll, color: '#60a5fa' },
            { label: 'الصحيحة', value: avgOk, color: '#34d399' },
            { label: 'الخاطئة', value: avgBad, color: '#f87171' },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <span className="text-white/50 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>{s.label}</span>
              <span className="font-bold text-sm font-exo" style={{ color: s.color }}>{s.value}s</span>
            </div>
          ))}
        </div>

        {/* Per-member */}
        {Object.keys(memberMap).length > 0 && (
          <div className="glass-md rounded-2xl p-4">
            <p className="text-white/50 text-xs mb-3" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإجابات الصحيحة بالأعضاء</p>
            {Object.entries(memberMap).sort((a, b) => b[1] - a[1]).map(([uid, count]) => {
              const u = users.find((u) => u.id === uid);
              if (!u) return null;
              return (
                <div key={uid} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-white font-bold text-sm" style={{ fontFamily: "'Tajawal',sans-serif", color: u.color }}>{u.name}</span>
                  <span className="font-bold font-exo text-sm text-green-400">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Correct list */}
        <div className="glass-md rounded-2xl p-4">
          <p className="text-green-400/70 text-xs mb-3" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإجابات الصحيحة</p>
          {correct.map((e) => (
            <div key={e.qIdx} className="py-2 border-b border-white/5 last:border-0">
              <p className="text-white/70 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>{questions[e.qIdx]?.question}</p>
              <p className="text-green-400 text-xs font-bold mt-0.5" style={{ fontFamily: "'Tajawal',sans-serif" }}>↳ {questions[e.qIdx]?.answer}</p>
            </div>
          ))}
          {correct.length === 0 && <p className="text-white/25 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>—</p>}
        </div>

        {/* Wrong list */}
        <div className="glass-md rounded-2xl p-4 mb-2">
          <p className="text-red-400/70 text-xs mb-3" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإجابات الخاطئة</p>
          {wrong.map((e) => (
            <div key={e.qIdx} className="py-2 border-b border-white/5 last:border-0">
              <p className="text-white/70 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>{questions[e.qIdx]?.question}</p>
              <p className="text-red-400 text-xs font-bold mt-0.5" style={{ fontFamily: "'Tajawal',sans-serif" }}>↳ {questions[e.qIdx]?.answer}</p>
            </div>
          ))}
          {wrong.length === 0 && <p className="text-white/25 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>—</p>}
        </div>
      </div>
    </div>
  );
}

// ── Group Sidebar ──────────────────────────────────────────────────────────
function GroupSidebar({ questions, currentIdx, entries, subject, onSelect, onClose }: {
  questions: GroupQuestion[];
  currentIdx: number;
  entries: RoundEntry[];
  subject: Subject;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const doneMap: Record<number, boolean> = {};
  entries.forEach((e) => { doneMap[e.qIdx] = e.correct; });

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="h-full w-72 flex flex-col overflow-hidden"
        style={{ background: 'rgba(6,9,26,0.97)', backdropFilter: 'blur(24px)', borderRight: `1px solid ${subject.color}20` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-12 pb-4" style={{ borderBottom: `1px solid ${subject.color}15` }}>
          <p className="font-bold text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>الأسئلة</p>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {questions.map((q, i) => {
            const done = i in doneMap;
            const ok = doneMap[i];
            const cur = i === currentIdx;
            return (
              <button
                key={q.id}
                onClick={() => onSelect(i)}
                className="w-full text-right rounded-xl px-3 py-2.5 mb-1.5 flex items-center gap-2.5 transition-all"
                style={{
                  background: cur ? `${subject.color}15` : done ? (ok ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${cur ? subject.color + '40' : done ? (ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold font-exo"
                  style={{ background: done ? (ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') : 'rgba(255,255,255,0.06)', color: done ? (ok ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.3)' }}>
                  {done ? (ok ? '✓' : '✗') : i + 1}
                </span>
                <span className="flex-1 text-xs text-white/60 truncate" style={{ fontFamily: "'Tajawal',sans-serif" }}>
                  {q.question.slice(0, 40)}...
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
