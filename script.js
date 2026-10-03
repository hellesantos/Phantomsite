const STORAGE_KEY = 'nena-birthday-mission-v3';
const LEGACY_KEYS = ['nena-birthday-mission-v2', 'nena-birthday-mission'];

LEGACY_KEYS.forEach((key) => {
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
  }
});

const STORAGE_SESSION_KEY = 'nena-birthday-session-v1';
const HOST_PASSWORD_HASH = '6053a5dd93fa6248ae262a6d6be9fdd7924f40d08605f4b60fdac18f897ce59d';
const HOST_ACCOUNT = { name: 'helena', login: 'helena', role: 'host' };

const defaultState = {
  event: {
    target: 'Nena',
    date: '15/10/2026',
    time: '19:30',
    location: 'Pastelaria Gimenes',
    address: 'Pastelaria Gimenes'
  },
  rsvp: 'waiting',
  guestListVisible: false,
  user: {
    loggedIn: false,
    name: '',
    password: '',
    role: 'visitor',
    companion: 'no',
    companionCount: 0,
    observations: ''
  },
  guests: []
};

function isHostUser(name) {
  const normalized = (name || '').trim().toLowerCase();
  return normalized === 'helena' || normalized === 'hellena';
}

function getSessionData() {
  try {
    const raw = sessionStorage.getItem(STORAGE_SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hashValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return window.crypto && window.crypto.subtle
    ? window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((digest) => {
        return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      })
    : text;
}

function persistSession(user) {
  const payload = {
    loggedIn: Boolean(user.loggedIn),
    name: user.name || '',
    role: user.role || 'visitor'
  };
  sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(payload));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_SESSION_KEY);
}

function sanitizeGuestList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((guest) => guest && typeof guest === 'object' && guest.name && guest.name.trim());
}

const state = loadState();
const sessionSnapshot = getSessionData();
const sessionName = sessionSnapshot.name || state.user.name || '';
const guestIdentity = getGuestByLogin(sessionName.trim().toLowerCase());
state.user = {
  ...defaultState.user,
  ...state.user,
  loggedIn: Boolean(sessionSnapshot.loggedIn || state.user.loggedIn),
  name: sessionName,
  role: isHostUser(sessionName) ? 'host' : guestIdentity ? 'guest' : 'visitor'
};
state.user.password = '';
state.guests = sanitizeGuestList(state.guests);
state.guestListVisible = Boolean(state.guestListVisible);

if (state.user.loggedIn && !state.user.name) {
  state.user.loggedIn = false;
  state.user.role = 'visitor';
  clearSession();
}

const guestList = document.getElementById('guestList');
const adminGuestList = document.getElementById('adminGuestList');
const progressFill = document.getElementById('progressFill');
const confirmedCount = document.getElementById('confirmedCount');
const totalGuests = document.getElementById('totalGuests');
const missionStateText = document.getElementById('missionStateText');
const adminPanel = document.getElementById('adminPanel');
const toast = document.getElementById('toast');
const responseStatus = document.getElementById('responseStatus');

let bgmAudio = null;
let audioContext = null;
let bgmEnabled = false;

