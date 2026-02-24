const USERNAME_KEY = 'cc_username';

export interface LobbyResult {
  username: string;
  mode: 'host' | 'join';
  isPrivate: boolean;
  roomCode: string;
}

export function initLobby(): Promise<LobbyResult> {
  return new Promise((resolve) => {
    const stored = localStorage.getItem(USERNAME_KEY);
    if (stored) {
      showLobby(stored, resolve);
    } else {
      showLogin(resolve);
    }
  });
}

function showLogin(resolve: (r: LobbyResult) => void): void {
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
    screen.classList.add('hidden');
    showLobby(name, resolve);
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 50);
}

function showLobby(username: string, resolve: (r: LobbyResult) => void): void {
  const screen = document.getElementById('lobby-screen')!;
  const nameEl = document.getElementById('lobby-username')!;
  const avatarEl = document.getElementById('lobby-avatar')!;

  nameEl.textContent = username;
  avatarEl.textContent = username.slice(0, 2).toUpperCase();
  screen.classList.remove('hidden');

  let mode: 'host' | 'join' = 'host';
  let isPrivate = false;
  let roomCode = '';

  // Mode buttons
  const hostBtn = document.getElementById('host-btn')!;
  const joinBtn = document.getElementById('join-btn')!;
  const playBtn = document.getElementById('play-btn')!;

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
    mode = 'host';
    hostBtn.classList.add('active');
    joinBtn.classList.remove('active');
    hostOptions.classList.remove('hidden');
    joinOptions.classList.add('hidden');
    roomCode = '';
  });

  joinBtn.addEventListener('click', () => {
    mode = 'join';
    joinBtn.classList.add('active');
    hostBtn.classList.remove('active');
    joinOptions.classList.remove('hidden');
    hostOptions.classList.add('hidden');
    isPrivate = false;
    // Reset join sub-state
    roomCode = '';
    randomBtn.classList.add('active');
    codeBtn.classList.remove('active');
    roomCodeInput.classList.add('hidden');
    roomCodeInput.value = '';
  });

  // ── Host: public / private ──
  publicBtn.addEventListener('click', () => {
    isPrivate = false;
    publicBtn.classList.add('active');
    privateBtn.classList.remove('active');
  });

  privateBtn.addEventListener('click', () => {
    isPrivate = true;
    privateBtn.classList.add('active');
    publicBtn.classList.remove('active');
  });

  // ── Join: random / enter code ──
  randomBtn.addEventListener('click', () => {
    roomCode = '';
    randomBtn.classList.add('active');
    codeBtn.classList.remove('active');
    roomCodeInput.classList.add('hidden');
    roomCodeInput.value = '';
  });

  codeBtn.addEventListener('click', () => {
    randomBtn.classList.remove('active');
    codeBtn.classList.add('active');
    roomCodeInput.classList.remove('hidden');
    roomCodeInput.focus();
  });

  roomCodeInput.addEventListener('input', () => {
    roomCode = roomCodeInput.value.trim().toUpperCase();
  });

  // ── Play ──
  playBtn.addEventListener('click', () => {
    // Validate: if joining by code, must have a code
    if (mode === 'join' && codeBtn.classList.contains('active') && !roomCode) {
      roomCodeInput.classList.add('shake');
      setTimeout(() => roomCodeInput.classList.remove('shake'), 400);
      roomCodeInput.focus();
      return;
    }

    screen.classList.add('hidden');
    const container = document.getElementById('game-container')!;
    container.style.display = 'flex';
    resolve({ username, mode, isPrivate, roomCode });
  });
}
