import { CHARACTERS, ClassData } from './data/Classes';
import { createRoom, joinAnyRoom, joinRoom } from './network/Network';
import { requireAuth, saveUserToSupabase, getClerk, fetchPlayerStats, PlayerStats } from './auth';

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

function playMenuClick(): void {
  const audio = new Audio('/audio/menu_hover.mp3');
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

const bgMusic = new Audio('/audio/music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

function startMusic(): void {
  if (!bgMusic.paused) return;
  bgMusic.play().catch(() => {});
}

export function stopMusic(): void {
  bgMusic.pause();
  bgMusic.currentTime = 0;
}

// Try immediately; if browser blocks it, unlock on first interaction
bgMusic.play().catch(() => {
  const unlock = () => {
    bgMusic.play().catch(() => {});
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
});


const USERNAME_KEY = 'cc_username';
const CHARACTER_KEY = 'cc_character';

export interface LobbyResult {
  username: string;
  clerkId: string;
  mode: 'host' | 'join';
  isPrivate: boolean;
  roomCode: string;
  classData: ClassData;
  gameMode: string;
}

export function initLobby(): Promise<LobbyResult> {
  return new Promise(async (resolve) => {
    const clerk = await requireAuth();
    const clerkUser = clerk.user!;
    const clerkId = clerkUser.id;
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
    const avatarUrl: string = clerkUser.imageUrl ?? '';
    const displayName: string =
      clerkUser.firstName
        ? `${clerkUser.firstName}${clerkUser.lastName ? ' ' + clerkUser.lastName : ''}`
        : (clerkUser.username ?? email.split('@')[0] ?? 'Player');

    const stored = localStorage.getItem(USERNAME_KEY);
    if (stored) {
      void saveUserToSupabase(clerkId, stored, email);
      showLobby(stored, resolve, clerkId, email, avatarUrl, displayName);
    } else {
      showLogin(resolve, clerkId, email, avatarUrl, displayName);
    }
  });
}

function setHeaderProfile(avatarUrl: string, displayName: string): void {
  const img = document.getElementById('user-avatar-img') as HTMLImageElement | null;
  const nameEl = document.getElementById('user-display-name');
  if (img) {
    img.src = avatarUrl;
    img.style.display = avatarUrl ? 'block' : 'none';
  }
  if (nameEl) nameEl.textContent = displayName;
}

function showLogin(resolve: (r: LobbyResult) => void, clerkId: string, email: string, avatarUrl: string, displayName: string): void {
  setHeaderProfile(avatarUrl, displayName);
  const screen = document.getElementById('login-screen')!;
  screen.classList.remove('hidden');

  const input = document.getElementById('username-input') as HTMLInputElement;
  const btn = document.getElementById('login-btn')!;

  const submit = () => {
    const name = input.value.trim().slice(0, 16);
    if (!name) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      return;
    }
    localStorage.setItem(USERNAME_KEY, name);
    void saveUserToSupabase(clerkId, name, email);
    screen.classList.add('hidden');
    const lobbyScreen = document.getElementById('lobby-screen')!;
    lobbyScreen.classList.add('fade-in');
    showLobby(name, resolve, clerkId, email, avatarUrl, displayName);
  };

  btn.addEventListener('click', () => { playMenuClick(); submit(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 50);
}

function drawCenterStage(canvas: HTMLCanvasElement, char: ClassData): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  img.onload = () => {
    ctx.imageSmoothingEnabled = false;
    // Draw first frame of defaultTexture, scaled to fill the canvas
    const fw = char.frameWidth;
    const fh = char.frameHeight;
    const aspect = fh / fw;
    const destW = canvas.width;
    const destH = Math.min(canvas.height, Math.round(destW * aspect));
    const destY = Math.round((canvas.height - destH) / 2);
    ctx.drawImage(img, 0, 0, fw, fh, 0, destY, destW, destH);
  };
  img.src = `/characters/${char.defaultTexture}.png`;
}

function buildStatRow(label: string, filled: number, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'stat-row';
  const lbl = document.createElement('span');
  lbl.className = 'stat-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  const dots = document.createElement('span');
  dots.className = 'stat-dots';
  for (let i = 0; i < 5; i++) {
    const dot = document.createElement('span');
    dot.className = i < filled ? 'stat-dot filled' : 'stat-dot';
    dots.appendChild(dot);
  }
  row.appendChild(dots);
  const val = document.createElement('span');
  val.className = 'stat-value';
  val.textContent = value;
  row.appendChild(val);
  return row;
}

function buildLockerGrid(
  container: HTMLElement,
  selectedKey: string,
  onSelect: (char: ClassData) => void,
): void {
  // Clean up any running animation intervals from previous grid
  container.querySelectorAll('canvas').forEach(c => {
    const id = (c as any)._animInterval;
    if (id) clearInterval(id);
  });
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'locker-grid';

  for (const char of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'char-card';
    if (char.spriteKey === selectedKey) card.classList.add('selected');
    card.dataset.key = char.spriteKey;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const fw = char.frameWidth;
      const fh = char.frameHeight;
      const totalFrames = Math.floor(img.naturalWidth / fw);
      const aspect = fh / fw;
      const destW = canvas.width;
      const destH = Math.min(canvas.height, Math.round(destW * aspect));
      const destY = Math.round((canvas.height - destH) / 2);
      let frame = 0;
      const drawFrame = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, frame * fw, 0, fw, fh, 0, destY, destW, destH);
        frame = (frame + 1) % totalFrames;
      };
      drawFrame();
      const intervalId = setInterval(drawFrame, 180);
      // Store interval so we can clean up if grid is rebuilt
      (canvas as any)._animInterval = intervalId;
    };
    img.src = `/characters/${char.defaultTexture}.png`;

    const nameEl = document.createElement('div');
    nameEl.className = 'char-card-name';
    nameEl.textContent = char.name;

    const statsEl = document.createElement('div');
    statsEl.className = 'char-card-stats';
    statsEl.appendChild(buildStatRow('Speed', char.stars.speed, `${char.speed}`));
    statsEl.appendChild(buildStatRow('Health', char.stars.health, `${char.maxHp}`));
    statsEl.appendChild(buildStatRow('Damage', char.stars.damage, `${char.attackDamage}`));

    card.append(canvas, nameEl, statsEl);

    card.addEventListener('click', () => {
      playMenuClick();
      grid.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onSelect(char);
    });

    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function showLobby(username: string, resolve: (r: LobbyResult) => void, clerkId: string, _email: string, avatarUrl: string, displayName: string): void {
  const screen = document.getElementById('lobby-screen')!;
  const nameEl = document.getElementById('lobby-username')!;
  const avatarEl = document.getElementById('lobby-avatar')!;

  nameEl.textContent = username;
  avatarEl.textContent = username.slice(0, 2).toUpperCase();
  screen.classList.remove('hidden');

  // Show in-game username in the header (not the Clerk account name)
  setHeaderProfile(avatarUrl, username);

  // Fetch stats — populate both the small quick-glance row and the full stats panel
  void fetchPlayerStats(clerkId).then((stats) => {
    // Quick-glance row under character preview
    const statsEl = document.getElementById('lobby-stats');
    if (statsEl) {
      if (stats) {
        const kd = (stats.total_kills / Math.max(stats.total_deaths, 1)).toFixed(2);
        statsEl.innerHTML =
          `<span class="stat-item"><span class="stat-val">${stats.total_kills}</span><span class="stat-lbl">KILLS</span></span>` +
          `<span class="stat-item"><span class="stat-val">${stats.total_deaths}</span><span class="stat-lbl">DEATHS</span></span>` +
          `<span class="stat-item"><span class="stat-val">${kd}</span><span class="stat-lbl">K/D</span></span>` +
          `<span class="stat-item"><span class="stat-val">${stats.total_games}</span><span class="stat-lbl">GAMES</span></span>` +
          `<span class="stat-item"><span class="stat-val">${stats.total_wins}</span><span class="stat-lbl">WINS</span></span>`;
      } else {
        statsEl.innerHTML = '<span class="stat-lbl">Play a game to earn stats!</span>';
      }
    }
    // Full stats panel (populated when tab is clicked)
    renderStatsPanel(stats, username, avatarUrl);
  });

  // Change in-game name — clears stored nickname and reloads to name input
  const changeUserBtn = document.getElementById('change-user-btn')!;
  changeUserBtn.addEventListener('click', () => {
    playMenuClick();
    localStorage.removeItem(USERNAME_KEY);
    window.location.reload();
  });

  // Sign out of Clerk entirely
  const signOutBtn = document.getElementById('sign-out-btn')!;
  signOutBtn.addEventListener('click', () => {
    playMenuClick();
    localStorage.removeItem(USERNAME_KEY);
    const clerk = getClerk();
    if (clerk) {
      clerk.signOut().then(() => window.location.reload()).catch(() => window.location.reload());
    } else {
      window.location.reload();
    }
  });

  // ── Character selection ──
  const savedKey = localStorage.getItem(CHARACTER_KEY) ?? CHARACTERS[0].spriteKey;
  let classData: ClassData = CHARACTERS.find(c => c.spriteKey === savedKey) ?? CHARACTERS[0];

  const charPreview = document.getElementById('char-preview') as HTMLCanvasElement;
  const charNameLabel = document.getElementById('char-name-label')!;
  drawCenterStage(charPreview, classData);
  charNameLabel.textContent = classData.name.toUpperCase();

  // ── Nav tabs ──
  const navLobby = document.getElementById('nav-lobby')!;
  const navLocker = document.getElementById('nav-locker')!;
  const navStats = document.getElementById('nav-stats')!;
  const lobbyStage = document.getElementById('lobby-stage')!;
  const lockerPanel = document.getElementById('locker-panel')!;
  const statsPanel = document.getElementById('stats-panel')!;
  let lockerBuilt = false;

  const allTabs = [navLobby, navLocker, navStats];
  const allPanels = [lobbyStage, lockerPanel, statsPanel];

  const switchTab = (activeTab: HTMLElement, activePanel: HTMLElement) => {
    allTabs.forEach(t => t.classList.remove('active'));
    allPanels.forEach(p => p.classList.add('hidden'));
    activeTab.classList.add('active');
    activePanel.classList.remove('hidden');
  };

  navLobby.addEventListener('click', () => {
    playMenuClick();
    switchTab(navLobby, lobbyStage);
  });

  navLocker.addEventListener('click', () => {
    playMenuClick();
    switchTab(navLocker, lockerPanel);
    if (!lockerBuilt) {
      buildLockerGrid(lockerPanel, classData.spriteKey, (newChar) => {
        classData = newChar;
        localStorage.setItem(CHARACTER_KEY, classData.spriteKey);
        drawCenterStage(charPreview, classData);
        charNameLabel.textContent = classData.name.toUpperCase();
      });
      lockerBuilt = true;
    }
  });

  navStats.addEventListener('click', () => {
    playMenuClick();
    switchTab(navStats, statsPanel);
  });

  let mode: 'host' | 'join' = 'host';
  let isPrivate = false;
  let roomCode = '';
  let maxPlayers = 10;
  let gameMode = 'ffa';

  // Mode buttons
  const hostBtn = document.getElementById('host-btn')!;
  const joinBtn = document.getElementById('join-btn')!;
  const playBtn = document.getElementById('play-btn') as HTMLButtonElement;

  // Sub-option panels
  const hostOptions = document.getElementById('host-options')!;
  const joinOptions = document.getElementById('join-options')!;

  // Host sub-buttons
  const publicBtn = document.getElementById('public-btn')!;
  const privateBtn = document.getElementById('private-btn')!;

  // Join sub-buttons + input
  const randomBtn = document.getElementById('random-btn')!;
  const codeBtn = document.getElementById('code-btn')!;
  const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;

  // ── Mode switching ──
  hostBtn.addEventListener('click', () => {
    playMenuClick();
    mode = 'host';
    hostBtn.classList.add('active');
    joinBtn.classList.remove('active');
    hostOptions.classList.remove('hidden');
    joinOptions.classList.add('hidden');
    roomCode = '';
  });

  joinBtn.addEventListener('click', () => {
    playMenuClick();
    mode = 'join';
    joinBtn.classList.add('active');
    hostBtn.classList.remove('active');
    joinOptions.classList.remove('hidden');
    hostOptions.classList.add('hidden');
    isPrivate = false;
    roomCode = '';
    randomBtn.classList.add('active');
    codeBtn.classList.remove('active');
    roomCodeInput.classList.add('hidden');
    roomCodeInput.value = '';
  });

  // ── Host: public / private ──
  publicBtn.addEventListener('click', () => {
    playMenuClick();
    isPrivate = false;
    publicBtn.classList.add('active');
    privateBtn.classList.remove('active');
  });

  privateBtn.addEventListener('click', () => {
    playMenuClick();
    isPrivate = true;
    privateBtn.classList.add('active');
    publicBtn.classList.remove('active');
  });

  // ── Host: max players selector ──
  const mpBtns = [5, 10, 20, 30].map(n => document.getElementById(`mp-${n}`)!);
  mpBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playMenuClick();
      maxPlayers = Number(btn.id.replace('mp-', ''));
      mpBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Host: game mode selector ──
  const ffaBtn = document.getElementById('ffa-btn');
  const kcBtn = document.getElementById('kc-btn');
  if (ffaBtn && kcBtn) {
    ffaBtn.addEventListener('click', () => {
      playMenuClick();
      gameMode = 'ffa';
      ffaBtn.classList.add('active');
      kcBtn.classList.remove('active');
    });
    kcBtn.addEventListener('click', () => {
      playMenuClick();
      gameMode = 'killConfirmed';
      kcBtn.classList.add('active');
      ffaBtn.classList.remove('active');
    });
  }

  // ── Join status feedback ──
  const joinStatus = document.createElement('span');
  joinStatus.style.cssText = 'font-size:12px;font-weight:bold;letter-spacing:1px;min-width:130px;text-align:left;';
  joinOptions.appendChild(joinStatus);

  // ── Join: random / enter code ──
  randomBtn.addEventListener('click', () => {
    playMenuClick();
    roomCode = '';
    randomBtn.classList.add('active');
    codeBtn.classList.remove('active');
    roomCodeInput.classList.add('hidden');
    roomCodeInput.value = '';
    joinStatus.textContent = '';
    const roomBrowser = document.getElementById('room-browser');
    if (roomBrowser) roomBrowser.classList.add('hidden');
    const browseBtn = document.getElementById('browse-btn');
    if (browseBtn) browseBtn.classList.remove('active');
    if (browserInterval) { clearInterval(browserInterval); browserInterval = undefined; }
  });

  codeBtn.addEventListener('click', () => {
    playMenuClick();
    randomBtn.classList.remove('active');
    codeBtn.classList.add('active');
    roomCodeInput.classList.remove('hidden');
    roomCodeInput.focus();
    const roomBrowser = document.getElementById('room-browser');
    if (roomBrowser) roomBrowser.classList.add('hidden');
    if (browserInterval) { clearInterval(browserInterval); browserInterval = undefined; }
  });

  roomCodeInput.addEventListener('input', () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
    roomCode = roomCodeInput.value.trim();
    joinStatus.textContent = '';
  });

  // ── Browse rooms ──
  const browseBtn = document.getElementById('browse-btn');
  const roomBrowser = document.getElementById('room-browser');
  let browserInterval: number | undefined;

  async function refreshRoomBrowser() {
    const container = document.getElementById('room-browser');
    if (!container) return;
    try {
      const { getAvailableRooms } = await import('./network/Network');
      const rooms = await getAvailableRooms();
      const publicRooms = rooms.filter((r: any) => !r.metadata?.isPrivate);

      container.innerHTML = '';
      if (publicRooms.length === 0) {
        container.innerHTML = '<div class="no-rooms">No open rooms found</div>';
        return;
      }

      for (const rm of publicRooms) {
        const meta = rm.metadata || {};
        const modeLabel = meta.gameMode === 'killConfirmed' ? 'KILL CONFIRMED' : 'FREEPLAY';
        const code = meta.roomCode || rm.roomId;
        const players = `${rm.clients}/${rm.maxClients}`;
        const phase = meta.phase || 'waiting';
        const isPlaying = phase === 'playing';
        const statusLabel = isPlaying ? 'IN GAME' : 'OPEN';
        const statusClass = isPlaying ? 'in-game' : 'open';

        let timeDisplay = '';
        if (isPlaying && meta.timeRemaining != null) {
          const mins = Math.floor(meta.timeRemaining / 60);
          const secs = meta.timeRemaining % 60;
          timeDisplay = `${mins}:${String(secs).padStart(2, '0')}`;
        }

        const card = document.createElement('div');
        card.className = 'room-card';
        card.innerHTML = `
          <span class="room-mode">${modeLabel}</span>
          <span class="room-code">${code}</span>
          <span class="room-players">${players}</span>
          ${timeDisplay ? `<span class="room-time">${timeDisplay}</span>` : ''}
          <span class="room-status ${statusClass}">${statusLabel}</span>
        `;
        card.addEventListener('click', () => {
          (window as any).__browserRoomId = rm.roomId;
          (window as any).__browserRoomCode = code;
          container.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
        container.appendChild(card);
      }
    } catch (_err) {
      container.innerHTML = '<div class="no-rooms">Failed to load rooms</div>';
    }
  }

  if (browseBtn && roomBrowser) {
    browseBtn.addEventListener('click', () => {
      playMenuClick();
      roomCodeInput.classList.add('hidden');
      roomBrowser.classList.remove('hidden');

      document.querySelectorAll('#join-options .sub-btn').forEach(b => b.classList.remove('active'));
      browseBtn.classList.add('active');

      refreshRoomBrowser();
      if (browserInterval) clearInterval(browserInterval);
      browserInterval = window.setInterval(refreshRoomBrowser, 5000);
    });
  }

  // ── Play ──
  playBtn.addEventListener('click', async () => {
    playMenuClick();
    if (mode === 'join' && codeBtn.classList.contains('active') && !roomCode) {
      roomCodeInput.classList.add('shake');
      setTimeout(() => roomCodeInput.classList.remove('shake'), 400);
      roomCodeInput.focus();
      return;
    }

    const originalText = playBtn.textContent ?? '▶  PLAY';
    playBtn.disabled = true;
    playBtn.textContent = '...Searching';
    playBtn.style.color = '';

    const launchGame = async () => {
      if (browserInterval) { clearInterval(browserInterval); browserInterval = undefined; }
      playBtn.textContent = 'Game Found';
      playBtn.style.color = '#2ecc71';
      await delay(1000);
      screen.classList.add('hidden');
      document.getElementById('game-container')!.style.display = 'flex';
    };

    const resetBtn = () => {
      playBtn.disabled = false;
      playBtn.textContent = originalText;
      playBtn.style.color = '';
    };

    if (mode === 'host') {
      try {
        await createRoom(username, isPrivate, classData.spriteKey, maxPlayers, clerkId, gameMode);
        await launchGame();
        resolve({ username, clerkId, mode, isPrivate, roomCode, classData, gameMode });
      } catch (err) {
        console.error('[Campus Clash] createRoom failed:', err);
        playBtn.textContent = 'Connection Failed';
        playBtn.style.color = '#e63946';
        setTimeout(resetBtn, 2500);
      }
      return;
    }

    if (mode === 'join' && randomBtn.classList.contains('active')) {
      try {
        await joinAnyRoom(username, classData.spriteKey, clerkId);
        await launchGame();
        resolve({ username, clerkId, mode, isPrivate, roomCode, classData, gameMode });
      } catch (err) {
        console.error('[Campus Clash] joinAnyRoom failed:', err);
        joinStatus.textContent = 'No Rooms Available';
        joinStatus.style.color = '#e63946';
        setTimeout(() => { joinStatus.textContent = ''; }, 3000);
        resetBtn();
      }
      return;
    }

    // Join via room browser
    if ((window as any).__browserRoomId && browseBtn?.classList.contains('active')) {
      try {
        const { joinRoomById } = await import('./network/Network');
        await joinRoomById(
          (window as any).__browserRoomId,
          username,
          classData.spriteKey,
          clerkId,
        );
        if (browserInterval) { clearInterval(browserInterval); browserInterval = undefined; }
        (window as any).__browserRoomId = undefined;
        (window as any).__browserRoomCode = undefined;
        await launchGame();
        resolve({ username, clerkId, mode, isPrivate, roomCode, classData, gameMode });
      } catch (err) {
        console.error('[Campus Clash] joinRoomById failed:', err);
        joinStatus.textContent = 'Failed to Join';
        joinStatus.style.color = '#e63946';
        setTimeout(() => { joinStatus.textContent = ''; }, 3000);
        resetBtn();
      }
      return;
    }

    // Join by code — re-read input to ensure latest value, trimmed and uppercased
    roomCode = roomCodeInput.value.trim().toUpperCase();
    joinStatus.textContent = '';
    try {
      await joinRoom(roomCode, username, classData.spriteKey, clerkId);
      joinStatus.textContent = 'Game Found';
      joinStatus.style.color = '#2ecc71';
      await launchGame();
      resolve({ username, clerkId, mode, isPrivate, roomCode, classData, gameMode });
    } catch (err) {
      console.error('[Campus Clash] joinRoom failed:', err);
      joinStatus.textContent = 'Lobby Not Found';
      joinStatus.style.color = '#e63946';
      setTimeout(() => { joinStatus.textContent = ''; }, 3000);
      resetBtn();
    }
  });
}

function renderStatsPanel(stats: PlayerStats | null, username: string, avatarUrl: string): void {
  const container = document.getElementById('stats-panel-content');
  if (!container) return;

  if (!stats) {
    container.className = 'stats-empty';
    container.innerHTML =
      `<div class="stats-empty-icon">🎮</div>` +
      `<p class="stats-empty-msg">No stats yet.</p>` +
      `<p class="stats-empty-sub">Play your first game to start tracking!</p>`;
    return;
  }

  const kd = (stats.total_kills / Math.max(stats.total_deaths, 1)).toFixed(2);
  const winRate = stats.total_games > 0
    ? ((stats.total_wins / stats.total_games) * 100).toFixed(1)
    : '0.0';
  const avgKills = stats.total_games > 0
    ? (stats.total_kills / stats.total_games).toFixed(1)
    : '0.0';

  container.className = 'stats-grid';
  container.innerHTML = `
    <div class="stats-profile-row">
      ${avatarUrl ? `<img class="stats-avatar" src="${avatarUrl}" alt="avatar" />` : ''}
      <div class="stats-profile-name">${username.toUpperCase()}</div>
    </div>

    <div class="stats-divider"></div>

    <div class="stats-row-label">COMBAT</div>
    <div class="stats-cards">
      <div class="stats-card">
        <div class="stats-card-val">${stats.total_kills}</div>
        <div class="stats-card-lbl">TOTAL KILLS</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${stats.total_deaths}</div>
        <div class="stats-card-lbl">TOTAL DEATHS</div>
      </div>
      <div class="stats-card stats-card-highlight">
        <div class="stats-card-val">${kd}</div>
        <div class="stats-card-lbl">K / D RATIO</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${avgKills}</div>
        <div class="stats-card-lbl">AVG KILLS/GAME</div>
      </div>
    </div>

    <div class="stats-divider"></div>

    <div class="stats-row-label">OVERALL</div>
    <div class="stats-cards">
      <div class="stats-card">
        <div class="stats-card-val">${stats.total_games}</div>
        <div class="stats-card-lbl">GAMES PLAYED</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${stats.total_wins}</div>
        <div class="stats-card-lbl">WINS</div>
      </div>
      <div class="stats-card stats-card-highlight">
        <div class="stats-card-val">${winRate}%</div>
        <div class="stats-card-lbl">WIN RATE</div>
      </div>
    </div>
  `;
}
