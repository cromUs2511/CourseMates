import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  Bot,
  ArrowRight,
  Users,
  MessageCircleMore,
  Pencil,
  Check,
  Sparkles,
  Clock3,
  Lightbulb,
} from 'lucide-react';
import { StudentSession, ActivePeerInfo, Campus, AcademicDiscipline } from '../types';
import { SIMULATED_PEERS } from '../data/mockData';
import { apiRequest } from '../utils/api';
import { playChime } from '../utils/sound';
import type { ChatTheme } from './ChatThemeMenu';
import {
  ACCESSORIES,
  AVATARS,
  BACKGROUNDS,
  HAIR_COLORS,
  PixelAvatar,
  SKIN_TONES,
  loadAvatarConfig,
  saveAvatarConfig,
  type AccessoryId,
  type AvatarConfig,
  type AvatarId,
} from './PixelAvatar';
import '../matching-chat.css';

const MATCH_POLL_INTERVAL_MS = 400;
const MATCH_SOCKET_TIMEOUT_MS = 1500;
const MATCH_POLL_TIMEOUT_MS = 4000;
const MATCH_POLL_FAILURE_LIMIT = 4;
const MATCH_JOIN_ATTEMPTS = 3;
const MATCH_JOIN_TIMEOUT_MS = 5000;
const MATCH_RETRY_DELAY_MS = 400;
const MATCH_HEARTBEAT_MS = 5000;
const toErrorMessage = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    ? 'The network is responding slowly. Please try again.'
    : error instanceof Error && error.message
      ? error.message
      : 'Unable to connect. Please try again.';
const CHAT_INTENTS = [
  {
    label: 'Study / Help',
    description: 'Focus together or get support with a question',
    icon: Users,
  },
  {
    label: 'Casual / Vent',
    description: 'Relaxed chat, or talk freely in a private space',
    icon: MessageCircleMore,
  },
] as const;

interface MatchmakingQueueProps {
  session: StudentSession;
  onMatched: (peer: ActivePeerInfo, topic: string, ws?: WebSocket, roomId?: string) => void;
  onRerollHandle: () => void;
  onSessionUpdate: (session: StudentSession) => void;
  isDarkMode: boolean;
  autoSearch?: boolean;
  chatTheme: ChatTheme;
}

