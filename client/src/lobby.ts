import { CHARACTERS, ClassData } from './data/Classes';
import { createRoom, joinAnyRoom, joinRoom } from './network/Network';

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));


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
    const lobbyScreen = document.getElementById('lobby-screen')!;
    lobbyScreen.classList.add('fade-in');
    showLobby(name, resolve);
  };

  btn.addEventListener('click', submit);
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
    canvas.width = 192;
    canvas.height = 192;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const fw = char.frameWidth;
      const fh = char.frameHeight;
      const aspect = fh / fw;
      const destW = canvas.width;
      const destH = Math.min(canvas.height, Math.round(destW * aspect));
      const destY = Math.round((canvas.height - destH) / 2);
      ctx.drawImage(img, 0, 0, fw, fh, 0, destY, destW, destH);
    };
    img.src = `/characters/${char.defaultTexture}.png`;

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
  drawCenterStage(charPreview, classData);
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
        drawCenterStage(charPreview, classData);
        charNameLabel.textContent = classData.name.toUpperCase();
      });
      lockerBuilt = true;
    }
  });

  let mode: 'host' | 'join' = 'host';
  let isPrivate = false;
  let roomCode = '';
  let maxPlayers = 10;

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

  // ── Host: max players selector ──
  const mpBtns = [5, 10, 20, 30].map(n => document.getElementById(`mp-${n}`)!);
  mpBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      maxPlayers = Number(btn.id.replace('mp-', ''));
      mpBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Join status feedback ──
  const joinStatus = document.createElement('span');
  joinStatus.style.cssText = 'font-size:12px;font-weight:bold;letter-spacing:1px;min-width:130px;text-align:left;';
  joinOptions.appendChild(joinStatus);

  // ── Join: random / enter code ──
  randomBtn.addEventListener('click', () => {
    roomCode = '';
    randomBtn.classList.add('active');
    codeBtn.classList.remove('active');
    roomCodeInput.classList.add('hidden');
    roomCodeInput.value = '';
    joinStatus.textContent = '';
  });

  codeBtn.addEventListener('click', () => {
    randomBtn.classList.remove('active');
    codeBtn.classList.add('active');
    roomCodeInput.classList.remove('hidden');
    roomCodeInput.focus();
  });

  roomCodeInput.addEventListener('input', () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
    roomCode = roomCodeInput.value.trim();
    joinStatus.textContent = '';
  });

  // ── Play ──
  playBtn.addEventListener('click', async () => {
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
        await createRoom(username, isPrivate, classData.spriteKey, maxPlayers);
        await launchGame();
        resolve({ username, mode, isPrivate, roomCode, classData });
      } catch {
        resetBtn();
      }
      return;
    }

    if (mode === 'join' && randomBtn.classList.contains('active')) {
      try {
        await joinAnyRoom(username, classData.spriteKey);
        await launchGame();
        resolve({ username, mode, isPrivate, roomCode, classData });
      } catch {
        joinStatus.textContent = 'No Rooms Available';
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
      await joinRoom(roomCode, username, classData.spriteKey);
      joinStatus.textContent = 'Game Found';
      joinStatus.style.color = '#2ecc71';
      await launchGame();
      resolve({ username, mode, isPrivate, roomCode, classData });
    } catch {
      joinStatus.textContent = 'Lobby Not Found';
      joinStatus.style.color = '#e63946';
      setTimeout(() => { joinStatus.textContent = ''; }, 3000);
      resetBtn();
    }
  });
}
