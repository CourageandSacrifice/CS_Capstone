const USERNAME_KEY = 'cc_username';

export interface LobbyResult {
  username: string;
  mode: 'host' | 'join';
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

  const hostBtn = document.getElementById('host-btn')!;
  const joinBtn = document.getElementById('join-btn')!;
  const playBtn = document.getElementById('play-btn')!;

  hostBtn.addEventListener('click', () => {
    mode = 'host';
    hostBtn.classList.add('active');
    joinBtn.classList.remove('active');
  });

  joinBtn.addEventListener('click', () => {
    mode = 'join';
    joinBtn.classList.add('active');
    hostBtn.classList.remove('active');
  });

  playBtn.addEventListener('click', () => {
    screen.classList.add('hidden');
    const container = document.getElementById('game-container')!;
    container.style.display = 'flex';
    resolve({ username, mode });
  });
}