function loadState() {
  const persisted = localStorage.getItem(STORAGE_KEY);

  if (!persisted) {
    return JSON.parse(JSON.stringify(defaultState));
  }

  try {
    const parsed = JSON.parse(persisted);
    return {
      ...JSON.parse(JSON.stringify(defaultState)),
      ...parsed,
      event: { ...defaultState.event, ...(parsed.event || {}) },
      user: { ...defaultState.user, ...(parsed.user || {}) },
      guests: Array.isArray(parsed.guests) ? parsed.guests : defaultState.guests
    };
  } catch {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getStatusMeta(status) {
  const map = {
    host: { label: 'HOST', css: 'host' },
    waiting: { label: 'WAITING...', css: 'waiting' },
    done: { label: 'DONE', css: 'done' },
    declined: { label: 'DECLINED', css: 'declined' }
  };
  return map[status] || map.waiting;
}

function getGuestByLogin(login) {
  const normalized = String(login || '').trim().toLowerCase();
  if (!normalized) return null;

  return state.guests.find((guest) => String(guest.login || '').trim().toLowerCase() === normalized)
    || state.guests.find((guest) => String(guest.name || '').trim().toLowerCase() === normalized);
}

function verifyGuestCredentials(login, password) {
  const guest = getGuestByLogin(login);
  if (!guest || !guest.passwordHash) return false;

  return hashValue(password).then((hash) => hash === guest.passwordHash && typeof guest.passwordHash === 'string');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

async function verifyHostPassword(password) {
  if (!password || !window.crypto || !window.crypto.subtle) {
    return false;
  }

  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password.trim())
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return hex === HOST_PASSWORD_HASH;
}

function renderInfo() {
  const dateInput = document.getElementById('formDate');
  const timeInput = document.getElementById('formTime');
  const locationInput = document.getElementById('formLocation');
  const addressInput = document.getElementById('formAddress');
  const guestListVisibility = document.getElementById('guestListVisibility');

  if (dateInput) dateInput.value = state.event.date;
  if (timeInput) timeInput.value = state.event.time;
  if (locationInput) locationInput.value = state.event.location;
  if (addressInput) addressInput.value = state.event.address;
  if (guestListVisibility) guestListVisibility.value = state.guestListVisible ? 'on' : 'off';
}

function renderAccessCatalog() {
  const hostList = document.getElementById('hostAccessList');
  const hostAccessBox = document.querySelector('.host-access-box');

  if (hostList) {
    hostList.innerHTML = `
      <li class="access-item is-host">
        <span>HOST</span>
        <strong>HOST</strong>
        <em>ACCESS GRANTED</em>
      </li>
      <li class="access-item">
        <span>GUEST</span>
        <strong>GUEST</strong>
        <em>VIEW ONLY</em>
      </li>
    `;
  }

  if (hostAccessBox) {
    const isHost = isHostUser(state.user.name) && state.user.loggedIn;
    hostAccessBox.style.display = isHost ? 'block' : 'none';
  }
}

function getCurrentGuestRecord() {
  if (!state.user.loggedIn || isHostUser(state.user.name)) {
    return null;
  }

  const normalizedName = (state.user.name || '').trim().toLowerCase();
  return state.guests.find((guest) => {
    const guestName = String(guest.name || '').trim().toLowerCase();
    const guestLogin = String(guest.login || '').trim().toLowerCase();
    return guestName === normalizedName || guestLogin === normalizedName;
  }) || null;
}

function renderAccessForm() {
  const loginScreen = document.getElementById('loginScreen');
  const attendeeName = document.getElementById('attendeeName');
  const companionSelect = document.getElementById('companionSelect');
  const companionCount = document.getElementById('companionCount');
  const guestObservations = document.getElementById('guestObservations');
  const userChip = document.getElementById('userChip');
  const userNameChip = document.getElementById('userNameChip');
  const companionCountWrap = document.getElementById('companionCountWrap');
  const adminToggle = document.getElementById('toggleAdminBtn');
  const currentGuest = getCurrentGuestRecord();

  if (currentGuest && currentGuest.status === 'done') {
    state.rsvp = 'accept';
  } else if (currentGuest && currentGuest.status === 'declined') {
    state.rsvp = 'decline';
  } else if (state.user.loggedIn && !isHostUser(state.user.name)) {
    state.rsvp = 'waiting';
  }

  if (attendeeName) attendeeName.value = state.user.name || '';
  if (companionSelect) companionSelect.value = state.user.companion || 'no';
  if (companionCount) companionCount.value = state.user.companionCount || 0;
  if (guestObservations) guestObservations.value = state.user.observations || '';

  if (userChip && userNameChip) {
    userNameChip.textContent = state.user.name || 'GUEST';
    userChip.hidden = !state.user.loggedIn;
  }

  if (companionSelect && companionCountWrap) {
    companionCountWrap.classList.toggle('is-visible', companionSelect.value === 'yes');
  }

  if (adminPanel) {
    const isHost = Boolean(state.user.loggedIn) && isHostUser(state.user.name);
    const shouldShowAdminPanel = isHost && adminPanel.dataset.visible === 'true';

    adminPanel.classList.toggle('is-hidden-for-guest', Boolean(state.user.loggedIn) && !isHost);
    adminPanel.classList.toggle('is-visible', shouldShowAdminPanel);

    if (!state.user.loggedIn || !isHost) {
      adminPanel.dataset.visible = 'false';
    }
  }

  if (adminToggle) {
    const isHost = Boolean(state.user.loggedIn) && isHostUser(state.user.name);
    adminToggle.disabled = !isHost;
  }

  if (responseStatus) {
    if (!state.user.loggedIn) {
      responseStatus.innerHTML = '<span class="status-text">AWAITING RESPONSE</span>';
    } else if (isHostUser(state.user.name)) {
      responseStatus.innerHTML = '<span class="status-text">HOST ACCESS • EVENT CONTROL</span>';
    } else if (state.rsvp === 'accept') {
      responseStatus.innerHTML = '<span class="status-text">MISSION ACCEPTED ✓ CONFIRMATION RECEIVED</span>';
    } else if (state.rsvp === 'decline') {
      responseStatus.innerHTML = '<span class="status-text">MISSION DECLINED</span>';
    } else {
      responseStatus.innerHTML = '<span class="status-text">AWAITING RESPONSE</span>';
    }
  }

  const hostAccessBox = document.querySelector('.host-access-box');
  if (hostAccessBox) {
    hostAccessBox.style.display = isHostUser(state.user.name) && state.user.loggedIn ? 'block' : 'none';
  }

  if (loginScreen) {
    loginScreen.classList.toggle('is-hidden', state.user.loggedIn);
  }

  document.body.classList.toggle('is-logged-in', Boolean(state.user.loggedIn));
}

function renderProgress() {
  const total = state.guests.length;
  const confirmed = state.guests.filter((guest) => guest.status === 'done').length;
  const percent = total ? (confirmed / total) * 100 : 0;

  totalGuests.textContent = total;
  confirmedCount.textContent = confirmed;
  progressFill.style.width = `${percent}%`;

  if (confirmed === total && total > 0) {
    missionStateText.textContent = 'MISSION STATUS: MISSION COMPLETE';
    missionStateText.style.color = '#ffe16f';
  } else {
    missionStateText.textContent = 'MISSION STATUS: IN PROGRESS';
    missionStateText.style.color = '#d7d7d7';
  }
}

function renderGuestCards() {
  if (!guestList) return;

  guestList.innerHTML = '';

  const isAuthenticatedGuest = Boolean(state.user.loggedIn) && !isHostUser(state.user.name);
  const canViewGuestList = state.guestListVisible || isHostUser(state.user.name);

  if (!state.guests.length) {
    guestList.innerHTML = '<div class="empty-state">NO GUESTS REGISTERED</div>';
    return;
  }

  if (!canViewGuestList && isAuthenticatedGuest) {
    guestList.innerHTML = '<div class="empty-state">GUEST LIST HIDDEN BY HOST</div>';
    return;
  }

  state.guests.forEach((guest) => {
    const meta = getStatusMeta(guest.status);
    const card = document.createElement('article');
    card.className = `guest-card ${meta.css}`;
    card.style.setProperty('--tilt', `${guest.tilt || 0}deg`);

    const canModifyGuest = isHostUser(state.user.name) || (state.user.loggedIn && guest.name.toLowerCase() === (state.user.name || '').trim().toLowerCase());

    card.innerHTML = `
      <div class="guest-head">
        <h4 class="guest-name">${guest.name.toUpperCase()}</h4>
        <span class="guest-status">${meta.label}</span>
      </div>
      <div class="done-stamp">✓ DONE</div>
      <p class="guest-note">${guest.note || 'Sem observações.'}</p>
      <div class="guest-actions">
        <button type="button" data-action="done" data-id="${guest.id}" ${canModifyGuest ? '' : 'disabled'}>DONE</button>
        <button type="button" data-action="waiting" data-id="${guest.id}" ${canModifyGuest ? '' : 'disabled'}>WAIT</button>
        <button type="button" data-action="declined" data-id="${guest.id}" ${canModifyGuest ? '' : 'disabled'}>DECLINE</button>
      </div>
    `;

    guestList.appendChild(card);
  });
}

function renderAdminGuests() {
  if (!adminGuestList) return;

  adminGuestList.innerHTML = '';

  if (!state.guests.length) {
    adminGuestList.innerHTML = '<div class="empty-state">NO GUESTS REGISTERED</div>';
    return;
  }

  state.guests.forEach((guest) => {
    const item = document.createElement('div');
    item.className = 'admin-guest-item';
    item.innerHTML = `
      <strong>${guest.name.toUpperCase()}</strong>
      <small>LOGIN: ${guest.login || '—'}</small>
      <small>${getStatusMeta(guest.status).label}</small>
      <label>
        <span>STATUS</span>
        <select data-status-id="${guest.id}" ${isHostUser(state.user.name) ? '' : 'disabled'}>
          <option value="waiting" ${guest.status === 'waiting' ? 'selected' : ''}>WAITING...</option>
          <option value="done" ${guest.status === 'done' ? 'selected' : ''}>DONE</option>
          <option value="declined" ${guest.status === 'declined' ? 'selected' : ''}>DECLINED</option>
          <option value="host" ${guest.status === 'host' ? 'selected' : ''}>HOST</option>
        </select>
      </label>
      <label>
        <span>NOTE</span>
        <input type="text" value="${guest.note || ''}" data-note-id="${guest.id}" ${isHostUser(state.user.name) ? '' : 'disabled'} />
      </label>
      <div class="actions">
        <button type="button" data-delete-id="${guest.id}" ${isHostUser(state.user.name) ? '' : 'disabled'}>REMOVE</button>
      </div>
    `;
    adminGuestList.appendChild(item);
  });
}

function renderAll() {
  renderInfo();
  renderProgress();
  renderGuestCards();
  renderAdminGuests();
  renderAccessCatalog();
  renderAccessForm();
}

function isAllowedGuestStatusChange(targetGuest, actorName) {
  if (isHostUser(actorName)) return true;
  if (!actorName) return false;
  return String(targetGuest?.name || '').trim().toLowerCase() === String(actorName).trim().toLowerCase();
}

function updateGuestStatus(id, status) {
  const guest = state.guests.find((item) => item.id === Number(id));
  if (!guest) return;

  if (!isHostUser(state.user.name) && !isAllowedGuestStatusChange(guest, state.user.name)) {
    showToast('ACCESS DENIED');
    playSound('error');
    return;
  }

  guest.status = status;
  saveState();
  renderAll();

  if (status === 'done') {
    playSound('confirm');
    showToast('MISSION COMPLETE');
    animateDoneStamp();
  }
}

function removeGuest(id) {
  if (!isHostUser(state.user.name)) {
    showToast('ACCESS DENIED');
    playSound('error');
    return;
  }

  state.guests = state.guests.filter((item) => item.id !== Number(id));
  saveState();
  renderAll();
}

async function addGuest({ name, login, password, status, note }) {
  if (!isHostUser(state.user.name)) {
    showToast('HOST ONLY');
    playSound('error');
    return;
  }

  const trimmed = (name || '').trim();
  const trimmedLogin = (login || '').trim().toLowerCase();
  const trimmedPassword = (password || '').trim();
  if (!trimmed || !trimmedLogin || !trimmedPassword) {
    showToast('NAME, LOGIN AND PASSWORD REQUIRED');
    playSound('error');
    return;
  }

  if (state.guests.some((guest) => String(guest.login || '').trim().toLowerCase() === trimmedLogin)) {
    showToast('LOGIN ALREADY EXISTS');
    playSound('error');
    return;
  }

  const passwordHash = await hashValue(trimmedPassword);

  state.guests.push({
    id: Date.now(),
    name: trimmed,
    login: trimmedLogin,
    passwordHash,
    status,
    note: note.trim(),
    tilt: (Math.random() * 9 - 4.5).toFixed(1)
  });

  saveState();
  renderAll();
  showToast('GUEST ADDED');
}

function animateDoneStamp() {
  const doneStamp = document.querySelector('.done-stamp');
  if (!doneStamp) return;

  gsap.fromTo(doneStamp, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: 'back.out(1.8)' });
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function triggerTone(frequency, duration = 0.18, type = 'sine', volume = 0.05) {
  ensureAudioContext();
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.value = 0.0001;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  const now = audioContext.currentTime;
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);
}

function playSound(type) {
  const soundMap = {
    click: [740, 0.11, 'square', 0.03],
    confirm: [523.25, 0.18, 'triangle', 0.05],
    transition: [196, 0.26, 'sawtooth', 0.04],
    error: [220, 0.22, 'sawtooth', 0.04],
    mission: [392, 0.34, 'triangle', 0.06]
  };

  const preset = soundMap[type];
  if (!preset) return;

  const [frequency, duration, toneType, volume] = preset;
  triggerTone(frequency, duration, toneType, volume);
}

function setupBgm() {
  const button = document.getElementById('bgmToggle');
  const volumeValue = Number(document.getElementById('volumeControl')?.value || 0.6);

  if (bgmEnabled) {
    if (!audioContext) {
      ensureAudioContext();
    }

    if (!bgmAudio && audioContext) {
      const notes = [174.61, 196.0, 220.0, 261.63, 220.0, 196.0];
      let step = 0;
      bgmAudio = {
        timer: null,
        gain: audioContext.createGain(),
        notes
      };

      bgmAudio.gain.gain.value = volumeValue * 0.1;
      bgmAudio.gain.connect(audioContext.destination);

      bgmAudio.timer = setInterval(() => {
        const frequency = bgmAudio.notes[step % bgmAudio.notes.length];
        const oscA = audioContext.createOscillator();
        const oscB = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscA.type = 'triangle';
        oscB.type = 'sine';
        oscA.frequency.value = frequency;
        oscB.frequency.value = frequency / 2;
        gainNode.gain.value = 0.0001;

        oscA.connect(gainNode);
        oscB.connect(gainNode);
        gainNode.connect(bgmAudio.gain);

        const now = audioContext.currentTime;
        gainNode.gain.exponentialRampToValueAtTime(0.045, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

        oscA.start(now);
        oscB.start(now);
        oscA.stop(now + 0.9);
        oscB.stop(now + 0.9);

        step += 1;
      }, 420);
    }

    button.textContent = '♪ BGM OFF';
    return;
  }

  if (bgmAudio && bgmAudio.timer) {
    clearInterval(bgmAudio.timer);
    bgmAudio.timer = null;
  }

  button.textContent = '♪ BGM ON';
}

function handleMissionStart() {
  playSound('transition');
  const opening = document.getElementById('openingScreen');
  const mission = document.getElementById('missionScreen');

  const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' } });
  tl.to(opening, { duration: 0.5, autoAlpha: 0, x: -90, filter: 'blur(10px)' })
    .fromTo(mission, { autoAlpha: 0, y: 80, x: 30 }, { duration: 0.9, autoAlpha: 1, y: 0, x: 0 }, '-=0.25')
    .fromTo('.mission-copy h2, .mission-number, .mission-meta div', { autoAlpha: 0, x: 80 }, { autoAlpha: 1, x: 0, stagger: 0.12, duration: 0.6 }, '-=0.6');

  setTimeout(() => {
    opening.classList.add('hide');
    window.scrollTo({ top: mission.offsetTop - 20, behavior: 'smooth' });
  }, 400);
}

function bindEvents() {
  const acceptMissionBtn = document.getElementById('acceptMissionBtn');
  if (acceptMissionBtn) {
    acceptMissionBtn.addEventListener('click', () => {
      handleMissionStart();
      bgmEnabled = true;
      setupBgm();
    });
  }

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      playSound('click');
      item.classList.add('is-active');
    });

    item.addEventListener('click', () => {
      const target = document.getElementById(item.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  const toggleAdminBtn = document.getElementById('toggleAdminBtn');
  if (toggleAdminBtn) {
    toggleAdminBtn.addEventListener('click', () => {
      if (!isHostUser(state.user.name) || !state.user.loggedIn) {
        showToast('HOST ACCESS REQUIRED');
        playSound('error');
        return;
      }

      const nextVisible = !(adminPanel && adminPanel.classList.contains('is-visible'));
      if (adminPanel) {
        adminPanel.classList.toggle('is-visible', nextVisible);
        adminPanel.dataset.visible = String(nextVisible);
      }
      playSound('click');
    });
  }

  const openLocationBtn = document.getElementById('openLocationBtn');
  if (openLocationBtn) {
    openLocationBtn.addEventListener('click', () => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${state.event.location} ${state.event.address}`)}`;
      window.open(mapsUrl, '_blank', 'noopener');
      playSound('click');
    });
  }

  const eventForm = document.getElementById('eventForm');
  if (eventForm) {
    eventForm.addEventListener('input', (event) => {
      if (!isHostUser(state.user.name) || !state.user.loggedIn) {
        showToast('HOST ONLY');
        playSound('error');
        event.target.value = state.event[event.target.name] || '';
        return;
      }

      const { name, value } = event.target;
      if (name === 'date') state.event.date = value;
      if (name === 'time') state.event.time = value;
      if (name === 'location') state.event.location = value;
      if (name === 'address') state.event.address = value;
      saveState();
      renderInfo();
    });
  }

  const guestForm = document.getElementById('guestForm');
  if (guestForm) {
    guestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!isHostUser(state.user.name) || !state.user.loggedIn) {
        showToast('HOST ONLY');
        playSound('error');
        return;
      }

      const name = document.getElementById('guestNameInput').value;
      const login = document.getElementById('guestLoginInput').value;
      const password = document.getElementById('guestPasswordInput').value;
      const status = document.getElementById('guestStatusInput').value;
      const note = document.getElementById('guestNoteInput').value;
      await addGuest({ name, login, password, status, note });
      event.target.reset();
      playSound('confirm');
    });
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.getElementById('loginName').value.trim();
      const password = document.getElementById('loginPassword').value.trim();

      if (!input || !password) {
        showToast('DIGITE NOME E SENHA');
        return;
      }

      const normalizedInput = input.toLowerCase();
      const isHostLogin = normalizedInput === HOST_ACCOUNT.login;
      const isValidHost = isHostLogin && await verifyHostPassword(password);

      if (isValidHost) {
        state.user.loggedIn = true;
        state.user.name = HOST_ACCOUNT.name;
        state.user.password = '';
        state.user.role = 'host';
        persistSession(state.user);
        saveState();
        renderAll();
        showToast('ACESSO DE HOST');
        playSound('confirm');
        return;
      }

      const guestMatch = getGuestByLogin(normalizedInput);
      const isValidGuest = guestMatch && await verifyGuestCredentials(guestMatch.login, password);
      if (isValidGuest) {
        state.user.loggedIn = true;
        state.user.name = guestMatch.name;
        state.user.password = '';
        state.user.role = 'guest';
        persistSession(state.user);
        saveState();
        renderAll();
        showToast('ACESSO DE GUEST');
        playSound('confirm');
        return;
      }

      showToast('NOME OU SENHA INVÁLIDOS');
      playSound('error');
    });
  }

  const accessForm = document.getElementById('accessForm');
  if (accessForm) {
    accessForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const attendeeName = document.getElementById('attendeeName');
      const companionSelect = document.getElementById('companionSelect');
      const companionCount = document.getElementById('companionCount');
      const guestObservations = document.getElementById('guestObservations');

      state.user.name = attendeeName ? attendeeName.value.trim() || state.user.name : state.user.name;
      state.user.companion = companionSelect ? companionSelect.value : 'no';
      state.user.companionCount = Number(companionCount ? companionCount.value : 0);
      state.user.observations = guestObservations ? guestObservations.value.trim() : '';
      saveState();
      renderAccessForm();
      responseStatus.innerHTML = 
        `<span class="status-text">MISSION READY • ${state.user.name.toUpperCase()} • ${state.user.companion === 'yes' ? `${state.user.companionCount} COMPANIONS` : 'NO COMPANION'}</span>`;
      showToast('DADOS SALVOS');
      playSound('confirm');
    });
  }

  const companionSelect = document.getElementById('companionSelect');
  if (companionSelect) {
    companionSelect.addEventListener('change', () => {
      state.user.companion = companionSelect.value;
      if (companionSelect.value === 'no') {
        state.user.companionCount = 0;
        const companionCount = document.getElementById('companionCount');
        if (companionCount) companionCount.value = '0';
      }
      saveState();
      renderAccessForm();
    });
  }

  if (guestList) {
    guestList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      updateGuestStatus(button.dataset.id, button.dataset.action);
    });
  }

  if (adminGuestList) {
    adminGuestList.addEventListener('change', (event) => {
      const statusSetter = event.target.closest('[data-status-id]');
      if (statusSetter) {
        updateGuestStatus(statusSetter.dataset.statusId, statusSetter.value);
        return;
      }

      const noteInput = event.target.closest('[data-note-id]');
      if (noteInput) {
        const guest = state.guests.find((item) => item.id === Number(noteInput.dataset.noteId));
        if (!guest) return;
        guest.note = noteInput.value;
        saveState();
        renderAll();
      }
    });

    adminGuestList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-id]');
      if (!button) return;
      removeGuest(button.dataset.deleteId);
      playSound('error');
    });
  }

  document.querySelectorAll('.status-button').forEach((button) => {
    button.addEventListener('click', () => {
      const response = button.dataset.response;
      const isAccept = response === 'accept';

      if (!state.user.loggedIn) {
        showToast('LOGIN REQUIRED');
        playSound('error');
        return;
      }

      if (isHostUser(state.user.name)) {
        showToast('HOST ACCESS ONLY');
        playSound('error');
        return;
      }

      const currentGuest = getCurrentGuestRecord();
      if (currentGuest) {
        currentGuest.status = isAccept ? 'done' : 'declined';
      }

      state.rsvp = response;
      saveState();
      renderAll();
      responseStatus.innerHTML = isAccept
        ? '<span class="status-text">MISSION ACCEPTED ✓ CONFIRMATION RECEIVED</span>'
        : '<span class="status-text">MISSION DECLINED</span>';
      playSound(isAccept ? 'confirm' : 'error');
      showToast(isAccept ? 'MISSION ACCEPTED' : 'MISSION DECLINED');
    });
  });

  const bgmToggle = document.getElementById('bgmToggle');
  if (bgmToggle) {
    bgmToggle.addEventListener('click', () => {
      if (!isHostUser(state.user.name) || !state.user.loggedIn) {
        showToast('HOST ONLY');
        playSound('error');
        return;
      }

      bgmEnabled = !bgmEnabled;
      setupBgm();
      playSound('click');
    });
  }

  const guestListVisibility = document.getElementById('guestListVisibility');
  if (guestListVisibility) {
    guestListVisibility.addEventListener('change', (event) => {
      if (!isHostUser(state.user.name)) {
        showToast('HOST ONLY');
        playSound('error');
        guestListVisibility.value = state.guestListVisible ? 'on' : 'off';
        return;
      }

      state.guestListVisible = event.target.value === 'on';
      saveState();
      renderAll();
      showToast(state.guestListVisible ? 'GUEST LIST ON' : 'GUEST LIST OFF');
      playSound('click');
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (adminPanel) {
        adminPanel.dataset.visible = 'false';
        adminPanel.classList.remove('is-visible');
      }

      state.user = { ...defaultState.user, role: 'visitor' };
      clearSession();
      saveState();
      renderAll();
      showToast('LOGOUT');
      playSound('error');
    });
  }

  const volumeControl = document.getElementById('volumeControl');
  if (volumeControl) {
    volumeControl.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (bgmAudio && bgmAudio.gain) {
        bgmAudio.gain.gain.value = value * 0.1;
      }
    });
  }

  const cursor = document.querySelector('.cursor');
  if (cursor) {
    window.addEventListener('pointermove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });

    document.querySelectorAll('button, a, input, select, textarea').forEach((element) => {
      element.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      element.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });
  }
}

function initPersonaVisuals() {
  if (!window.gsap) return;

  const targets = gsap.utils.toArray([
    '.top-ui',
    '.mission-nav',
    '.opening-screen',
    '.mission-screen',
    '.calling-card',
    '.briefing',
    '.event-board',
    '.selector',
    '.guest-panel',
    '.rsvp',
    '.progress',
    '.admin-panel',
    '.final-screen'
  ]);

  gsap.fromTo(targets, {
    opacity: 0,
    y: 56,
    rotation: -4,
    scale: 0.96
  }, {
    opacity: 1,
    y: 0,
    rotation: 0,
    scale: 1,
    duration: 0.8,
    stagger: 0.08,
    ease: 'back.out(1.7)'
  });
}

bindEvents();
renderAll();
initPersonaVisuals();

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.style.scrollBehavior = 'auto';
}
