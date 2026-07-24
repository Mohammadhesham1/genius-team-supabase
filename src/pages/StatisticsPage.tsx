import { useState, useEffect } from 'react';
import type { User, PageName } from '../types';
import {
  getLeaderboard,
  getGroupRadar,
  getGroupSpeed,
  getRivalries,
  subscribeToPoints,
  type UserDetailStats,
  type GroupRadarResult,
  type GroupSpeedRow,
  type RivalryRow,
} from '../lib/api/stats';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  CartesianGrid,
} from 'recharts';

interface StatisticsPageProps {
  user: User;
  navigate: (page: PageName, params?: Record<string, string>) => void;
}

export default function StatisticsPage({ navigate: _navigate }: StatisticsPageProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<UserDetailStats[]>([]);
  const [radar, setRadar] = useState<GroupRadarResult>({ rows: [], users: [] });
  const [speed, setSpeed] = useState<GroupSpeedRow[]>([]);
  const [rivalries, setRivalries] = useState<RivalryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = () => {
    return Promise.all([getLeaderboard(), getGroupRadar(), getGroupSpeed(), getRivalries(3)]).then(
      ([lb, r, sp, rv]) => {
        setLeaderboard(lb);
        setRadar(r);
        setSpeed(sp);
        setRivalries(rv);
      }
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAll()
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Keep the leaderboard fresh as points come in from anywhere in the app.
    const unsub = subscribeToPoints(() => {
      getLeaderboard().then((lb) => { if (!cancelled) setLeaderboard(lb); }).catch(() => {});
    });
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const soloStudy = [...leaderboard].sort((a, b) => b.soloAnswered - a.soloAnswered);
  const radarUsersFirst = radar.users.slice(0, 4);
  const radarUsersRest = radar.users.slice(4);

  if (loading) {
    return (
      <div className="relative min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full animate-spin-slow" style={{ border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa' }} />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh flex flex-col pb-28 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-2xl font-black gradient-text" style={{ fontFamily: "'Tajawal',sans-serif" }}>الإحصائيات</h1>
        <p className="text-white/30 text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>أداء الفريق</p>
      </div>

      <div className="px-4 flex flex-col gap-6 overflow-y-auto">

        {/* ── Section 1: Radar charts ── */}
        <Section title="مقارنة التدريب الجماعي" subtitle="الإجابات الصحيحة لكل فرع">
          {radar.rows.length === 0 ? (
            <EmptyNote text="لسه محدش لعب تدريب جماعي" />
          ) : (
            <>
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar.rows} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontFamily: "'Tajawal',sans-serif" }} />
                    {radarUsersFirst.map((u) => (
                      <Radar
                        key={u.userId}
                        name={u.name}
                        dataKey={u.userId}
                        stroke={u.color}
                        fill={u.color}
                        fillOpacity={0.08}
                        strokeWidth={2}
                        dot={false}
                        style={{ filter: `drop-shadow(0 0 4px ${u.color})` }}
                      />
                    ))}
                    <Legend
                      formatter={(v) => <span style={{ color: radarUsersFirst.find((u) => u.userId === v)?.color ?? '#fff', fontFamily: "'Tajawal',sans-serif", fontSize: 11 }}>{radarUsersFirst.find((u) => u.userId === v)?.name ?? v}</span>}
                      iconType="circle"
                      iconSize={8}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {radarUsersRest.length > 0 && (
                <div className="w-full h-72 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radar.rows} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontFamily: "'Tajawal',sans-serif" }} />
                      {radarUsersRest.map((u) => (
                        <Radar
                          key={u.userId}
                          name={u.name}
                          dataKey={u.userId}
                          stroke={u.color}
                          fill={u.color}
                          fillOpacity={0.08}
                          strokeWidth={2}
                          dot={false}
                          style={{ filter: `drop-shadow(0 0 4px ${u.color})` }}
                        />
                      ))}
                      <Legend
                        formatter={(v) => <span style={{ color: radarUsersRest.find((u) => u.userId === v)?.color ?? '#fff', fontFamily: "'Tajawal',sans-serif", fontSize: 11 }}>{radarUsersRest.find((u) => u.userId === v)?.name ?? v}</span>}
                        iconType="circle"
                        iconSize={8}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </Section>

        {/* ── Section 2: Speed Bar Chart ── */}
        <Section title="متوسط سرعة الإجابة" subtitle="ثواني — الأسرع أفضل">
          {speed.length === 0 ? (
            <EmptyNote text="لسه محدش سجل وقت إجابة في التدريب الجماعي" />
          ) : (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speed} margin={{ top: 4, right: 4, bottom: 4, left: -20 }} barSize={18} barGap={0}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)', fontFamily: "'Tajawal',sans-serif" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: "'Exo 2',sans-serif" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'rgba(6,9,26,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontFamily: "'Tajawal',sans-serif" }}
                  labelStyle={{ color: 'white' }}
                  formatter={(value: number, name: string) => [`${value}s`, name === 'correct' ? 'صحيحة' : name === 'wrong' ? 'خاطئة' : 'العامة']}
                />
                <Bar dataKey="correct" stackId="speed" radius={[0, 0, 0, 0]}>
                  {speed.map((entry) => (
                    <Cell key={entry.userId} fill={entry.color} style={{ filter: `drop-shadow(0 0 4px ${entry.color})` }} />
                  ))}
                </Bar>
                <Bar dataKey="avg" stackId="total" radius={[0, 0, 0, 0]}>
                  {speed.map((entry) => (
                    <Cell key={entry.userId} fill={`${entry.color}55`} />
                  ))}
                </Bar>
                <Bar dataKey="wrong" stackId="worst" radius={[4, 4, 0, 0]}>
                  {speed.map((entry) => (
                    <Cell key={entry.userId} fill="rgba(239,68,68,0.5)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
          <div className="flex items-center justify-center gap-5 mt-1">
            {[
              { label: 'متوسط سرعة الصحيحة', color: '#60a5fa' },
              { label: 'متوسط السرعة العامة', color: 'rgba(96,165,250,0.35)' },
              { label: 'متوسط سرعة الخاطئة', color: 'rgba(239,68,68,0.5)' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                <span className="text-white/40 text-[10px]" style={{ fontFamily: "'Tajawal',sans-serif" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Section 3: Solo study chart + leaderboard ── */}
        <div className="grid grid-cols-1 gap-4">
          <Section title="مذاكرة التدريب الفردي" subtitle="عدد الأسئلة المجاوبة">
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={soloStudy} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }} barSize={14} barGap={2}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: "'Exo 2',sans-serif" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.6)', fontFamily: "'Tajawal',sans-serif" }} axisLine={false} tickLine={false} width={40} />
                  <CartesianGrid horizontal={false} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(6,9,26,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontFamily: "'Tajawal',sans-serif" }}
                    formatter={(value: number, name: string) => [value, name === 'soloAnswered' ? 'مجاوب' : 'صحيح']}
                  />
                  <Bar dataKey="soloAnswered" radius={[0, 4, 4, 0]}>
                    {soloStudy.map((entry) => (
                      <Cell key={entry.userId} fill={entry.color} style={{ filter: `drop-shadow(0 0 3px ${entry.color})` }} />
                    ))}
                  </Bar>
                  <Bar dataKey="soloCorrect" radius={[0, 4, 4, 0]}>
                    {soloStudy.map((entry) => (
                      <Cell key={entry.userId} fill={`${entry.color}44`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Solo leaderboard */}
          <Section title="ليدر بورد التدريب الفردي" subtitle="حسب عدد الأسئلة">
            <div className="flex flex-col gap-2">
              {soloStudy.map((entry, i) => (
                <div key={entry.userId} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-exo flex-shrink-0"
                    style={{ background: i < 3 ? `${entry.color}30` : 'rgba(255,255,255,0.05)', color: i < 3 ? entry.color : 'rgba(255,255,255,0.3)' }}>
                    {i + 1}
                  </span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0"
                    style={{ background: `${entry.color}20`, color: entry.color, fontFamily: "'Tajawal',sans-serif" }}
                  >
                    {entry.name.slice(0, 2)}
                  </div>
                  <span className="flex-1 text-white font-bold text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{entry.name}</span>
                  <span className="font-bold text-sm font-exo" style={{ color: entry.color }}>{entry.soloAnswered}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── Section 4: Top rivalries ── */}
        <Section title="أبرز المنافسات في 1v1" subtitle="أكثر المباريات تكراراً">
          {rivalries.length === 0 ? (
            <EmptyNote text="لسه محدش لعب 1v1" />
          ) : (
            <div className="flex flex-col gap-3">
              {rivalries.map((rivalry, i) => (
                <RivalryCard key={`${rivalry.player1.userId}-${rivalry.player2.userId}`} rivalry={rivalry} rank={i + 1} />
              ))}
            </div>
          )}
        </Section>

        {/* ── Section 5: Global leaderboard ── */}
        <Section title="الترتيب العام" subtitle="النقاط الإجمالية">
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => {
              const isExpanded = expandedMember === entry.userId;
              return (
                <div key={entry.userId} className="rounded-2xl overflow-hidden transition-all duration-300"
                  style={{ background: `${entry.color}0a`, border: `1px solid ${entry.color}20`, boxShadow: isExpanded ? `0 0 16px ${entry.color}25` : 'none' }}>
                  <div className="flex items-center gap-3 px-3 py-3">
                    {/* Rank */}
                    <span className="w-6 text-center font-black text-sm font-exo flex-shrink-0"
                      style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#f97316' : 'rgba(255,255,255,0.3)' }}>
                      {i + 1}
                    </span>
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                      style={{ background: entry.gradient, fontFamily: "'Tajawal',sans-serif", boxShadow: `0 0 8px ${entry.color}40` }}>
                      {entry.name.slice(0, 2)}
                    </div>
                    {/* Name */}
                    <span className="flex-1 font-bold text-sm text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{entry.name}</span>
                    {/* Points */}
                    <span className="font-bold text-sm font-exo" style={{ color: entry.color }}>{entry.totalPoints.toLocaleString()}</span>
                    {/* Expand arrow */}
                    <button
                      onClick={() => setExpandedMember(isExpanded ? null : entry.userId)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300"
                      style={{ color: 'rgba(255,255,255,0.3)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>

                  {/* Expanded profile */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3 animate-slide-up">
                      <MemberProfile entry={entry} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Member Profile ─────────────────────────────────────────────────────────
function MemberProfile({ entry }: { entry: UserDetailStats }) {
  const stats = [
    { label: 'نقاط التدريب الجماعي', value: entry.groupPoints, color: '#3b82f6' },
    { label: 'نقاط التدريب الفردي', value: entry.soloPoints, color: '#10b981' },
    { label: 'نقاط 1v1', value: entry.onevonePoints, color: '#ef4444' },
    { label: 'إجمالي النقاط', value: entry.totalPoints, color: entry.color },
  ];
  return (
    <div className="flex flex-col gap-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center justify-between">
          <span className="text-white/40 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>{s.label}</span>
          <span className="font-bold text-sm font-exo" style={{ color: s.color }}>{s.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="h-px bg-white/5 my-1" />
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>أسئلة الفردي</span>
        <span className="font-bold text-sm font-exo text-white/60">{entry.soloAnswered}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>أسئلة الجماعي</span>
        <span className="font-bold text-sm font-exo text-white/60">{entry.groupAnswered}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs" style={{ fontFamily: "'Tajawal',sans-serif" }}>مباريات 1v1</span>
        <span className="font-bold text-sm font-exo text-white/60">{entry.matchesPlayed}</span>
      </div>
    </div>
  );
}

// ── Rivalry Card ───────────────────────────────────────────────────────────
function RivalryCard({ rivalry, rank }: { rivalry: RivalryRow; rank: number }) {
  const c1 = rivalry.player1.color;
  const c2 = rivalry.player2.color;
  const total = rivalry.player1.wins + rivalry.player2.wins;
  const w1pct = total ? (rivalry.player1.wins / total) * 100 : 50;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/25 text-xs font-exo">#{rank}</span>
        <span className="text-white/25 text-xs font-exo">{total} مبارة</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
            style={{ background: `${c1}25`, color: c1, fontFamily: "'Tajawal',sans-serif", border: `1px solid ${c1}40` }}>
            {rivalry.player1.name.slice(0, 2)}
          </div>
          <p className="text-white font-bold text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{rivalry.player1.name}</p>
          <p className="font-black text-xl font-exo" style={{ color: c1, textShadow: `0 0 10px ${c1}` }}>{rivalry.player1.wins}</p>
          <p className="text-white/20 text-[10px] font-exo">{rivalry.totalPoints1} نقطة</p>
        </div>

        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <span className="gradient-text font-black text-lg font-exo">VS</span>
          <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full" style={{ width: `${w1pct}%`, background: `linear-gradient(90deg,${c1},${c2})` }} />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
            style={{ background: `${c2}25`, color: c2, fontFamily: "'Tajawal',sans-serif", border: `1px solid ${c2}40` }}>
            {rivalry.player2.name.slice(0, 2)}
          </div>
          <p className="text-white font-bold text-sm" style={{ fontFamily: "'Tajawal',sans-serif" }}>{rivalry.player2.name}</p>
          <p className="font-black text-xl font-exo" style={{ color: c2, textShadow: `0 0 10px ${c2}` }}>{rivalry.player2.wins}</p>
          <p className="text-white/20 text-[10px] font-exo">{rivalry.totalPoints2} نقطة</p>
        </div>
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-white/25 text-xs text-center py-6" style={{ fontFamily: "'Tajawal',sans-serif" }}>{text}</p>;
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass-md rounded-2xl p-4">
      <div className="mb-4">
        <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Tajawal',sans-serif" }}>{title}</h2>
        {subtitle && <p className="text-white/30 text-xs mt-0.5" style={{ fontFamily: "'Tajawal',sans-serif" }}>{subtitle}</p>}
        <div className="h-px mt-2.5" style={{ background: 'linear-gradient(90deg,rgba(59,130,246,0.5),transparent)' }} />
      </div>
      {children}
    </div>
  );
}
