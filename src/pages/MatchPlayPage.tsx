import { useState, useEffect, useRef } from 'react';
import type { User, Subject } from '../types';
import { getSubjectById } from '../lib/api/subjects';
import {
  getMatch,
  getMatchPlayers,
  getMatchQuestions,
  getMatchAnswers,
  submitMatchAttempt,
  judgeMatchAnswer,
  advanceMatchQuestion,
  endMatch,
  subscribeToMatchRoom,
  type MatchInfo,
  type MatchPlayerInfo,
  type MatchQuestionItem,
  type MatchAnswerItem,
} from '../lib/api/matches';

interface MatchPlayPageProps {
  matchId: string;
  subjectId: string;
  user: User;
  onExit: () => void;
}

export default function MatchPlayPage({ matchId, subjectId, user, onExit }: MatchPlayPageProps) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [players, setPlayers] = useState<MatchPlayerInfo[]>([]);
  const [questions, setQuestions] = useState<MatchQuestionItem[]>([]);
  const [answers, setAnswers] = useState<MatchAnswerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [busyAnswerId, setBusyAnswerId] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const lastQidxRef = useRef<number>(-1);
  const questionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    getSubjectById(subjectId).then(setSubject).catch(() => setSubject(null));
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    getMatchQuestions(matchId)
      .then((q) => { if (!cancelled) setQuestions(q); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  useEffect(() => {
    let cancelled = false;
    const refreshAll = () => {
      getMatch(matchId).then((m) => {
        if (cancelled) return;
        setMatch(m);
        if (m) getMatchAnswers(matchId, m.currentQidx).then((a) => { if (!cancelled) setAnswers(a); }).catch(() => {});
      }).catch(() => {});
      getMatchPlayers(matchId).then((p) => { if (!cancelled) setPlayers(p); }).catch(() => {});
    };
    refreshAll();
    const unsub = subscribeToMatchRoom(matchId, refreshAll);
    return () => { cancelled = true; unsub(); };
  }, [matchId]);

  useEffect(() => {
    if (match && match.currentQidx !== lastQidxRef.current) {
      lastQidxRef.current = match.currentQidx;
      questionStartRef.current = Date.now();
    }
  }, [match?.currentQidx]);

  const accent = subject?.color ?? '#ef4444';
  const gradFrom = subject?.gradFrom ?? '#ef4444';
  const gradTo = subject?.gradTo ?? '#f97316';
  const glow = subject?.glow ?? 'rgba(239,68,68,0.4)';

  const me = players.find((p) => p.userId === user.id);
  const isReferee = me?.role === 'referee';
  const currentQuestion = match ? questions[match.currentQidx] : undefined;
  const myAttempt = answers.find((a) => a.answeringUserId === user.id);

  const goToNextOrEnd = async () => {
    if (!match) return;
    const next = match.currentQidx + 1;
    setAdvancing(true);
    try {
      if (next >= questions.length) {
        await endMatch(matchId);
      } else {
        await advanceMatchQuestion(matchId, next);
      }
    } finally {
      setAdvancing(false);
    }
  };

  const handleSubmitAttempt = async () => {
    if (!match || submittingAttempt) return;
    setSubmittingAttempt(true);
    const elapsed = Date.now() - questionStartRef.current;
    try {
      await submitMatchAttempt(matchId, match.currentQidx, user.id, elapsed);
    } finally {
      setSubmittingAttempt(false);
    }
  };

  const handleJudge = async (answer: MatchAnswerItem, correct: boolean) => {
    if (!answer.answeringUserId) return;
    setBusyAnswerId(answer.id);
    try {
      await judgeMatchAnswer(answer.id, user.id, correct, answer.answeringUserId, matchId);
      if (correct) await goToNextOrEnd();
    } finally {
      setBusyAnswerId(null);
    }
  };

  if (loading || !match) {
    return (
      <div className="relative min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-spin-slow" style={{ border: '3px solid rgba(255,255,255,0.15)', borderTopColor: accent }} />
      </div>
    );
  }

  if (match.status === 'completed') {
    const ranked = [...players].filter((p) => p.role === 'player').sort((a, b) => b.correctCount - a.correctCount);
    return (
      <div className="relative min-h-dvh flex flex-col pb-28 px-4">
        <div className="pt-12 pb-6 text-center">
          <p className="text-3xl mb-2">🏆</p>
          <h1 className="text-2xl font-black gradient-text" style={{ fontFamily: "'Tajawal',sans-serif" }}>انتهت المباراة</h1>
        </div>
        <div className="flex flex-col gap-3">
          {ranked.map((p) => (
            <div
              key={p.userId}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{
                background: p.result === 'win' ? 'rgba(16,185,129,0.1)' : `${p.user.color}0d`,
                border: `1px solid ${p.result === 'win' ? 'rgba(16,185,129,0.35)' : p.user.color + '25'}`,
              }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0" style={{ background: p.user.gradient, fontFamily: "'Tajawal',sans-serif" }}>
                {p.user.name.slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{p.user.name}</p>
                <p className="text-xs text-white/40 font-exo">{p.correctCount} صح · {p.wrongCount} غلط</p>
              </div>
              <span
                className="text-xs font-bold px-3 py-1 rounded-full"
                style={{
                  background: p.result === 'win' ? 'rgba(16,185,129,0.2)' : p.result === 'draw' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)',
                  color: p.result === 'win' ? '#34d399' : p.result === 'draw' ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                }}
              >
                {p.result === 'win' ? 'فاز' : p.result === 'draw' ? 'تعادل' : 'خسر'}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={onExit}
          className="w-full rounded-2xl py-4 font-black text-white text-lg mt-6"
          style={{ background: `linear-gradient(135deg,${gradFrom},${gradTo})`, boxShadow: `0 0 24px ${glow}`, fontFamily: "'Tajawal',sans-serif" }}
        >
          خروج
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh flex flex-col pb-28 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-10 pb-3 flex items-center gap-3">
        <button onClick={onExit} className="w-9 h-9 rounded-xl flex items-center justify-center glass-md" style={{ color: accent }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: accent, fontFamily: "'Tajawal',sans-serif" }}>
            {subject?.name ?? 'مباراة 1v1'} {isReferee && '· أنت الحكم'}
          </p>
          <p className="text-white/30 text-xs font-exo">{match.currentQidx + 1} / {questions.length}</p>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="px-4 mb-3 flex gap-2 overflow-x-auto">
        {players.map((p) => (
          <div
            key={p.userId}
            className="flex items-center gap-2 rounded-xl px-3 py-2 flex-shrink-0"
            style={{
              background: p.role === 'referee' ? 'rgba(245,158,11,0.1)' : `${p.user.color}12`,
              border: `1px solid ${p.role === 'referee' ? 'rgba(245,158,11,0.3)' : p.user.color + '30'}`,
            }}
          >
            <span className="text-xs font-bold text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{p.user.name}</span>
            {p.role === 'referee' ? (
              <span className="text-[10px] text-amber-400">حكم</span>
            ) : (
              <span className="text-[10px] font-exo"><span className="text-green-400">{p.correctCount}</span><span className="text-white/20">/</span><span className="text-red-400">{p.wrongCount}</span></span>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 flex-1 flex flex-col gap-4">
        {/* Question card */}
        <div className="rounded-2xl p-5" style={{ background: `${accent}0e`, border: `1px solid ${accent}25`, boxShadow: `0 4px 24px ${glow}` }}>
          <p className="text-lg font-bold text-white text-center" style={{ fontFamily: "'Tajawal',sans-serif", direction: 'rtl' }}>
            {currentQuestion?.question ?? '...'}
          </p>
          {isReferee && currentQuestion && (
            <p className="text-center text-xs mt-3 pt-3" style={{ color: '#34d399', borderTop: `1px solid ${accent}20`, fontFamily: "'Tajawal',sans-serif" }}>
              الإجابة: {currentQuestion.answer}
            </p>
          )}
        </div>

        {/* Player: submit attempt */}
        {!isReferee && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSubmitAttempt}
              disabled={submittingAttempt || !!myAttempt}
              className="w-full rounded-2xl py-4 font-black text-white text-base disabled:opacity-40"
              style={{ background: `linear-gradient(135deg,${gradFrom},${gradTo})`, boxShadow: `0 0 20px ${glow}`, fontFamily: "'Tajawal',sans-serif" }}
            >
              {myAttempt ? 'بانتظار حكم الحكم' : submittingAttempt ? '...' : 'أجبت!'}
            </button>
          </div>
        )}

        {/* Referee: attempts list + controls */}
        {isReferee && (
          <div className="flex flex-col gap-3">
            <p className="text-white/40 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>المحاولات</p>
            {answers.length === 0 && (
              <p className="text-white/25 text-xs text-center py-4" style={{ fontFamily: "'Tajawal',sans-serif" }}>لا يوجد محاولات بعد</p>
            )}
            {answers.map((a) => {
              const player = players.find((p) => p.userId === a.answeringUserId);
              return (
                <div key={a.id} className="glass-md rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{player?.user.name ?? '—'}</p>
                    <p className="text-white/30 text-xs font-exo">{a.timeMs != null ? `${(a.timeMs / 1000).toFixed(1)}s` : ''}</p>
                  </div>
                  {a.judgedCorrect === null ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleJudge(a, true)}
                        disabled={busyAnswerId === a.id}
                        className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-50"
                        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button
                        onClick={() => handleJudge(a, false)}
                        disabled={busyAnswerId === a.id}
                        className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: a.judgedCorrect ? '#34d399' : '#f87171' }}>
                      {a.judgedCorrect ? '✓ صح' : '✗ غلط'}
                    </span>
                  )}
                </div>
              );
            })}

            <button
              onClick={goToNextOrEnd}
              disabled={advancing}
              className="w-full rounded-xl py-3 text-sm font-bold glass-md mt-1 disabled:opacity-50"
              style={{ color: accent, border: `1px solid ${accent}30`, fontFamily: "'Tajawal',sans-serif" }}
            >
              {match.currentQidx + 1 >= questions.length ? 'إنهاء المباراة' : 'تخطي للسؤال التالي'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
