import { supabase } from '../supabaseClient';
import type { Database } from '../database.types';

type GroupRoundQuestionRow = Database['public']['Tables']['group_round_questions']['Row'];

export interface GroupQuestion {
  id: number;
  question: string;
  answer: string;
  position: number;
}

function mapGroupQuestionRow(row: GroupRoundQuestionRow): GroupQuestion {
  return { id: row.id, question: row.question, answer: row.answer, position: row.position ?? 0 };
}

/**
 * Group sessions are round-based (`group_round_questions.round_no`) so the
 * same family/group doesn't repeat a round it already finished. Picks the
 * round right after the last *completed* one for this subject, falling back
 * to round 1 if nothing has been authored yet for that round number.
 */
export async function pickNextRound(subjectId: string): Promise<number> {
  const { data: completed, error: compErr } = await supabase
    .from('group_sessions')
    .select('round_no')
    .eq('subject_id', subjectId)
    .eq('status', 'completed')
    .order('round_no', { ascending: false })
    .limit(1);
  if (compErr) throw compErr;

  const lastCompleted = completed?.[0]?.round_no ?? 0;
  let nextRound = lastCompleted + 1;

  const { count, error: countErr } = await supabase
    .from('group_round_questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject_id', subjectId)
    .eq('round_no', nextRound);
  if (countErr) throw countErr;
  if (!count) nextRound = 1; // no fresh round authored yet — replay round 1

  return nextRound;
}

export async function getGroupRoundQuestions(subjectId: string, roundNo: number): Promise<GroupQuestion[]> {
  const { data, error } = await supabase
    .from('group_round_questions')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('round_no', roundNo)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapGroupQuestionRow);
}

export async function createGroupSession(subjectId: string, roundNo: number, hostUserId: string): Promise<string> {
  const { data, error } = await supabase
    .from('group_sessions')
    .insert({ subject_id: subjectId, round_no: roundNo, host_user_id: hostUserId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export interface SubmitGroupAnswerParams {
  sessionId: string;
  position: number;
  attemptNo: 1 | 2;
  timeMs: number;
  isCorrect: boolean;
  creditedUserId: string | null;
}

/** Inserts the attempt — a DB trigger awards 5 points to the credited member when correct. */
export async function submitGroupAnswer(params: SubmitGroupAnswerParams): Promise<void> {
  const { error } = await supabase.from('group_answers').insert({
    session_id: params.sessionId,
    position: params.position,
    attempt_no: params.attemptNo,
    time_ms: params.timeMs,
    is_correct: params.isCorrect,
    credited_user_id: params.creditedUserId,
  });
  if (error) throw error;
}

export async function updateGroupSessionProgress(sessionId: string, currentQidx: number): Promise<void> {
  const { error } = await supabase.from('group_sessions').update({ current_qidx: currentQidx }).eq('id', sessionId);
  if (error) throw error;
}

export async function completeGroupSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('group_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}
