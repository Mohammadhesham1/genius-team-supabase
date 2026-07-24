import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, PageName, Question, Subject } from '../types';
import { getUserSubjects, getSubjectById } from '../lib/api/subjects';
import { getOrCreateSoloProgress, getSoloQuestions, getQuestionCount, submitSoloAnswer, advanceSoloProgress } from '../lib/api/solo';

interface SoloTrainingPageProps {
  user: User;
  navigate: (page: PageName, params?: Record<string, string>) => void;
}

type Phase =
  | 'pick-subject'
  | 'no-questions'  // reached the end of the subject's question bank
  | 'timer1'        // 20s first attempt
  | 'grace1'        // 6s grace after timer1
  | 'timer2'        // 10s second attempt
  | 'grace2'        // 6s grace after timer2
  | 'reveal';       // show correct + user answers

const TIMER1 = 20;
const TIMER2 = 10;
const GRACE = 6;

export default function SoloTrainingPage({ user, navigate: _navigate }: SoloTrainingPageProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});

  const [subjectId, setSubjectId] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick-subject');
  const [timeLeft, setTimeLeft] = useState(TIMER1);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [sessionScore, setSessionScore] = useState({ correct: 0, total: 0 });
  const [showSidebar, setShowSidebar] = useState(false);
  const [resultHistory, setResultHistory] = useState<{ qIdx: number; correct: boolean; attempt: 1 | 2 }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);
  // Wall-clock markers used to compute first/second attempt durations for solo_answers.
  const questionStartRef = useRef<number | null>(null);
  const firstDoneAtRef = useRef<number | null>(null);

  const currentQ = questions[qIdx];

  useEffect(() => {
    let cancelled = false;
    setLoadingSubjects(true);
    getUserSubjects(user.id)
      .then(async (list) => {
        if (cancelled) return;
        setSubjects(list);
        const counts = await Promise.all(list.map((s) => getQuestionCount(s.id).catch(() => 0)));
        if (cancelled) return;
        const map: Record<string, number> = {};
        list.forEach((s, i) => { map[s.id] = counts[i]; });
        setQuestionCounts(map);
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
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); timerRef.current = null; onDone(); return 0; }
        return t - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const startSubject = async (sid: string) => {
    setLoadingQuestions(true);
    setSubjectId(sid);
    try {
      const [s, nextPos] = await Promise.all([getSubjectById(sid), getOrCreateSoloProgress(user.id, sid)]);
      const qs = await getSoloQuestions(sid, nextPos);
      setSubject(s);
      setQuestions(qs);
      setQIdx(0);
      setSessionScore({ correct: 0, total: 0 });
      setResultHistory([]);
      setAnswer1(''); setAnswer2('');

      if (qs.length === 0) {
        setPhase('no-questions');
        return;
      }
      setPhase('timer1');
      questionStartRef.current = Date.now();
      firstDoneAtRef.current = null;
      startCountdown(TIMER1, () => setPhase('grace1'));
      setTimeout(() => inputRef1.current?.focus(), 100);
    } catch {
      setPhase('no-questions');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Phase transitions
  useEffect(() => {
    if (phase === 'grace1') {
      startCountdown(GRACE, () => setPhase('timer2'));
    } else if (phase === 'timer2') {
      firstDoneAtRef.current = Date.now();
      startCountdown(TIMER2, () => setPhase('grace2'));
      setTimeout(() => inputRef2.current?.focus(), 100);
    } else if (phase === 'grace2') {
      startCountdown(GRACE, () => setPhase('reveal'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleAnswerButton = () => {
    stopTimer();
    if (phase === 'timer1') setPhase('grace1');
    else if (phase === 'timer2') setPhase('grace2');
  };

  /** Fire-and-forget persistence so the timed game never stalls on the network. */
  const recordAnswer = (isCorrect: boolean, correctOn: 1 | 2 | null) => {
    if (!currentQ) return;
    const now = Date.now();
    const firstMs = questionStartRef.current != null && firstDoneAtRef.current != null
      ? firstDoneAtRef.current - questionStartRef.current
      : null;
    const secondMs = firstDoneAtRef.current != null ? now - firstDoneAtRef.current : null;
    const position = currentQ.position;

    submitSoloAnswer({
      userId: user.id,
      subjectId,
      questionId: currentQ.id,
      firstAnswer: answer1,
      firstTimeMs: firstMs,
      secondAnswer: answer2,
      secondTimeMs: secondMs,
      isCorrect,
      correctOn,
    }).catch(() => {});

    if (position != null) {
      advanceSoloProgress(user.id, subjectId, position + 1).catch(() => {});
    }
  };

  const handleCorrect = (attempt: 1 | 2) => {
    recordAnswer(true, attempt);
    setSessionScore((s) => ({ correct: s.correct + 1, total: s.total + 1 }));
    setResultHistory((h) => [...h, { qIdx, correct: true, attempt }]);
    nextQuestion();
  };

  const handleWrong = () => {
    recordAnswer(false, null);
    setSessionScore((s) => ({ ...s, total: s.total + 1 }));
    setResultHistory((h) => [...h, { qIdx, correct: false, attempt: 2 }]);
    nextQuestion();
  };

  const nextQuestion = () => {
    const next = qIdx + 1;
    if (next >= questions.length) {
      setPhase('pick-subject');
      setSubjectId('');
      setSubject(null);
      return;
    }
    setQIdx(next);
    setAnswer1(''); setAnswer2('');
    setPhase('timer1');
    questionStartRef.current = Date.now();
    firstDoneAtRef.current = null;
    startCountdown(TIMER1, () => setPhase('grace1'));
    setTimeout(() => inputRef1.current?.focus(), 100);
  };

  const jumpToQuestion = (i: number) => {
    stopTimer();
    setQIdx(i);
    setPhase('timer1');
    setAnswer1(''); setAnswer2('');
    questionStartRef.current = Date.now();
    firstDoneAtRef.current = null;
    startCountdown(TIMER1, () => setPhase('grace1'));
  };

  const timerMax = phase === 'timer1' || phase === 'grace1' ? TIMER1
    : phase === 'timer2' || phase === 'grace2' ? TIMER2
    : GRACE;

  const timerColor =
    timeLeft > 10 ? '#10b981' :
    timeLeft > 5  ? '#f59e0b' : '#ef4444';

  if (phase === 'pick-subject') {
    return (
      <div className="relative min-h-dvh flex flex-col pb-28">
        <div className="px-4 pt-12 pb-4">
          <h1 className="text-2xl font-black gradient-text" style={{ fontFamily: "'Tajawal',sans-serif" }}>التمرين الفردي</h1>
          <p className="text-white/35 text-sm mt-1" style={{ fontFamily: "'Tajawal',sans-serif" }}>اختر فرعاً للبدء</p>
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
                style={{
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                }}
              >
                <p className="font-bold text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{s.name}</p>
                <p className="text-white/30 text-xs font-exo mt-0.5">
                  {questionCounts[s.id] ?? '...'} سؤال
                </p>
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
        <p className="text-4xl">🎉</p>
        <p className="text-white font-bold" style={{ fontFamily: "'Tajawal',sans-serif" }}>
          جاوبت كل الأسئلة المتاحة في هذا الفرع!
        </p>
        <p className="text-white/30 text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>
          هيظهر المزيد لما يتم إضافة أسئلة جديدة
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

  if (loadingQuestions || !currentQ || !subject) {
    return (
      <div className="relative min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-spin-slow" style={{ border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa' }} />
      </div>
    );
  }

  const isAnswerPhase = phase === 'timer1' || phase === 'timer2';
  const isGracePhase = phase === 'grace1' || phase === 'grace2';

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
          <p className="text-sm font-bold" style={{ color: subject.color, fontFamily: "'Tajawal',sans-serif" }}>{subject.name}</p>
          <p className="text-white/30 text-xs font-exo">{qIdx + 1} / {questions.length}</p>
        </div>
        {/* Score */}
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm font-bold font-exo">{sessionScore.correct}</span>
          <span className="text-white/20 text-xs">/</span>
          <span className="text-white/40 text-sm font-exo">{sessionScore.total}</span>
        </div>
        {/* Question list toggle */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="w-9 h-9 rounded-xl flex items-center justify-center glass-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-3">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${((qIdx) / questions.length) * 100}%`,
              background: `linear-gradient(90deg,${subject.gradFrom},${subject.gradTo})`,
            }}
          />
        </div>
      </div>

      <div className="px-4 flex-1 flex flex-col gap-4">
        {/* Timer ring + question */}
        <div className="relative flex flex-col items-center gap-4">
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
              <span
                className="text-2xl font-black font-exo"
                style={{ color: timerColor, textShadow: `0 0 10px ${timerColor}` }}
              >
                {timeLeft}
              </span>
              <span className="text-white/30 text-[9px] font-exo">
                {phase === 'timer1' ? 'جولة ١' : phase === 'timer2' ? 'جولة ٢' : 'وقت'}
              </span>
            </div>
          </div>

          {/* Question card */}
          <div
            className="w-full rounded-2xl p-5"
            style={{
              background: `${subject.color}0e`,
              border: `1px solid ${subject.color}25`,
              boxShadow: `0 4px 24px ${subject.glow}`,
            }}
          >
            <p
              className="text-lg font-bold text-white text-center leading-snug"
              style={{ fontFamily: "'Tajawal',sans-serif", direction: 'rtl' }}
            >
              {currentQ.question}
            </p>
          </div>
        </div>

        {/* Answer inputs */}
        {(isAnswerPhase || isGracePhase) && (
          <div className="flex flex-col gap-3">
            {/* Input 1 */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${(phase === 'timer1' || phase === 'grace1') ? subject.color + '60' : 'rgba(255,255,255,0.08)'}`,
                opacity: (phase === 'timer2' || phase === 'grace2') ? 0.5 : 1,
              }}
            >
              <div className="flex items-center px-3 py-1.5">
                <span className="text-white/30 text-xs font-exo mr-2">١</span>
                <input
                  ref={inputRef1}
                  value={answer1}
                  onChange={(e) => setAnswer1(e.target.value)}
                  disabled={phase !== 'timer1' && phase !== 'grace1'}
                  placeholder="الإجابة الأولى..."
                  className="flex-1 bg-transparent text-white py-2 text-sm"
                  style={{ fontFamily: "'Tajawal',sans-serif", direction: 'rtl' }}
                />
              </div>
              <div className="h-px" style={{ background: `linear-gradient(90deg,transparent,${subject.color}40,transparent)` }}/>
            </div>

            {/* Input 2 */}
            <div
              className="rounded-2xl overflow-hidden transition-all duration-300"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${(phase === 'timer2' || phase === 'grace2') ? subject.color + '60' : 'rgba(255,255,255,0.05)'}`,
                opacity: (phase === 'timer1') ? 0.3 : 1,
              }}
            >
              <div className="flex items-center px-3 py-1.5">
                <span className="text-white/30 text-xs font-exo mr-2">٢</span>
                <input
                  ref={inputRef2}
                  value={answer2}
                  onChange={(e) => setAnswer2(e.target.value)}
                  disabled={phase !== 'timer2' && phase !== 'grace2'}
                  placeholder="الإجابة الثانية..."
                  className="flex-1 bg-transparent text-white py-2 text-sm"
                  style={{ fontFamily: "'Tajawal',sans-serif", direction: 'rtl' }}
                />
              </div>
              <div className="h-px" style={{ background: `linear-gradient(90deg,transparent,${subject.color}40,transparent)` }}/>
            </div>

            {/* Answer button */}
            {isAnswerPhase && (
              <button
                onClick={handleAnswerButton}
                className="w-full rounded-2xl py-4 font-black text-white text-base transition-all duration-200"
                style={{
                  background: `linear-gradient(135deg,${subject.gradFrom},${subject.gradTo})`,
                  boxShadow: `0 0 20px ${subject.glow}`,
                  fontFamily: "'Tajawal',sans-serif",
                }}
              >
                إجابة
              </button>
            )}
            {isGracePhase && (
              <p className="text-center text-white/40 text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>
                {phase === 'grace1' ? 'وقت إضافي للكتابة' : 'أكمل إجابتك...'}
              </p>
            )}
          </div>
        )}

        {/* Reveal phase */}
        {phase === 'reveal' && (
          <RevealPanel
            question={currentQ}
            answer1={answer1}
            answer2={answer2}
            onCorrect={handleCorrect}
            onWrong={handleWrong}
          />
        )}
      </div>

      {/* Navigation arrows */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center gap-4 px-4 z-30">
        <button
          onClick={() => { if (qIdx > 0) jumpToQuestion(qIdx - 1); }}
          disabled={qIdx === 0}
          className="w-10 h-10 rounded-xl flex items-center justify-center glass disabled:opacity-20 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button
          onClick={() => { stopTimer(); nextQuestion(); }}
          disabled={qIdx >= questions.length - 1}
          className="w-10 h-10 rounded-xl flex items-center justify-center glass disabled:opacity-20 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      {/* Sidebar question list */}
      {showSidebar && (
        <QuestionSidebar
          questions={questions}
          currentIdx={qIdx}
          resultHistory={resultHistory}
          subject={subject}
          onSelect={(i) => { jumpToQuestion(i); setShowSidebar(false); }}
          onClose={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
}

// ── Reveal Panel ───────────────────────────────────────────────────────────
function RevealPanel({ question, answer1, answer2, onCorrect, onWrong }: {
  question: Question;
  answer1: string;
  answer2: string;
  onCorrect: (attempt: 1 | 2) => void;
  onWrong: () => void;
}) {
  const [choiceMode, setChoiceMode] = useState(false);

  return (
    <div className="flex flex-col gap-3 animate-slide-up">
      {/* Correct answer */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
        <p className="text-green-400/60 text-xs mb-1" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإجابة الصحيحة</p>
        <p className="text-white font-bold text-base" style={{ fontFamily: "'Tajawal',sans-serif" }}>{question.answer}</p>
      </div>

      {/* User answers */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/30 text-[10px] mb-1 font-exo">إجابتك الأولى</p>
          <p className="text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{answer1 || '—'}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/30 text-[10px] mb-1 font-exo">إجابتك الثانية</p>
          <p className="text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{answer2 || '—'}</p>
        </div>
      </div>

      {/* Verdict buttons */}
      {!choiceMode ? (
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button
            onClick={() => setChoiceMode(true)}
            className="rounded-xl py-3.5 font-bold text-base transition-all duration-200"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', fontFamily: "'Tajawal',sans-serif", boxShadow: '0 0 16px rgba(16,185,129,0.25)' }}
          >
            صح
          </button>
          <button
            onClick={onWrong}
            className="rounded-xl py-3.5 font-bold text-base transition-all duration-200"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontFamily: "'Tajawal',sans-serif", boxShadow: '0 0 16px rgba(239,68,68,0.25)' }}
          >
            غلط
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-white/40 text-xs text-center" style={{ fontFamily: "'Tajawal',sans-serif" }}>أي إجابة كانت صحيحة؟</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onCorrect(1)}
              className="rounded-xl py-3 font-bold text-sm"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', fontFamily: "'Tajawal',sans-serif" }}
            >
              الأولى
            </button>
            <button
              onClick={() => onCorrect(2)}
              className="rounded-xl py-3 font-bold text-sm"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', fontFamily: "'Tajawal',sans-serif" }}
            >
              الثانية
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Question Sidebar ───────────────────────────────────────────────────────
function QuestionSidebar({ questions, currentIdx, resultHistory, subject, onSelect, onClose }: {
  questions: Question[];
  currentIdx: number;
  resultHistory: { qIdx: number; correct: boolean }[];
  subject: Subject;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const resultMap: Record<number, boolean> = {};
  resultHistory.forEach((r) => { resultMap[r.qIdx] = r.correct; });

  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
    >
      <div className="flex-1" />
      <div
        className="h-full w-72 flex flex-col overflow-hidden animate-slide-up"
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
            const done = i in resultMap;
            const correct = resultMap[i];
            const isCurrent = i === currentIdx;
            return (
              <button
                key={q.id}
                onClick={() => onSelect(i)}
                className="w-full text-right rounded-xl px-3 py-2.5 mb-1.5 flex items-center gap-2.5 transition-all duration-150"
                style={{
                  background: isCurrent ? `${subject.color}15` : done ? (correct ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCurrent ? subject.color + '40' : done ? (correct ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold font-exo"
                  style={{
                    background: done ? (correct ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') : 'rgba(255,255,255,0.06)',
                    color: done ? (correct ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {done ? (correct ? '✓' : '✗') : i + 1}
                </span>
                <span
                  className="flex-1 text-xs text-white/60 truncate"
                  style={{ fontFamily: "'Tajawal',sans-serif" }}
                >
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
