// Shared frontend utilities for Mindpulse

const TOKEN_KEY = 'mindpulse_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/index.html';
  } else {
    document.documentElement.style.visibility = 'visible';
  }
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(path, Object.assign({}, opts, { headers }));
  if (response.status === 401 && window.location.pathname !== '/index.html') {
    clearToken();
    window.location.href = '/index.html';
  }
  return response;
}

// ── Theme System ──────────────────────────────────────────────────────────────
const THEMES = {
  'sage-cream': {
    '--theme-bg':        '#f5f1eb',
    '--theme-sidebar':   'linear-gradient(180deg,#0f2a1d 0%,#1a3528 40%,#1f3d2b 100%)',
    '--theme-primary':   '#2e6f4e',
    '--theme-primary-glow': '#3a8f64',
    '--theme-card':      '#ffffff',
    '--theme-text':      '#1f2937',
    '--theme-accent':    '#1f3d2b',
  },
  'ocean-blue': {
    '--theme-bg':        '#eef4fb',
    '--theme-sidebar':   'linear-gradient(180deg,#0a1f3d 0%,#0d2d5e 40%,#1a4a8a 100%)',
    '--theme-primary':   '#1a6fc4',
    '--theme-primary-glow': '#2e8de0',
    '--theme-card':      '#ffffff',
    '--theme-text':      '#0f1f3d',
    '--theme-accent':    '#0a1f3d',
  },
  'forest-dark': {
    '--theme-bg':        '#111a14',
    '--theme-sidebar':   'linear-gradient(180deg,#060e08 0%,#0d1a10 40%,#111a14 100%)',
    '--theme-primary':   '#2e6f4e',
    '--theme-primary-glow': '#3a8f64',
    '--theme-card':      '#1a2a1e',
    '--theme-text':      '#d4e8d8',
    '--theme-accent':    '#0d1a10',
  }
};

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES['sage-cream'];
  const root = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
  document.body.dataset.theme = themeName;
}

async function loadAndApplyTheme() {
  try {
    const cached = localStorage.getItem('mp_theme');
    if (cached) applyTheme(cached);
    if (!getToken()) return; // skip API call on public pages — no token, no request
    const res = await apiFetch('/api/user/preferences');
    const prefs = await res.json();
    if (prefs.theme) {
      applyTheme(prefs.theme);
      localStorage.setItem('mp_theme', prefs.theme);
    }
  } catch (_) {}
}

// ── Now Playing Bar ───────────────────────────────────────────────────────────
const NP_KEY = 'mp_now_playing';

function setNowPlaying(data) {
  localStorage.setItem(NP_KEY, JSON.stringify(data));
  renderNowPlayingBar();
}

function clearNowPlaying() {
  localStorage.removeItem(NP_KEY);
  const bar = document.getElementById('now-playing-bar');
  if (bar) bar.remove();
}

