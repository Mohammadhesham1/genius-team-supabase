import { useState, useEffect } from 'react';
import type { User, PageName } from './types';
import { loadSavedUserId, saveUserId, getUserById, startPresence } from './lib/auth';

import AmbientOrbs from './components/AmbientOrbs';
import BottomNav   from './components/BottomNav';
import LoginPage        from './pages/LoginPage';
import HomePage         from './pages/HomePage';
import SubjectPage      from './pages/SubjectPage';
import OneVsOnePage     from './pages/OneVsOnePage';
import SoloTrainingPage from './pages/SoloTrainingPage';
import GroupTrainingPage from './pages/GroupTrainingPage';
import StatisticsPage   from './pages/StatisticsPage';

interface RouteState {
  page: PageName;
  params?: Record<string, string>;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [route, setRoute] = useState<RouteState>({ page: 'login' });

  // Resume the saved session (if any) from Supabase on first load, instead of
  // a synchronous localStorage-only lookup, since the user now lives in the DB.
  useEffect(() => {
    let cancelled = false;
    const savedId = loadSavedUserId();
    if (!savedId) {
      setCheckingSession(false);
      return;
    }
    getUserById(savedId)
      .then((user) => {
        if (cancelled) return;
        if (user) {
          setCurrentUser(user);
          setRoute({ page: 'home' });
        }
      })
      .catch(() => {
        /* couldn't reach Supabase — fall back to the login screen */
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep a device-session heartbeat alive while someone is logged in, so other
  // members can see who's online when picking 1v1 opponents/referees.
  useEffect(() => {
    if (!currentUser) return;
    const stopPresence = startPresence(currentUser.id);
    return stopPresence;
  }, [currentUser]);

  const navigate = (page: PageName, params?: Record<string, string>) => {
    setRoute({ page, params });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    saveUserId(user.id);
    setRoute({ page: 'home' });
  };

  if (checkingSession) {
    return (
      <div
        style={{ background: '#06091a', minHeight: '100dvh', position: 'relative' }}
        className="flex items-center justify-center"
      >
        <AmbientOrbs />
        <p className="gradient-text font-black text-lg relative z-10" style={{ fontFamily: "'Tajawal',sans-serif" }}>
          جاري التحميل...
        </p>
      </div>
    );
  }

  if (route.page === 'login' || !currentUser) {
    return (
      <div style={{ background: '#06091a', minHeight: '100dvh', position: 'relative' }}>
        <AmbientOrbs />
        <LoginPage onLogin={handleLogin} />
      </div>
    );
  }

  const mainPages = ['home', 'oneonone', 'solo', 'group', 'stats'] as PageName[];
  const showNav = mainPages.includes(route.page) || route.page === 'subject';

  return (
    <div style={{ background: '#06091a', minHeight: '100dvh', position: 'relative' }}>
      <AmbientOrbs />

      {/* Page render */}
      <div className="relative z-10">
        {route.page === 'home' && (
          <HomePage user={currentUser} navigate={navigate} />
        )}
        {route.page === 'subject' && route.params?.subjectId && (
          <SubjectPage
            user={currentUser}
            subjectId={route.params.subjectId}
            navigate={navigate}
          />
        )}
        {route.page === 'oneonone' && (
          <OneVsOnePage user={currentUser} navigate={navigate} />
        )}
        {route.page === 'solo' && (
          <SoloTrainingPage user={currentUser} navigate={navigate} />
        )}
        {route.page === 'group' && (
          <GroupTrainingPage user={currentUser} navigate={navigate} />
        )}
        {route.page === 'stats' && (
          <StatisticsPage user={currentUser} navigate={navigate} />
        )}
      </div>

      {/* Bottom nav */}
      {showNav && (
        <BottomNav currentPage={route.page} navigate={navigate} />
      )}
    </div>
  );
}
