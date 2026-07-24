import { supabase } from '../supabaseClient';
import { getUsersByIds } from '../auth';
import { getSubjectById } from './subjects';

export interface UserDetailStats {
  userId: string;
  name: string;
  nameEn: string;
  color: string;
  gradient: string;
  totalPoints: number;
  soloPoints: number;
  groupPoints: number;
  onevonePoints: number;
  leaderboardRank: number;
  soloAnswered: number;
  soloCorrect: number;
  groupAnswered: number;
  groupCorrect: number;
  onevoneAnswered: number;
  onevoneCorrect: number;
  matchesPlayed: number;
  matchWins: number;
}

/** The whole leaderboard + per-member breakdown, ranked. Backed by v_user_detail. */
export async function getLeaderboard(): Promise<UserDetailStats[]> {
  const { data, error } = await supabase.from('v_user_detail').select('*').order('leaderboard_rank', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];

  const userMap = await getUsersByIds(rows.map((r) => r.user_id));

  return rows.map((r) => {
    const user = userMap.get(r.user_id);
    return {
      userId: r.user_id,
      name: r.name,
      nameEn: r.name_en,
      color: user?.color ?? '#60a5fa',
      gradient: user?.gradient ?? 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
      totalPoints: r.total_points,
      soloPoints: r.solo_points,
      groupPoints: r.group_points,
      onevonePoints: r.onevone_points,
      leaderboardRank: r.leaderboard_rank ?? 0,
      soloAnswered: r.solo_answered,
      soloCorrect: r.solo_correct,
      groupAnswered: r.group_answered,
      groupCorrect: r.group_correct,
      onevoneAnswered: r.onevone_answered,
      onevoneCorrect: r.onevone_correct,
      matchesPlayed: r.matches_played,
      matchWins: r.match_wins,
    };
  });
}

export interface GroupRadarResult {
  rows: Array<{ subjectId: string; subject: string; [userId: string]: string | number }>;
  users: Array<{ userId: string; name: string; color: string }>;
}

/** Correct-answer counts per member per subject in group mode. Backed by v_group_radar. */
export async function getGroupRadar(): Promise<GroupRadarResult> {
  const { data, error } = await supabase.from('v_group_radar').select('*');
  if (error) throw error;
  const rawRows = data ?? [];

  const subjectIds = Array.from(new Set(rawRows.map((r) => r.subject_id).filter((id: string | null): id is string => !!id))) as string[];
  const userIds = Array.from(new Set(rawRows.map((r) => r.user_id).filter((id: string | null): id is string => !!id))) as string[];

  const [subjects, userMap] = await Promise.all([
    Promise.all(subjectIds.map((id) => getSubjectById(id))),
    getUsersByIds(userIds),
  ]);
  const subjectNameMap = new Map<string, string>();
  subjects.forEach((s) => {
    if (s) subjectNameMap.set(s.id, s.name);
  });

  const bySubject = new Map<string, { subjectId: string; subject: string; [userId: string]: string | number }>();
  rawRows.forEach((r) => {
    if (!r.subject_id) return;
    if (!bySubject.has(r.subject_id)) {
      bySubject.set(r.subject_id, { subjectId: r.subject_id, subject: subjectNameMap.get(r.subject_id) ?? r.subject_id });
    }
    if (r.user_id) {
      bySubject.get(r.subject_id)![r.user_id] = r.correct_count ?? 0;
    }
  });

  return {
    rows: Array.from(bySubject.values()),
    users: userIds
      .filter((id) => userMap.has(id))
      .map((id) => ({ userId: id, name: userMap.get(id)!.name, color: userMap.get(id)!.color })),
  };
}

export interface GroupSpeedRow {
  userId: string;
  name: string;
  color: string;
  correct: number; // seconds
  wrong: number;
  avg: number;
}

/** Average answer speed per member in group mode (ms → seconds). Backed by v_group_speed. */
export async function getGroupSpeed(): Promise<GroupSpeedRow[]> {
  const { data, error } = await supabase.from('v_group_speed').select('*');
  if (error) throw error;
  const rows = data ?? [];
  const userMap = await getUsersByIds(rows.map((r) => r.user_id).filter((id: string | null): id is string => !!id));

  const toSeconds = (ms: number | null) => (ms ? Math.round(ms / 100) / 10 : 0);

  return rows
    .filter((r): r is typeof r & { user_id: string } => !!r.user_id && userMap.has(r.user_id))
    .map((r) => {
      const user = userMap.get(r.user_id)!;
      return {
        userId: r.user_id,
        name: user.name,
        color: user.color,
        correct: toSeconds(r.avg_correct_ms),
        wrong: toSeconds(r.avg_wrong_ms),
        avg: toSeconds(r.avg_overall_ms),
      };
    });
}

export interface RivalryRow {
  player1: { userId: string; name: string; color: string; wins: number };
  player2: { userId: string; name: string; color: string; wins: number };
  totalPoints1: number;
  totalPoints2: number;
}

/** Most-played 1v1 rivalries. Backed by v_rivalries. */
export async function getRivalries(limit = 3): Promise<RivalryRow[]> {
  const { data, error } = await supabase
    .from('v_rivalries')
    .select('*')
    .order('matches_played', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];

  const ids = Array.from(new Set(rows.flatMap((r) => [r.user_a, r.user_b]).filter((id: string | null): id is string => !!id))) as string[];
  const userMap = await getUsersByIds(ids);

  return rows
    .filter((r): r is typeof r & { user_a: string; user_b: string } => !!r.user_a && !!r.user_b)
    .filter((r) => userMap.has(r.user_a) && userMap.has(r.user_b))
    .map((r) => {
      const u1 = userMap.get(r.user_a)!;
      const u2 = userMap.get(r.user_b)!;
      return {
        player1: { userId: r.user_a, name: u1.name, color: u1.color, wins: r.wins_a ?? 0 },
        player2: { userId: r.user_b, name: u2.name, color: u2.color, wins: r.wins_b ?? 0 },
        totalPoints1: r.points_a ?? 0,
        totalPoints2: r.points_b ?? 0,
      };
    });
}

/** Live-updates the leaderboard as points change anywhere in the app. */
export function subscribeToPoints(onChange: () => void): () => void {
  const channel = supabase
    .channel('user-points-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_points' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
