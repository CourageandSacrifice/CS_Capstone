import { CHARACTERS, ClassData } from './data/Classes';

const USERNAME_KEY = 'cc_username';
const CHARACTER_KEY = 'cc_character';

export interface LobbyResult {
  username: string;
  mode: 'host' | 'join';
  isPrivate: boolean;
  roomCode: string;
  classData: ClassData;
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

function drawCenterStage(canvas: HTMLCanvasElement, spriteKey: string): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  img.onload = () => {
    ctx.imageSmoothingEnabled = false;
    // col=1, row=0 → source x=16, y=0, 16×16 → dest 128×128 (8x)
    ctx.drawImage(img, 16, 0, 16, 16, 0, 0, 256, 256);
  };
  img.src = `/characters/${spriteKey}.png`;
}

function getCategory(char: ClassData): string {
  if (char.maxHp >= 150) return 'Guard';
  if (char.maxHp >= 120) return 'Warrior';
  return 'Citizen';
}

function buildLockerGrid(
  container: HTMLElement,
  selectedKey: string,
  onSelect: (char: ClassData) => void,
): void {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'locker-grid';

  for (const char of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'char-card';
    if (char.spriteKey === selectedKey) card.classList.add('selected');
    card.dataset.key = char.spriteKey;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 16, 0, 16, 16, 0, 0, 64, 64);
    };
    img.src = `/characters/${char.spriteKey}.png`;

    const nameEl = document.createElement('div');
    nameEl.className = 'char-card-name';
    nameEl.textContent = char.name;

    const catEl = document.createElement('div');
    catEl.className = 'char-card-cat';
    catEl.textContent = getCategory(char);

    card.append(canvas, nameEl, catEl);

    card.addEventListener('click', () => {
      grid.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      onSelect(char);
    });

    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function showLobby(username: string, resolve: (r: LobbyResult) => void): void {
  const screen = document.getElementById('lobby-screen')!;
  const nameEl = document.getElementById('lobby-username')!;
  const avatarEl = document.getElementById('lobby-avatar')!;

  nameEl.textContent = username;
  avatarEl.textContent = username.slice(0, 2).toUpperCase();
  screen.classList.remove('hidden');

  // ── Character selection ──
  const savedKey = localStorage.getItem(CHARACTER_KEY) ?? CHARACTERS[0].spriteKey;
  let classData: ClassData = CHARACTERS.find(c => c.spriteKey === savedKey) ?? CHARACTERS[0];

  const charPreview = document.getElementById('char-preview') as HTMLCanvasElement;
  const charNameLabel = document.getElementById('char-name-label')!;
  drawCenterStage(charPreview, classData.spriteKey);
  charNameLabel.textContent = classData.name.toUpperCase();

  // ── Nav tabs ──
  const navLobby = document.getElementById('nav-lobby')!;
  const navLocker = document.getElementById('nav-locker')!;
  const lobbyStage = document.getElementById('lobby-stage')!;
  const lockerPanel = document.getElementById('locker-panel')!;
  let lockerBuilt = false;

  navLobby.addEventListener('click', () => {
    navLobby.classList.add('active');
    navLocker.classList.remove('active');
    lobbyStage.classList.remove('hidden');
    lockerPanel.classList.add('hidden');
  });

  navLocker.addEventListener('click', () => {
    navLocker.classList.add('active');
    navLobby.classList.remove('active');
    lobbyStage.classList.add('hidden');
    lockerPanel.classList.remove('hidden');

    if (!lockerBuilt) {
      buildLockerGrid(lockerPanel, classData.spriteKey, (newChar) => {
        classData = newChar;
        localStorage.setItem(CHARACTER_KEY, classData.spriteKey);
        drawCenterStage(charPreview, classData.spriteKey);
        charNameLabel.textContent = classData.name.toUpperCase();
      });
      lockerBuilt = true;
    }
  });

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
    roomCode = roomCodeInput.value.trim();
  });

  // ── Play ──
  playBtn.addEventListener('click', () => {
    if (mode === 'join' && codeBtn.classList.contains('active') && !roomCode) {
      roomCodeInput.classList.add('shake');
      setTimeout(() => roomCodeInput.classList.remove('shake'), 400);
      roomCodeInput.focus();
      return;
    }

    screen.classList.add('hidden');
    const container = document.getElementById('game-container')!;
    container.style.display = 'flex';
    resolve({ username, mode, isPrivate, roomCode, classData });
  });
}
