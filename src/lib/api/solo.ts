import { supabase } from '../supabaseClient';
import type { Database } from '../database.types';
import type { Question } from '../../types';

type QuestionRow = Database['public']['Tables']['questions']['Row'];

function mapQuestionRow(row: QuestionRow): Question {
  return {
    id: row.id,
    subjectId: row.subject_id ?? '',
    position: row.position ?? undefined,
    question: row.question,
    answer: row.answer,
  };
}

/** Reads next_position for this user+subject, creating the row (starting at 1) if it doesn't exist yet. */
export async function getOrCreateSoloProgress(userId: string, subjectId: string): Promise<number> {
  const { data, error } = await supabase
    .from('solo_progress')
    .select('next_position')
    .eq('user_id', userId)
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.next_position;

  const { data: created, error: insertErr } = await supabase
    .from('solo_progress')
    .insert({ user_id: userId, subject_id: subjectId })
    .select('next_position')
    .single();

  if (insertErr) {
    // Unique-violation: another tab created it a moment ago — just re-read.
    if (insertErr.code === '23505') {
      const { data: retry, error: retryErr } = await supabase
        .from('solo_progress')
        .select('next_position')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .single();
      if (retryErr) throw retryErr;
      return retry.next_position;
    }
    throw insertErr;
  }
  return created.next_position;
}

/** Remaining (unanswered) questions for a subject, starting from the saved cursor. */
export async function getSoloQuestions(subjectId: string, fromPosition: number): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('subject_id', subjectId)
    .gte('position', fromPosition)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapQuestionRow);
}

export async function getQuestionCount(subjectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject_id', subjectId);
  if (error) throw error;
  return count ?? 0;
}

export interface SubmitSoloAnswerParams {
  userId: string;
  subjectId: string;
  questionId: number;
  firstAnswer: string;
  firstTimeMs: number | null;
  secondAnswer: string;
  secondTimeMs: number | null;
  isCorrect: boolean;
  correctOn: 1 | 2 | null;
}

/** Inserts the attempt — a DB trigger takes care of awarding points + the daily streak. */
export async function submitSoloAnswer(params: SubmitSoloAnswerParams): Promise<void> {
  const { error } = await supabase.from('solo_answers').insert({
    user_id: params.userId,
    subject_id: params.subjectId,
    question_id: params.questionId,
    first_answer: params.firstAnswer || null,
    first_time_ms: params.firstTimeMs,
    second_answer: params.secondAnswer || null,
    second_time_ms: params.secondTimeMs,
    is_correct: params.isCorrect,
    correct_on: params.correctOn,
  });
  if (error) throw error;
}

export async function advanceSoloProgress(userId: string, subjectId: string, nextPosition: number): Promise<void> {
  const { error } = await supabase
    .from('solo_progress')
    .upsert({ user_id: userId, subject_id: subjectId, next_position: nextPosition }, { onConflict: 'user_id,subject_id' });
  if (error) throw error;
}