function renderNowPlayingBar() {
  const raw = localStorage.getItem(NP_KEY);
  if (!raw) return;
  const np = JSON.parse(raw);
  let bar = document.getElementById('now-playing-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'now-playing-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <div class="np-left">
      <div class="np-pulse"></div>
      <span class="np-emoji">${np.emoji || '🎵'}</span>
      <div class="np-info">
        <div class="np-title">${np.title || 'Session'}</div>
        <div class="np-sub">${np.category || ''} · ${np.minutes || 0} min</div>
      </div>
    </div>
    <div class="np-right">
      <a href="/meditation.html?session=${np.id}" class="np-resume-btn">Resume →</a>
      <button class="np-close" onclick="clearNowPlaying()" aria-label="Dismiss">✕</button>
    </div>
  `;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  let sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    sidebar = document.createElement('nav');
    sidebar.id = 'sidebar';
    document.body.prepend(sidebar);
  }

  const current = window.location.pathname;

  const mainLinks = [
    { href: '/dashboard.html',        label: 'Dashboard',        icon: '🏠' },
    { href: '/meditation.html',        label: 'Meditations',       icon: '🧘' },
    { href: '/meditation-timer.html',  label: 'Meditation Timer',  icon: '⏱️' },
    { href: '/breathwork.html',        label: 'Breathwork',        icon: '🌬️' },
    { href: '/sleep.html',             label: 'Sleep Sounds',      icon: '🌙' },
  ];
  const growLinks = [
    { href: '/progress.html',  label: 'Progress', icon: '📈' },
    { href: '/journal.html',   label: 'Journal',  icon: '📓' },
  ];
  const accountLinks = [
    { href: '/profile.html', label: 'Profile & Settings', icon: '👤' },
  ];

  function navItems(links) {
    return links.map(l => {
      const active = current.endsWith(l.href) ? ' class="active"' : '';
      return `<li><a href="${l.href}"${active}><span class="nav-icon">${l.icon}</span>${l.label}</a></li>`;
    }).join('');
  }

  sidebar.innerHTML = `
    <div class="sidebar-logo"><span class="sidebar-logo-icon">🧘</span> Mindpulse</div>
    <div class="sidebar-section-label">MAIN</div>
    <ul class="sidebar-nav">${navItems(mainLinks)}</ul>
    <div class="sidebar-section-label">GROW</div>
    <ul class="sidebar-nav">${navItems(growLinks)}</ul>
    <div class="sidebar-section-label">ACCOUNT</div>
    <ul class="sidebar-nav">${navItems(accountLinks)}</ul>
    <div class="sidebar-streak">
      <span class="streak-fire">🔥</span>
      <div>
        <div class="streak-number" id="sidebar-streak-num">— Day Streak</div>
        <div class="streak-sub">Keep it going!</div>
      </div>
    </div>
  `;

  apiFetch('/api/user/profile').then(r => r.json()).then(data => {
    const el = document.getElementById('sidebar-streak-num');
    if (el) el.textContent = `${data.stats?.streak ?? 0} Day Streak`;
  }).catch(() => {});
}

function renderTopbar(name) {
  let topbar = document.getElementById('topbar');
  if (!topbar) {
    topbar = document.createElement('header');
    topbar.id = 'topbar';
    document.body.prepend(topbar);
  }
  const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
  topbar.innerHTML = `
    <div class="topbar-user">
      <span>${name || ''}</span>
      <div class="topbar-avatar" aria-hidden="true">${initials}</div>
    </div>
  `;
}

function logout() {
  clearToken();
  window.location.href = '/index.html';
}

// Apply theme on every page load (skips API call if no token)
loadAndApplyTheme();
// Render now-playing bar only for authenticated pages
if (getToken()) {
  document.addEventListener('DOMContentLoaded', renderNowPlayingBar);
}

// ── Centralized Audio Controller ──────────────────────────────────────────────
// Single instance — only one sound plays at a time across the whole app.
const MindpulseAudio = (() => {
  const FALLBACK_SRC = '/audio/ambient.wav';
  const FADE_DURATION = 1.5; // seconds
  const DEFAULT_VOLUME = 0.3;

  let _ctx = null;
  let _gainNode = null;
  let _source = null;
  let _buffer = null;
  let _currentSrc = null;
  let _loop = false;
  let _volume = DEFAULT_VOLUME;
  // Generation counter — incremented on every stop/swap to cancel stale async callbacks
  let _gen = 0;

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _gainNode = _ctx.createGain();
      _gainNode.gain.value = 0;
      _gainNode.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // Use AudioContext time-based ramp — works even when tab is hidden (unlike rAF)
  function _rampGain(targetValue, duration) {
    const ac = _getCtx();
    _gainNode.gain.cancelScheduledValues(ac.currentTime);
    _gainNode.gain.setValueAtTime(_gainNode.gain.value, ac.currentTime);
    _gainNode.gain.linearRampToValueAtTime(targetValue, ac.currentTime + duration);
  }

  async function _loadBuffer(src) {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return await _getCtx().decodeAudioData(ab);
    } catch (e) {
      console.warn('[MindpulseAudio] Failed to load', src, '— falling back to ambient');
      if (src === FALLBACK_SRC) return null;
      try {
        const res = await fetch(FALLBACK_SRC);
        const ab = await res.arrayBuffer();
        return await _getCtx().decodeAudioData(ab);
      } catch (_) { return null; }
    }
  }

  function _stopSource() {
    if (_source) {
      try { _source.loop = false; _source.stop(0); } catch (_) {}
      _source = null;
    }
  }

  function _startSource(buffer, loop) {
    _stopSource();
    const ac = _getCtx();
    _source = ac.createBufferSource();
    _source.buffer = buffer;
    _source.loop = loop;
    _source.connect(_gainNode);
    _source.start(0);
  }

  // Public API
  return {
    /** Load and play a sound. Fades out current, fades in new. */
    async play(src, { loop = false } = {}) {
      _loop = loop;
      const myGen = ++_gen; // capture generation for this call

      // Same source already playing — just fade back in
      if (src === _currentSrc && _source) {
        _rampGain(_volume, FADE_DURATION);
        return;
      }

      // Fade out current, then start new
      if (_source) {
        _rampGain(0, FADE_DURATION);
        // Wait for fade-out, then check we're still the active call
        await new Promise(r => setTimeout(r, FADE_DURATION * 1000));
        if (myGen !== _gen) return; // superseded by a newer call
        _stopSource();
      }

      _currentSrc = src;
      _buffer = await _loadBuffer(src);
      if (myGen !== _gen) return; // superseded while loading
      if (!_buffer) return;

      _gainNode.gain.cancelScheduledValues(_getCtx().currentTime);
      _gainNode.gain.setValueAtTime(0, _getCtx().currentTime);
      _startSource(_buffer, _loop);
      _rampGain(_volume, FADE_DURATION);
    },

    /** Pause with fade-out. */
    pause() {
      const myGen = ++_gen;
      _rampGain(0, FADE_DURATION);
      setTimeout(() => {
        if (myGen !== _gen) return;
        _stopSource();
      }, FADE_DURATION * 1000);
    },

    /** Stop immediately — no fade. Safe to call at any time. */
    stop() {
      _gen++; // invalidate any pending async callbacks
      if (_gainNode) {
        _gainNode.gain.cancelScheduledValues(0);
        _gainNode.gain.setValueAtTime(0, 0);
      }
      _stopSource();
      _currentSrc = null;
      _buffer = null;
    },

    /** Set volume (0–1). Applied immediately and persisted for future plays. */
    setVolume(v) {
      _volume = Math.max(0, Math.min(1, v));
      // Only update gain if audio is actively playing (not mid-fade-out)
      if (_gainNode && _source) {
        _gainNode.gain.cancelScheduledValues(_getCtx().currentTime);
        _gainNode.gain.setValueAtTime(_volume, _getCtx().currentTime);
      }
    },

    get volume() { return _volume; },
    get isPlaying() { return !!_source; },
    get currentSrc() { return _currentSrc; },
  };
})();
