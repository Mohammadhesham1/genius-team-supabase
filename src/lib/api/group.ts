import { supabase } from '../supabaseClient';
import type { GroupAttempt } from '../database.types';

export type { GroupAttempt };

export interface GroupQuestion {
  id: number;
  question: string;
  answer: string;
  position: number;
}

export interface ProgressRecord {
  attempts: GroupAttempt[];
  final: 'correct' | 'wrong' | null;
}

const ROUND_NUMBERS = [1, 2, 3, 4, 5];

/** All questions for one of the 5 fixed general-knowledge rounds. */
export async function getRoundQuestions(roundNo: number): Promise<GroupQuestion[]> {
  const { data, error } = await supabase
    .from('group_round_questions')
    .select('*')
    .is('subject_id', null)
    .eq('round_no', roundNo)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, question: r.question, answer: r.answer, position: r.position ?? 0 }));
}

/** Saved attempts/final result for every answered question in a round, keyed by position. */
export async function getRoundProgress(roundNo: number): Promise<Map<number, ProgressRecord>> {
  const { data, error } = await supabase.from('group_progress').select('*').eq('round_no', roundNo);
  if (error) throw error;
  const map = new Map<number, ProgressRecord>();
  (data ?? []).forEach((r) => {
    map.set(r.position, { attempts: (r.attempts as GroupAttempt[]) ?? [], final: r.final });
  });
  return map;
}

/** Question count + answered count per round, for the home screen's 5 round cards. */
export async function getRoundsSummary(): Promise<Record<number, { total: number; answered: number }>> {
  const [{ data: qRows, error: qErr }, { data: pRows, error: pErr }] = await Promise.all([
    supabase.from('group_round_questions').select('round_no').is('subject_id', null).in('round_no', ROUND_NUMBERS),
    supabase.from('group_progress').select('round_no,final').in('round_no', ROUND_NUMBERS),
  ]);
  if (qErr) throw qErr;
  if (pErr) throw pErr;

  const summary: Record<number, { total: number; answered: number }> = {};
  ROUND_NUMBERS.forEach((r) => { summary[r] = { total: 0, answered: 0 }; });
  (qRows ?? []).forEach((r) => { summary[r.round_no].total += 1; });
  (pRows ?? []).forEach((r) => { if (r.final) summary[r.round_no].answered += 1; });
  return summary;
}

/** Upserts the full attempts array + final result for one question — mirrors the reference app's "save whole record" pattern. */
export async function saveQuestionProgress(
  roundNo: number,
  position: number,
  attempts: GroupAttempt[],
  final: 'correct' | 'wrong' | null
): Promise<void> {
  const { error } = await supabase
    .from('group_progress')
    .upsert(
      { round_no: roundNo, position, attempts, final, updated_at: new Date().toISOString() },
      { onConflict: 'round_no,position' }
    );
  if (error) throw error;
}

/** Awards (or reverses, with a negative amount) group-mode points via the schema's existing point-award function. */
export async function awardGroupPoints(userId: string, points: number): Promise<void> {
  const { error } = await supabase.rpc('fn_award_points', { p_user_id: userId, p_points: points, p_mode: 'group' });
  if (error) throw error;
}

/** Resets one question: reverses the 5 points if it had been answered correctly, then deletes its saved state. */
export async function resetQuestion(roundNo: number, position: number): Promise<void> {
  const { data, error } = await supabase
    .from('group_progress')
    .select('*')
    .eq('round_no', roundNo)
    .eq('position', position)
    .maybeSingle();
  if (error) throw error;

  if (data?.final === 'correct') {
    const correctAttempt = (data.attempts as GroupAttempt[]).find((a) => a.result === 'correct');
    if (correctAttempt) await awardGroupPoints(correctAttempt.player_id, -5);
  }

  const { error: delErr } = await supabase.from('group_progress').delete().eq('round_no', roundNo).eq('position', position);
  if (delErr) throw delErr;
}

/** Resets an entire round: reverses points for every correctly-answered question, then clears all its saved state. */
export async function resetRound(roundNo: number): Promise<void> {
  const { data, error } = await supabase.from('group_progress').select('*').eq('round_no', roundNo);
  if (error) throw error;
  const rows = data ?? [];

  await Promise.all(
    rows
      .filter((r) => r.final === 'correct')
      .map((r) => {
        const correctAttempt = (r.attempts as GroupAttempt[]).find((a) => a.result === 'correct');
        return correctAttempt ? awardGroupPoints(correctAttempt.player_id, -5) : Promise.resolve();
      })
  );

  const { error: delErr } = await supabase.from('group_progress').delete().eq('round_no', roundNo);
  if (delErr) throw delErr;
}