export const MatchmakingQueue: React.FC<MatchmakingQueueProps> = ({
  session,
  onMatched,
  onRerollHandle,
  onSessionUpdate,
  isDarkMode,
  autoSearch = false,
  chatTheme,
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [queueTime, setQueueTime] = useState(0);
  const [error, setError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(session.customHandle ? session.sessionHandle : '');
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null);
  const [interestsEnabled, setInterestsEnabled] = useState(false);
  const [avatar, setAvatar] = useState<AvatarConfig>(() => loadAvatarConfig());
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);
  type StudioTab = 'style' | 'skin' | 'hair' | 'backdrop' | 'topper';
  const [studioTab, setStudioTab] = useState<StudioTab>('style');
  const studioTabs: { id: StudioTab; label: string }[] = [
    { id: 'style', label: 'Style' },
    ...(avatar.char === 'robot'
      ? []
      : [
          { id: 'skin', label: 'Skin' },
          { id: 'hair', label: 'Hair' },
        ]),
    { id: 'backdrop', label: 'Backdrop' },
    { id: 'topper', label: 'Topper' },
  ] as { id: StudioTab; label: string }[];
  const activeTab = studioTabs.some((tab) => tab.id === studioTab) ? studioTab : 'style';
  const activeIndex = Math.max(
    0,
    studioTabs.findIndex((tab) => tab.id === activeTab),
  );
  const stepTab = (delta: 1 | -1) => {
    const next = studioTabs[(activeIndex + delta + studioTabs.length) % studioTabs.length];
    if (!next) return;
    setStudioTab(next.id);
    document.getElementById(`avatar-tab-${next.id}`)?.focus();
  };
  const updateAvatar = (patch: Partial<AvatarConfig>) => {
    setAvatar((current) => {
      const next = { ...current, ...patch };
      saveAvatarConfig(next);
      return next;
    });
  };
  const [canProceedNormally, setCanProceedNormally] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const searchingRef = useRef(false);
  const isMatchedRef = useRef(false);
  const allowNormalRef = useRef(false);
  const matchingInterestsRef = useRef<string[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showSimulateOption = isSearching && queueTime >= 3;
  const formatQueueTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
  };
  const queueStatusText = !isSearching
    ? 'Ready when you are'
    : queueTime < 8
      ? 'Finding active study peers…'
      : queueTime < 25
        ? 'Finding active study peers… holding your spot in line…'
        : 'Finding active study peers… few around — keep waiting or try a quick option below';
  const MATCHING_TIPS = [
    'Photos & voice unlock 90 seconds into the chat — text works right away.',
    'You can leave anytime. Rooms clear the moment the chat ends.',
    'Conversation starters appear at the top of every new chat.',
    'Reporting or blocking a peer takes one tap, right from the chat header.',
  ];
  const [tipIndex, setTipIndex] = useState(0);
  const loadingTitleRef = useRef<HTMLHeadingElement>(null);

  const clearPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
  };
  const stopHeartbeat = () => {
    if (heartbeatRef.current !== null) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  };
  const startHeartbeat = (ws: WebSocket) => {
    stopHeartbeat();
    // Keep the server-side queue lease fresh even when REST polls are failing.
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current === ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'ping' }));
    }, MATCH_HEARTBEAT_MS);
  };
  const closeSocket = () => {
    stopHeartbeat();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
  };
  useEffect(() => {
    if (!isSearching) {
      setQueueTime(0);
      return;
    }
    const timer = setInterval(() => setQueueTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isSearching]);
  useEffect(
    () => () => {
      ++attemptRef.current;
      clearPolling();
      stopHeartbeat();
      // The chat owns the socket after a match.
      if (!isMatchedRef.current) {
        closeSocket();
        if (searchingRef.current) void apiRequest('/api/match/cancel', {}).catch(() => {});
      }
    },
    [session.id],
  );

  const handleMatchSuccess = (data: any) => {
    if (isMatchedRef.current || !searchingRef.current) return;
    isMatchedRef.current = true;
    searchingRef.current = false;
    clearPolling();
    playChime('match');
    const matchedPeer: ActivePeerInfo = {
      ...data.peer,
      sessionId: data.peer.sessionId,
      interests: data.peer.interests || [],
      topic: data.topic || 'General Peer Discovery',
      matchedAt: data.matchedAt || Date.now(),
      mediaUnlockAt: data.mediaUnlockAt || Date.now() + 90_000,
    };
    const socket = wsRef.current;
    if (socket) {
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    onMatched(matchedPeer, matchedPeer.topic, socket || undefined, data.roomId);
  };
  const startMatchmaking = () => {
    if (searchingRef.current) return;
    // Interests are strictly opt-in: no selection (or toggle off) matches anyone.
    const interestsToMatch = interestsEnabled && selectedIntent !== null ? [selectedIntent] : [];
    setError('');
    setCanProceedNormally(false);
    matchingInterestsRef.current = interestsToMatch;
    allowNormalRef.current = !interestsEnabled || selectedIntent === null;
    setIsSearching(true);
    searchingRef.current = true;
    isMatchedRef.current = false;
    const attempt = ++attemptRef.current;
    const current = () => attemptRef.current === attempt && searchingRef.current;
    const socketAlive = () => wsRef.current?.readyState === WebSocket.OPEN;
    let polling = false;
    let busy = false;
    let pollFailures = 0;
    const fail = (err: unknown) => {
      if (!current()) return;
      setError(toErrorMessage(err));
      searchingRef.current = false;
      setIsSearching(false);
      clearPolling();
      closeSocket();
      void apiRequest('/api/match/cancel', {}).catch(() => {});
    };
    const poll = async () => {
      if (!current() || busy) return;
      busy = true;
      try {
        const data = await apiRequest(
          '/api/match/poll',
          undefined,
          AbortSignal.timeout(MATCH_POLL_TIMEOUT_MS),
        );
        if (!current()) return;
        pollFailures = 0;
        if (data.status === 'matched') handleMatchSuccess(data);
        else if (data.status === 'queued')
          setCanProceedNormally(data.interestMatchUnavailable === true && !allowNormalRef.current);
        else if (data.status === 'idle')
          fail(new Error('Your queue entry expired. Please try again.'));
      } catch (err) {
        // A healthy socket still delivers matches, so only sustained REST
        // failures without a socket end the search.
        pollFailures += 1;
        if (current() && !socketAlive() && pollFailures >= MATCH_POLL_FAILURE_LIMIT) fail(err);
      } finally {
        busy = false;
      }
    };
    const fallback = async () => {
      if (!current() || polling) return;
      polling = true;
      closeSocket();
      let lastError: unknown;
      for (let joinAttempt = 1; joinAttempt <= MATCH_JOIN_ATTEMPTS; joinAttempt += 1) {
        if (!current()) return;
        try {
          const data = await apiRequest(
            '/api/match/join',
            { interests: interestsToMatch, allowNormal: allowNormalRef.current },
            AbortSignal.timeout(MATCH_JOIN_TIMEOUT_MS),
          );
          if (!current()) {
            void apiRequest('/api/match/cancel', {}).catch(() => {});
            return;
          }
          if (data.status === 'matched') {
            handleMatchSuccess(data);
            return;
          }
          pollFailures = 0;
          void poll();
          pollIntervalRef.current = setInterval(poll, MATCH_POLL_INTERVAL_MS);
          return;
        } catch (err) {
          lastError = err;
          if (joinAttempt < MATCH_JOIN_ATTEMPTS && current())
            await new Promise((resolve) => setTimeout(resolve, MATCH_RETRY_DELAY_MS));
        }
      }
      if (current()) fail(lastError);
    };
    try {
      const ws = new WebSocket(
        (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/chat',
      );
      wsRef.current = ws;
      const connectionTimeout = setTimeout(() => {
        if (current() && ws.readyState !== WebSocket.OPEN) void fallback();
      }, MATCH_SOCKET_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        if (!current()) {
          closeSocket();
          return;
        }
        pollFailures = 0;
        startHeartbeat(ws);
        ws.send(
          JSON.stringify({
            type: 'join_queue',
            interests: interestsToMatch,
            allowNormal: allowNormalRef.current,
          }),
        );
        // Wait for the server's queued acknowledgement before polling. A GET
        // can otherwise overtake join_queue on a separate connection (Safari).
      };
      ws.onmessage = (event) => {
        if (!current()) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'matched') handleMatchSuccess(data);
          else if (data.type === 'queued') {
            setCanProceedNormally(
              data.interestMatchUnavailable === true && !allowNormalRef.current,
            );
            if (!pollIntervalRef.current) {
              void poll();
              pollIntervalRef.current = setInterval(poll, MATCH_POLL_INTERVAL_MS);
            }
          } else if (data.type === 'error') fail(new Error(data.error));
        } catch {
          fail(new Error('Invalid matchmaking response.'));
        }
      };
      ws.onerror = () => {
        clearTimeout(connectionTimeout);
        clearPolling();
        void fallback();
      };
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        clearPolling();
        if (event.code === 1008) fail(new Error('Your session expired. Sign out and try again.'));
        else void fallback();
      };
    } catch {
      void fallback();
    }
  };
  const proceedWithNormalMatching = async () => {
    if (!searchingRef.current || allowNormalRef.current) return;
    allowNormalRef.current = true;
    setCanProceedNormally(false);
    setError('');
    try {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'join_queue',
            interests: matchingInterestsRef.current,
            allowNormal: true,
          }),
        );
        return;
      }
      const data = await apiRequest(
        '/api/match/join',
        { interests: matchingInterestsRef.current, allowNormal: true },
        AbortSignal.timeout(MATCH_JOIN_TIMEOUT_MS),
      );
      if (data.status === 'matched') handleMatchSuccess(data);
    } catch (err) {
      setError(toErrorMessage(err));
      allowNormalRef.current = false;
      setCanProceedNormally(true);
    }
  };
  const cancelMatchmaking = async () => {
    ++attemptRef.current;
    searchingRef.current = false;
    clearPolling();
    closeSocket();
    try {
      await apiRequest('/api/match/cancel', {});
    } catch (err) {
      setError((err as Error).message);
    }
    setIsSearching(false);
  };
  const pairWithSimulatedPeer = async () => {
    await cancelMatchmaking();
    isMatchedRef.current = true;
    const randomPeer = SIMULATED_PEERS[Math.floor(Math.random() * SIMULATED_PEERS.length)];
    if (!randomPeer) {
      setError('The chatbot is temporarily unavailable. Please try again.');
      return;
    }
    const primaryTopic = matchingInterestsRef.current[0] || 'General Peer Discovery';
    onMatched(
      {
        ...randomPeer,
        sessionId: 'sim_' + Date.now(),
        topic: primaryTopic,
        matchedAt: Date.now(),
        mediaUnlockAt: Date.now() + 90_000,
        isSimulated: true,
      },
      primaryTopic,
      undefined,
      'sim_room_' + Date.now(),
    );
  };
  useEffect(() => {
    if (!autoSearch) return;
    const timer = setTimeout(startMatchmaking, 0);
    return () => clearTimeout(timer);
  }, [autoSearch]);
  useEffect(() => {
    if (!isSearching) {
      setTipIndex(0);
      return;
    }
    loadingTitleRef.current?.focus();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tips = setInterval(() => setTipIndex((i) => (i + 1) % MATCHING_TIPS.length), 4000);
    return () => clearInterval(tips);
  }, [isSearching]);
  useEffect(() => {
    if (!isSearching) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void cancelMatchmaking();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSearching]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameInput.trim() || isSearching) return;
    try {
      const data = await apiRequest('/api/auth/handle', { name: nameInput });
      onSessionUpdate(data.session);
      setIsEditingName(false);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className="matching-menu ambient-grid chat-theme-scope flex-1 min-h-0 w-full h-full flex flex-col items-center px-4 py-6 sm:px-6 sm:py-10 overflow-y-auto select-none"
      style={
        {
          backgroundColor: isDarkMode ? chatTheme.darkBackground : chatTheme.lightBackground,
          '--chat-accent': chatTheme.accent,
          '--chat-accent-hover': chatTheme.accentHover,
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-2xl space-y-4 my-auto">
        {/* Simple hero: what this is, in one glance. */}
        <div className="matching-hero space-y-2.5 text-center">
          <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
            <Sparkles className="chat-theme-accent-text h-3.5 w-3.5" aria-hidden="true" />
            Anonymous study chat
          </p>
          <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-stone-900 dark:text-white sm:text-3xl">
            Find your study person.
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            Pick a vibe, hit one button, and we&apos;ll pair you with a single anonymous peer. No
            profiles, no pressure to stay.
          </p>
        </div>
        {/* Identity and name controls stay together at every screen size. */}
        <div
          className={`matching-identity ui-surface rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isDarkMode ? 'text-stone-100' : 'text-stone-800'
          }`}
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 dark:border-stone-700"
            >
              <PixelAvatar config={avatar} size={44} />
            </span>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                Chatting as
              </span>
              {!isEditingName ? (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 break-words rounded-lg py-2 text-left text-base font-bold tracking-tight text-stone-900 dark:text-white">
                    {session.sessionHandle}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(session.customHandle ? session.sessionHandle : '');
                        setIsEditingName(true);
                      }}
                      disabled={isSearching}
                      title="Edit anonymous name"
                      aria-label="Edit anonymous name"
                      className="matching-name-action inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border bg-stone-50/80 p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-800/80"
                    >
                      <Pencil className="h-3.5 w-3.5 text-stone-600 dark:text-stone-300" />
                    </button>
                    {!session.customHandle && (
                      <button
                        type="button"
                        onClick={onRerollHandle}
                        disabled={isSearching}
                        title="Shuffle default name"
                        className="matching-name-action chat-theme-accent-soft inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-1.5 border bg-stone-50/80 dark:bg-stone-800/80 transition-colors cursor-pointer shrink-0"
                      >
                        <RefreshCw className="chat-theme-accent-text w-3.5 h-3.5" />
                      </button>
                    )}
                    {session.customHandle && (
                      <button
                        type="button"
                        onClick={onRerollHandle}
                        disabled={isSearching}
                        className="matching-name-action chat-theme-accent-soft rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      >
                        Use default name
                      </button>
                    )}
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={saveName}
                  className="matching-name-form flex flex-wrap items-center gap-2"
                >
                  <input
                    autoFocus
                    minLength={2}
                    maxLength={40}
                    aria-label="Custom name"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter a name"
                    className="w-44 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-900 outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="chat-theme-accent-button rounded-md px-2.5 py-1 text-[10px] font-semibold text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="rounded-md border border-stone-300 px-2.5 py-1 text-[10px] text-stone-500 dark:border-stone-700"
                  >
                    Cancel
                  </button>
                </form>
              )}
              {!isEditingName && (
                <button
                  type="button"
                  onClick={() => setAvatarStudioOpen((value) => !value)}
                  aria-expanded={avatarStudioOpen}
                  aria-controls="avatar-studio"
                  disabled={isSearching}
                  className="mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-[11px] font-bold text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  <Sparkles className="chat-theme-accent-text h-3.5 w-3.5" aria-hidden="true" />
                  {avatarStudioOpen ? 'Hide avatar studio' : 'Customize avatar'}
                </button>
              )}
              {!isEditingName && avatarStudioOpen && (
                <div
                  id="avatar-studio"
                  className="mt-2 space-y-2.5 border-t border-stone-200 pt-3 dark:border-stone-800"
                >
                  <div
                    role="tablist"
                    aria-label="Avatar options"
                    className="flex flex-wrap gap-1.5"
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowRight') stepTab(1);
                      if (event.key === 'ArrowLeft') stepTab(-1);
                    }}
                  >
                    {studioTabs.map((tab) => {
                      const selected = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          id={`avatar-tab-${tab.id}`}
                          aria-selected={selected}
                          aria-controls="avatar-studio-panel"
                          tabIndex={selected ? 0 : -1}
                          disabled={isSearching}
                          onClick={() => setStudioTab(tab.id)}
                          className={`min-h-10 rounded-full border px-3 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected
                              ? 'chat-theme-accent-soft border-current'
                              : 'border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    id="avatar-studio-panel"
                    role="tabpanel"
                    aria-labelledby={`avatar-tab-${activeTab}`}
                  >
                    {activeTab === 'style' && (
                      <div
                        role="radiogroup"
                        aria-label="Avatar style"
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                          Style
                        </span>
                        {AVATARS.map((option) => {
                          const selected = avatar.char === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={option.label}
                              title={option.label}
                              disabled={isSearching}
                              onClick={() => updateAvatar({ char: option.id as AvatarId })}
                              className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                selected
                                  ? 'chat-theme-accent-soft border-current'
                                  : 'border-stone-200 dark:border-stone-700'
                              }`}
                            >
                              <PixelAvatar
                                config={{
                                  ...avatar,
                                  char: option.id as AvatarId,
                                  accessory: 'none',
                                }}
                                size={44}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {activeTab === 'skin' && avatar.char !== 'robot' && (
                      <div
                        role="radiogroup"
                        aria-label="Skin tone"
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                          Skin
                        </span>
                        {SKIN_TONES.map((option) => {
                          const selected = avatar.skin === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${option.name} skin tone`}
                              title={`${option.name} skin tone`}
                              disabled={isSearching}
                              onClick={() => updateAvatar({ skin: option.value })}
                              style={{
                                backgroundColor: option.value,
                                boxShadow: selected
                                  ? `0 0 0 2px ${chatTheme.lightBackground}, 0 0 0 4px ${chatTheme.accent}`
                                  : undefined,
                              }}
                              className="h-10 w-10 rounded-full border border-black/15 transition disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          );
                        })}
                      </div>
                    )}
                    {activeTab === 'hair' && avatar.char !== 'robot' && (
                      <div
                        role="radiogroup"
                        aria-label="Hair color"
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                          Hair
                        </span>
                        {HAIR_COLORS.map((option) => {
                          const selected = avatar.hair === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${option.name} hair`}
                              title={`${option.name} hair`}
                              disabled={isSearching}
                              onClick={() => updateAvatar({ hair: option.value })}
                              style={{
                                backgroundColor: option.value,
                                boxShadow: selected
                                  ? `0 0 0 2px ${chatTheme.lightBackground}, 0 0 0 4px ${chatTheme.accent}`
                                  : undefined,
                              }}
                              className="h-10 w-10 rounded-full border border-black/15 transition disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          );
                        })}
                      </div>
                    )}
                    {activeTab === 'backdrop' && (
                      <div
                        role="radiogroup"
                        aria-label="Avatar background"
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                          Backdrop
                        </span>
                        {BACKGROUNDS.map((option) => {
                          const selected = avatar.bg === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${option.name} background`}
                              title={`${option.name} background`}
                              disabled={isSearching}
                              onClick={() => updateAvatar({ bg: option.value })}
                              style={{
                                backgroundColor: option.value,
                                boxShadow: selected
                                  ? `0 0 0 2px ${chatTheme.lightBackground}, 0 0 0 4px ${chatTheme.accent}`
                                  : undefined,
                              }}
                              className="h-10 w-10 rounded-full border border-black/15 transition disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          );
                        })}
                      </div>
                    )}
                    {activeTab === 'topper' && (
                      <div
                        role="radiogroup"
                        aria-label="Avatar topper"
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
                          Topper
                        </span>
                        {ACCESSORIES.map((option) => {
                          const selected = avatar.accessory === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={option.id === 'none' ? 'No topper' : option.label}
                              title={option.id === 'none' ? 'No topper' : option.label}
                              disabled={isSearching}
                              onClick={() => updateAvatar({ accessory: option.id as AccessoryId })}
                              className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                selected
                                  ? 'chat-theme-accent-soft border-current'
                                  : 'border-stone-200 dark:border-stone-700'
                              }`}
                            >
                              <PixelAvatar
                                config={{ ...avatar, accessory: option.id as AccessoryId }}
                                size={44}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => stepTab(-1)}
                      disabled={isSearching || activeIndex === 0}
                      className="min-h-10 rounded-lg border border-stone-200 px-3 text-[11px] font-bold text-stone-600 transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-300"
                    >
                      ← Back
                    </button>
                    <span
                      aria-live="polite"
                      className="text-[11px] font-semibold text-stone-500 dark:text-stone-400"
                    >
                      Step {activeIndex + 1} of {studioTabs.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepTab(1)}
                      disabled={isSearching || activeIndex === studioTabs.length - 1}
                      className="chat-theme-accent-button min-h-10 rounded-lg px-3 text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0 text-xs border-t sm:border-t-0 pt-3 sm:pt-0 w-full sm:w-auto border-stone-200 dark:border-stone-800">
            <span className="text-[10px] text-stone-500 dark:text-stone-400 block uppercase tracking-wider font-semibold">
              Private session
            </span>
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Anonymous community session
            </span>
          </div>
        </div>

        {/* Main match card: match action first, interests optional below */}
        <div
          className={`matching-preferences ui-surface rounded-2xl p-5 sm:p-7 space-y-5 sm:space-y-6 ${
            isDarkMode ? 'text-stone-100' : 'text-stone-800'
          }`}
        >
          {/* Match action on top */}
          {!isSearching && (
            <div className="matching-ready space-y-3 text-center">
              <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
                <Sparkles className="chat-theme-accent-text h-3.5 w-3.5" aria-hidden="true" />
                Ready to chat — takes about a minute
              </p>
              <button
                id="start-chat-btn"
                type="button"
                onClick={startMatchmaking}
                className="chat-theme-accent-button matching-pulse-ring w-full rounded-xl py-3.5 px-6 text-white font-bold text-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <span>Find my peers</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <p className="mx-auto max-w-md text-balance text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                Anonymous &amp; private — rooms clear when the chat ends.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-left text-sm leading-relaxed text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
              >
                !
              </span>
              <p className="min-w-0 flex-1">
                <span className="block font-semibold">That didn&apos;t go through</span>
                <span className="mt-0.5 block text-[13px] font-normal">{error}</span>
                <span className="mt-1 block text-xs font-normal opacity-80">
                  Take a breath — nothing was lost. Try again when you&apos;re ready.
                </span>
              </p>
            </div>
          )}

          {/* Optional interests below, gated by a checkmark toggle */}
          <div className="border-t border-stone-200 dark:border-stone-800 pt-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="pb-0">
                <h2 className="text-xl font-bold leading-snug tracking-tight text-stone-900 dark:text-white">
                  What kind of chat do you want? (optional)
                </h2>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={interestsEnabled}
              aria-label="Match by interest"
              id="interest-filter-toggle"
              disabled={isSearching}
              onClick={() => {
                if (interestsEnabled) setSelectedIntent(null);
                setInterestsEnabled((v) => !v);
              }}
              className={`inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                interestsEnabled
                  ? 'chat-theme-accent-soft border-current'
                  : 'border-stone-200 bg-white/60 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                  interestsEnabled
                    ? 'chat-theme-accent-button border-transparent text-white'
                    : 'border-stone-300 bg-white text-transparent dark:border-stone-600 dark:bg-stone-800'
                }`}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span>Match by interest</span>
            </button>

            <div
              className={`grid grid-cols-1 gap-3 sm:grid-cols-2 transition-opacity ${
                interestsEnabled ? 'opacity-100' : 'opacity-50'
              }`}
              role="radiogroup"
              aria-label="Chat preference"
              aria-disabled={!interestsEnabled}
            >
              {CHAT_INTENTS.map((intent) => {
                const selected = interestsEnabled && selectedIntent === intent.label;
                const Icon = intent.icon;
                return (
                  <button
                    key={intent.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!interestsEnabled || isSearching}
                    onClick={() => setSelectedIntent(selected ? null : intent.label)}
                    className={`matching-intent rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? 'chat-theme-accent-soft border-current'
                        : 'border-stone-200 bg-white/60 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-200 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="matching-intent-indicator" aria-hidden="true" />
                      <span
                        className="matching-intent-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{intent.label}</span>
                        <span className="matching-intent-description mt-1 block text-xs font-normal leading-relaxed">
                          {intent.description}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Dedicated matching page: fully opaque and isolated while the queue runs. */}
      {isSearching && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="matching-loading-title"
          aria-busy="true"
          className="matching-loading-page"
          style={{
            backgroundColor: isDarkMode ? chatTheme.darkBackground : chatTheme.lightBackground,
          }}
        >
          <div aria-hidden="true" className="matching-loading-grid" />
          <div className="matching-loading-card ui-surface my-auto w-full max-w-md rounded-2xl p-6 text-center sm:p-8">
            <div aria-hidden="true" className="matching-orbit">
              <span className="matching-orbit-ring" />
              <span className="matching-orbit-center">
                <Users className="chat-theme-accent-text h-6 w-6" />
              </span>
              <span className="matching-orbit-satellite" />
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
              Step 2 of 3 • Finding your partner
            </p>
            <h2
              id="matching-loading-title"
              ref={loadingTitleRef}
              tabIndex={-1}
              className="mt-1.5 text-xl font-bold leading-snug tracking-tight text-stone-900 outline-none dark:text-white"
            >
              {queueStatusText}
            </h2>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Waiting {formatQueueTime(queueTime)} • we&apos;ll chime when someone joins
            </p>
            <div
              role="progressbar"
              aria-label="Searching for a study partner"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, (queueTime % 6) * 20 + 20)}
              className="matching-progress mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
            >
              <div
                className="chat-theme-accent-button matching-progress-fill h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (queueTime % 6) * 20 + 20)}%` }}
              />
            </div>
            <p
              aria-live="polite"
              className="matching-tip mx-auto mt-4 flex min-h-8 max-w-sm items-start justify-center gap-1.5 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400"
            >
              <Lightbulb
                className="chat-theme-accent-text mt-px h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{MATCHING_TIPS[tipIndex]}</span>
            </p>
            <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
              <button
                id="cancel-queue-btn"
                type="button"
                onClick={cancelMatchmaking}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 sm:w-auto"
              >
                Cancel Search
              </button>
              {canProceedNormally && (
                <button
                  id="normal-match-btn"
                  type="button"
                  onClick={proceedWithNormalMatching}
                  className="chat-theme-accent-button w-full rounded-xl px-4 py-2 text-xs font-bold text-white sm:w-auto"
                >
                  Proceed with normal matching
                </button>
              )}
            </div>
            <p className="mt-3 text-[11px] text-stone-400 dark:text-stone-500">
              Press Escape to cancel anytime.
            </p>
            {showSimulateOption && (
              <div className="matching-quick-match mt-4 rounded-xl border border-dashed border-stone-300 bg-white/70 p-3 text-left dark:border-stone-700 dark:bg-stone-900/70 sm:p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-stone-800 dark:text-stone-100">
                  <Bot className="chat-theme-accent-text h-4 w-4" aria-hidden="true" />
                  Need a quick match?
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                  Quiet right now? Warm up with the student chatbot — you can still find a human
                  peer after.
                </p>
                <button
                  id="simulate-peer-btn"
                  type="button"
                  onClick={pairWithSimulatedPeer}
                  className="chat-theme-accent-button mt-2 flex w-full items-center justify-center space-x-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white sm:w-auto"
                >
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  <span>Try Student Chatbot Assistant</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
