// @ts-nocheck
/**
 * Punjab Esports User App Engine
 */

import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { getDatabase, ref, get, set, update, push, remove, onValue, off, query, orderByChild, equalTo, limitToLast, runTransaction } from "firebase/database";
import confetti from "canvas-confetti";

const firebaseConfig = {
  apiKey: "AIzaSyBmbL50TdxE1ZBSY0ukcsuGUXwOwZHUnaQ",
  authDomain: "rendom-cabff.firebaseapp.com",
  databaseURL: "https://rendom-cabff-default-rtdb.firebaseio.com",
  projectId: "rendom-cabff",
  storageBucket: "rendom-cabff.firebasestorage.app",
  messagingSenderId: "60567816892",
  appId: "1:60567816892:web:dbd6f7df1d21cb1a079eb9"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const State = {
  user: null, profile: null, wallet: { balance: 0, reserved: 0 },
  tournaments: [], myRegistrations: [], transactions: [], notifications: [], chatMessages: [],
  matchResultsCache: {}, settings: {}, currentPage: 'home', vipSettings: {},
  filters: { status: 'upcoming', mode: '', type: 'all', search: '' },
  listeners: [], lastNotifTs: 0,
  cleanupDays: 7, retentionMs: 7 * 24 * 60 * 60 * 1000,
  shownStartupNotification: false,
  localDeletedChats: JSON.parse(localStorage.getItem('deleted_chats') || '[]'),
  localDeletedTxs: JSON.parse(localStorage.getItem('deleted_txs') || '[]'),
  referrals: [],
  dmListener: null,
  myTeam: null, teamRole: null, myTeamInvites: [], teamWalletData: null,
  myTab: 'matches', lbTab: 'solo',
  allUsers: null, lbCache: { data: null, ts: 0 }
};

const TEAM_PASS_PRICE = 5;
const TEAM_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const VIP_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TEAM_PASS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const TEAM_MAX_MEMBERS = 4;

const DEFAULT_REFERRAL_MSG = `🎮 Join Punjab Esports & Win Real Cash!

Use my code: *{code}*
Get {signupBonus} signup bonus + I earn {referralBonus}!

Download: {downloadLink}

Play Free Fire tournaments, earn diamonds & withdraw to UPI! 💰`;

function isVipActive() {
  if (!State.profile || !State.profile.vipExpiry) return false;
  return Date.now() < State.profile.vipExpiry;
}

const $  = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWithinRetention = (ts) => { if (State.cleanupDays === 0) return false; return !ts || (Date.now() - ts) <= State.retentionMs; };
const fmtMoney = (rupees) => '₹' + (Number(rupees) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtDateTime = (ts) => { if (!ts) return '—'; const d = new Date(ts); if (isNaN(d.getTime())) return '—'; return d.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12: true }); };
const fmtTimeOnly = (ts) => { if (!ts) return ''; const d = new Date(ts); return d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: true }); };

function getAvatarHTML(photoUrl, emoji, name, sizeClass = 'member-avatar') {
  const photo = String(photoUrl || '').trim();
  // Profile photos can be stored as a data URL or a Firebase Storage/HTTPS URL.
  if (photo && (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(photo) || /^https:\/\//i.test(photo))) {
    return `<img src="${esc(photo)}" alt="${esc(name || 'Player')}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`;
  }
  if (emoji) return `<span style="font-size:1.2rem;line-height:1">${esc(emoji)}</span>`;
  return esc((name||'P').charAt(0).toUpperCase());
}

function formatTime12h(timeStr) { if (!timeStr) return '—'; const parts = String(timeStr).split(':'); const hh = Number(parts[0]); const mm = Number(parts[1] || 0); if (isNaN(hh)) return timeStr; const period = hh >= 12 ? 'PM' : 'AM'; const h12 = hh % 12 || 12; return `${h12}:${String(mm).padStart(2,'0')} ${period}`; }
function formatMatchDateTime(dateStr, timeStr) { if (!dateStr) return 'TBD'; try { const d = new Date(dateStr + 'T' + (timeStr || '00:00')); if (isNaN(d.getTime())) return `${dateStr} · ${formatTime12h(timeStr)}`; const datePart = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); const timePart = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: true }); return `${datePart} · ${timePart}`; } catch(e) { return `${dateStr} · ${formatTime12h(timeStr)}`; } }
function fmtRelativeTime(ts) { if (!ts) return ''; const diff = Date.now() - ts; const s = Math.floor(diff / 1000); if (s < 60) return 'Just now'; const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`; const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`; const d = Math.floor(h / 24); if (d < 7) return `${d} day${d>1?'s':''} ago`; return fmtDate(ts); }

let audioCtx = null; let audioUnlocked = false;
function getAudioCtx() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; } } if (audioCtx.state === 'suspended') { audioCtx.resume().catch(()=>{}); } return audioCtx; }
function unlockAudio() { const ctx = getAudioCtx(); if (!ctx || audioUnlocked) return; try { const buf = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0); audioUnlocked = true; } catch(e) {} }
['click','touchstart','touchend','keydown','pointerdown'].forEach(ev => { document.addEventListener(ev, unlockAudio, { once: false, passive: true }); });
function playNotifSound() { const ctx = getAudioCtx(); if (!ctx) return; try { const now = ctx.currentTime; const notes = [ { f: 783.99, t: 0.00, d: 0.35, v: 0.22 }, { f: 987.77, t: 0.16, d: 0.40, v: 0.24 }, { f: 1318.51, t: 0.34, d: 0.85, v: 0.20 } ]; const master = ctx.createGain(); master.gain.setValueAtTime(0.85, now); master.connect(ctx.destination); notes.forEach(n => { const osc1 = ctx.createOscillator(); const g1 = ctx.createGain(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(n.f, now + n.t); osc1.frequency.exponentialRampToValueAtTime(n.f * 0.995, now + n.t + n.d); g1.gain.setValueAtTime(0.0001, now + n.t); g1.gain.exponentialRampToValueAtTime(n.v, now + n.t + 0.018); g1.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d); osc1.connect(g1); g1.connect(master); osc1.start(now + n.t); osc1.stop(now + n.t + n.d + 0.08); }); if (navigator.vibrate) { try { navigator.vibrate([90, 50, 90]); } catch(e) {} } } catch(e) {} }

// Soft UI click sound. Preference is saved locally on this device.
function isClickSoundEnabled() {
  try { return localStorage.getItem('pe_click_sound') !== 'off'; } catch(e) { return true; }
}
function playClickSound() {
  if (!isClickSoundEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.055);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.07);
  } catch(e) {}
}
// One delegated listener covers dynamically-created modal buttons as well.
document.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (button && !button.disabled && button.id !== 'clickSoundToggle') playClickSound();
}, true);

async function copyTextToClipboard(value) {
  const text = String(value ?? '');
  if (!text) {
    toast('error', 'Nothing to copy', 'This value is empty.');
    return false;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      field.style.pointerEvents = 'none';
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('Clipboard access was blocked');
    }
    toast('success', 'Copied', text);
    return true;
  } catch (err) {
    toast('error', 'Copy failed', 'Your browser or app blocked clipboard access. Please allow clipboard permission and try again.');
    return false;
  }
}

function toast(type, title, msg, timeout=4000) {
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success:'fa-circle-check', error:'fa-circle-exclamation', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info} t-icon"></i><div class="t-body"><div class="t-title">${esc(title)}</div>${msg?`<div class="t-msg">${esc(msg)}</div>`:''}</div><button class="t-close"><i class="fa-solid fa-xmark"></i></button>`;
  host.appendChild(el);
  const close = () => { el.style.opacity = '0'; setTimeout(()=>el.remove(), 220); };
  el.querySelector('.t-close').onclick = close;
  setTimeout(close, timeout);
}

function openModal({ title, bodyHTML, footerHTML, onMount=null, extraClass='' }) {
  const wrap = document.createElement('div');
  wrap.className = 'mb ' + extraClass;
  wrap.innerHTML = `<div class="modal" role="dialog"><div class="mh"><h3>${title}</h3><button class="close-x"><i class="fa-solid fa-xmark"></i></button></div><div class="mbody">${bodyHTML}</div>${footerHTML?`<div class="mfoot">${footerHTML}</div>`:''}</div>`;
  $('#modalHost').appendChild(wrap);
  const close = () => { 
    wrap.remove(); 
    document.removeEventListener('keydown', escFn); 
    if (extraClass === 'dm-modal' && State.dmListener) { State.dmListener(); State.dmListener = null; }
  };
  wrap.querySelector('.close-x').onclick = close;
  wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
  const escFn = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escFn);
  if (onMount) onMount(wrap, close);
  return { el: wrap, close };
}

function confirmDialog(title, message, danger=false) {
  return new Promise(resolve => {
    openModal({
      title, bodyHTML: `<p>${esc(message)}</p>`,
      footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn ${danger?'btn-danger':'btn-primary'}" data-x="ok">Confirm</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-x="c"]').onclick = () => { close(); resolve(false); };
        el.querySelector('[data-x="ok"]').onclick = () => { close(); resolve(true); };
      }
    });
  });
}

const THEME_DEFS = [
  { id:'gold',   name:'Royal Gold',  dots:['#0a0803','#d4af37','#f0cf6b'] },
  { id:'amoled', name:'AMOLED', dots:['#000','#8b5cf6','#22c55e'] },
  { id:'cyber',  name:'Cyber Blue',  dots:['#04070f','#00a3ff','#38bdf8'] },
  { id:'fire',   name:'Fire Red',    dots:['#0f0504','#ff4d2e','#fbbf24'] },
  { id:'neon',   name:'Neon Purple', dots:['#06010d','#c026d3','#e879f9'] },
  { id:'emerald',name:'Emerald',     dots:['#020c08','#10b981','#34d399'] },
  { id:'ocean',  name:'Ocean Glass', dots:['#02121c','#06b6d4','#67e8f9'] },
  { id:'light',  name:'Pure Light',  dots:['#f4f5f9','#6d28d9','#7c3aed'] }
];

let themeState = { mode: 'user', globalTheme: 'gold', default: 'gold', enabled: {}, userTheme: null, darkMode: true };

function applyTheme(id) {
  if (!THEME_DEFS.find(t => t.id === id)) id = 'gold';
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem('pe_theme', id); } catch(e) {}
}

function applyBgMode(isDark) {
  document.documentElement.setAttribute('data-bg', isDark ? 'dark' : 'light');
  try { localStorage.setItem('pe_bg', isDark ? 'dark' : 'light'); } catch(e) {}
  
  const toggle = $('#darkModeToggle');
  const knob = $('#darkModeKnob');
  if (toggle && knob) {
    if (isDark) {
      knob.style.left = '24px';
      knob.style.background = 'var(--ac)';
      toggle.style.background = 'var(--sf2)';
    } else {
      knob.style.left = '2px';
      knob.style.background = 'var(--txm)';
      toggle.style.background = 'var(--sf3)';
    }
  }
  
  const meta = document.getElementById('appThemeColor') || document.querySelector('meta[name="theme-color"]');
  const color = isDark ? '#000000' : '#ffffff';
  if (meta) meta.setAttribute('content', color);
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;

  const navEl = document.querySelector('.bottom-nav'); if (navEl) navEl.style.backgroundColor = color;
  const tbEl = document.querySelector('.topbar'); if (tbEl) tbEl.style.backgroundColor = color;
  if (window.AndroidInterface && typeof window.AndroidInterface.updateSystemBars === 'function') {
    try { window.AndroidInterface.updateSystemBars(isDark, color); } catch(e) {}
  }
}

let __initialTheme = 'gold';
let __initialBg = 'dark';
try { 
  __initialTheme = localStorage.getItem('pe_theme') || 'gold'; 
  __initialBg = localStorage.getItem('pe_bg') || 'dark';
} catch(e) {}
applyTheme(__initialTheme);
applyBgMode(__initialBg === 'dark');

function computeActiveTheme() { if (themeState.mode === 'global') return themeState.globalTheme || themeState.default || 'gold'; const userPick = themeState.userTheme; if (userPick && THEME_DEFS.find(t => t.id === userPick)) { if (themeState.enabled[userPick] !== false) return userPick; } return themeState.default || 'gold'; }
function refreshTheme() { applyTheme(computeActiveTheme()); }
async function loadThemeSettings() { try { const snap = await get(ref(db, 'themeSettings')); const cfg = snap.exists() ? snap.val() : {}; themeState.mode = cfg.mode || 'user'; themeState.globalTheme = cfg.globalTheme || 'gold'; themeState.default = cfg.default || 'gold'; themeState.enabled = cfg.enabled || {}; } catch (e) {} }
async function loadUserTheme() { if (!State.user) { refreshTheme(); return; } try { const snap = await get(ref(db, 'users/' + State.user.uid + '/theme')); if (snap.exists()) themeState.userTheme = snap.val(); } catch (e) {} refreshTheme(); }

const splashEl = $('#splash');
function hideSplash() { if (splashEl) { splashEl.classList.add('hide'); setTimeout(() => { splashEl.style.display = 'none'; }, 400); } }
function showSplash() { if (splashEl) { splashEl.style.display = 'grid'; splashEl.classList.remove('hide'); } }
setTimeout(() => { if (splashEl && !splashEl.classList.contains('hide')) hideSplash(); }, 10000);

$$('.auth-tab').forEach(t => t.onclick = () => {
  $$('.auth-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const isLogin = t.dataset.tab === 'login';
  $('#loginForm').hidden = !isLogin;
  $('#registerForm').hidden = isLogin;
  $('#authAlert').innerHTML = '';
});

$('#loginPassToggle').onclick = () => { const p = $('#loginPass'); const show = p.type==='password'; p.type = show ? 'text' : 'password'; $('#loginPassToggle').querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'; };
$('#regPassToggle').onclick = () => { const p = $('#regPass'); const show = p.type==='password'; p.type = show ? 'text' : 'password'; $('#regPassToggle').querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'; };

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#errLoginEmail').textContent = ''; $('#errLoginPass').textContent = ''; $('#authAlert').innerHTML = '';
  const email = $('#loginEmail').value.trim(); const pass = $('#loginPass').value;
  let ok = true;
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#errLoginEmail').textContent = 'Enter a valid email'; ok=false; }
  if (pass.length < 6) { $('#errLoginPass').textContent = 'Min 6 characters'; ok=false; }
  if (!ok) return;
  const btn = $('#loginBtn'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i> Signing in…';
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (err) { $('#authAlert').innerHTML = `<div class="alert error"><i class="fa-solid fa-circle-exclamation"></i><span>${esc(mapAuthError(err))}</span></div>`; }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'; }
};

$('#registerForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#authAlert').innerHTML = '';
  ['errRegName','errRegEmail','errRegFfUid','errRegPass'].forEach(id => $('#'+id).textContent='');
  const name = $('#regName').value.trim(); 
  const email = $('#regEmail').value.trim(); 
  const ffUid = $('#regFfUid').value.trim(); 
  const pass = $('#regPass').value; 
  const terms = $('#regTerms').checked;
  const refCodeInput = $('#regRefCode').value.trim().toUpperCase();
  
  let ok = true;
  if (name.length < 2) { $('#errRegName').textContent = 'Name too short'; ok=false; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#errRegEmail').textContent = 'Invalid email'; ok=false; }
  if (!/^\d{6,15}$/.test(ffUid)) { $('#errRegFfUid').textContent = '6-15 digits'; ok=false; }
  if (pass.length < 6) { $('#errRegPass').textContent = 'Min 6 characters'; ok=false; }
  if (!terms) { toast('warning','Terms Required',''); ok=false; }
  if (!ok) return;

  const btn = $('#registerBtn'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i> Creating…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    try { await updateProfile(cred.user, { displayName: name }); } catch {}
    const now = Date.now();
    const refCode = 'PE' + uid.slice(0,5).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
    
    let startingBalance = 0;
    let referredByUid = null;

    if (refCodeInput) {
      try {
        const rSnap = await get(query(ref(db, 'users'), orderByChild('referralCode'), equalTo(refCodeInput)));
        if (rSnap.exists()) {
           rSnap.forEach(c => { 
             const u = c.val(); 
             if (u.referralCode === refCodeInput && c.key !== uid) { referredByUid = c.key; } 
           });
        }
      } catch(e) { console.log("Referral query error", e); }
    }

    let signupBonus = 2, refBonus = 2;
    try {
      const rSet = await get(ref(db, 'appSettings/referralLinks'));
      if (rSet.exists()) {
        const rv = rSet.val();
        signupBonus = Number(rv.signupBonus) || 2;
        refBonus = Number(rv.referralBonus) || 2;
      }
    } catch(e){}

    if (referredByUid) startingBalance = signupBonus;

    await set(ref(db, 'users/' + uid), { uid, displayName: name, email, freeFireUid: ffUid, status: 'active', referralCode: refCode, referredBy: referredByUid || null, createdAt: now, updatedAt: now, photoUrl: '', balance: startingBalance, coins: 0, diamonds: 0, hasUsedTeamTrial: false });
    await set(ref(db, 'wallets/' + uid), { balance: startingBalance, reserved: 0, updatedAt: now });
    await set(ref(db, 'publicProfiles/' + uid), { uid, displayName: name, photoUrl: '', freeFireUid: ffUid, createdAt: now });
    
    if (referredByUid) {
      if (startingBalance > 0) {
         const txRef = push(ref(db, 'walletTransactions'));
         await set(txRef, { id: txRef.key, userId: uid, type: 'referral_bonus', amount: startingBalance, status: 'completed', createdAt: now });
      }
      
      const refRef = push(ref(db, 'referrals'));
      await set(refRef, { id: refRef.key, referrerId: referredByUid, referredId: uid, status: 'credited', rewardAmount: refBonus, createdAt: now });
      
      const refWalletT = await get(ref(db, 'wallets/' + referredByUid + '/balance'));
      await set(ref(db, 'wallets/' + referredByUid + '/balance'), (Number(refWalletT.val()) || 0) + refBonus);
      
      const refTx = push(ref(db, 'walletTransactions'));
      await set(refTx, { id: refTx.key, userId: referredByUid, type: 'referral', amount: refBonus, relatedId: uid, status: 'completed', createdAt: now });
      
      const notif = push(ref(db, 'notifications/' + referredByUid));
      await set(notif, { id: notif.key, type: 'reward', title: '🎉 Referral Bonus!', body: `You earned ₹${refBonus} because ${name} joined using your code.`, read: false, createdAt: now });
    }

    toast('success','Welcome!','');
  } catch (err) { $('#authAlert').innerHTML = `<div class="alert error"><i class="fa-solid fa-circle-exclamation"></i><span>${esc(mapAuthError(err))}</span></div>`; }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account'; }
};

$('#forgotLink').onclick = async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast('warning','Enter Email',''); return; }
  try { await sendPasswordResetEmail(auth, email); toast('success','Reset Email Sent',''); }
  catch (err) { toast('error','Failed',mapAuthError(err)); }
};

function mapAuthError(err) {
  const c = err?.code || '';
  if (c.includes('email-already-in-use')) return 'Email already registered.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Invalid email or password.';
  if (c.includes('weak-password')) return 'Password too weak.';
  if (c.includes('invalid-email')) return 'Invalid email.';
  if (c.includes('too-many-requests')) return 'Too many attempts.';
  if (c.includes('network')) return 'Network error.';
  return err?.message || 'Something went wrong.';
}

onAuthStateChanged(auth, async (user) => {
  detachAll();
  if (!user) {
    State.user = null; State.profile = null;
    $('#appShell').classList.remove('active');
    $('#authScreen').style.display = 'grid';
    hideSplash();
    return;
  }
  const snap = await get(ref(db, 'users/' + user.uid)).catch(() => null);
  if (!snap || !snap.exists()) {
    const now = Date.now();
    await set(ref(db, 'users/' + user.uid), { uid: user.uid, displayName: user.displayName || 'Player', email: user.email || '', freeFireUid: '', status: 'active', createdAt: now, updatedAt: now, referralCode: 'PE' + user.uid.slice(0,5).toUpperCase(), diamonds: 0, hasUsedTeamTrial: false });
    await set(ref(db, 'wallets/' + user.uid), { balance: 0, reserved: 0, updatedAt: now });
    State.profile = (await get(ref(db, 'users/' + user.uid))).val();
  } else { State.profile = snap.val(); }

  if (State.profile.status === 'suspended' || State.profile.status === 'banned') {
    await signOut(auth);
    $('#authAlert').innerHTML = `<div class="alert error"><i class="fa-solid fa-ban"></i><span>Your account is ${esc(State.profile.status)}. Contact support.</span></div>`;
    hideSplash();
    return;
  }
  
  State.user = user;

  // One-time 7-day VIP welcome trial. The transaction prevents repeat claims
  // across logins/devices for the same Firebase account UID.
  try {
    const vipTrialRef = ref(db, 'users/' + user.uid);
    const vipTrialResult = await runTransaction(vipTrialRef, (current) => {
      if (!current) return current;
      if (current.hasUsedVipTrial || Number(current.vipExpiry || 0) > 0) return current;
      return { ...current, hasUsedVipTrial: true, vipExpiry: Date.now() + VIP_TRIAL_DURATION_MS };
    });
    if (vipTrialResult.committed && vipTrialResult.snapshot.exists()) {
      State.profile = vipTrialResult.snapshot.val();
      if (State.profile.hasUsedVipTrial && Number(State.profile.vipExpiry || 0) > Date.now() && !snap?.val()?.hasUsedVipTrial && !Number(snap?.val()?.vipExpiry || 0)) {
        toast('success', '7-Day Free VIP Activated!', 'Your welcome VIP trial is now active.');
      }
    }
  } catch (vipTrialError) {
    console.warn('VIP trial activation failed:', vipTrialError);
  }

  $('#authScreen').style.display = 'none';
  
  splashEl.style.display = 'grid';
  splashEl.classList.remove('hide');

  await loadThemeSettings();
  await loadUserTheme();
  
  const activeTheme = computeActiveTheme();
  applyTheme(activeTheme);
  try { localStorage.setItem('pe_theme', activeTheme); } catch(e) {}
  
  $('#appShell').classList.add('active');
  
  initApp();
  
  setTimeout(() => hideSplash(), 200);
});

function trackListener(r, cb) { onValue(r, cb, (e) => console.warn('listen err', e)); State.listeners.push({ ref: r, cb }); }
function detachAll() { State.listeners.forEach(({ ref, cb }) => { try { off(ref,'value',cb); } catch {} }); State.listeners = []; if(State.dmListener){State.dmListener();State.dmListener=null;} }

async function initApp() {
  updateGreeting();
  await loadCleanupSettings();
  await loadVipSettings();
  await loadReferralSettings();
  loadProfileUI();
  await loadChannels();
  attachListeners();
  navigate('home');
  initSpinWheel();
  
  setTimeout(() => {
    if (State.notifications && State.notifications.some(n => !n.read)) {
      playNotifSound();
      openNotifications();
    }
  }, 2500);
}

async function loadVipSettings() {
  try {
    const snap = await get(ref(db, 'vipSettings'));
    if (snap.exists()) State.vipSettings = snap.val();
    else State.vipSettings = {
      plans: {
        p1: { days: 1, rupees: 10, diamonds: 100 },
        p7: { days: 7, rupees: 49, diamonds: 500 },
        p15: { days: 15, rupees: 99, diamonds: 1000 },
        p30: { days: 30, rupees: 149, diamonds: 1800 }
      }
    };
  } catch(e) {}
}

async function loadReferralSettings() {
  try {
    const snap = await get(ref(db, 'appSettings/referralLinks'));
    if (snap.exists()) State.referralSettings = snap.val();
  } catch(e) {}
  if (State.user) {
    try {
      const rSnap = await get(query(ref(db, 'referrals'), orderByChild('referrerId'), equalTo(State.user.uid)));
      const arr = [];
      rSnap.forEach(c => { const v = c.val(); if (isObj(v) && isWithinRetention(v.createdAt)) { v.id = c.key; arr.push(v); } });
      State.referrals = arr;
    } catch(e) {}
  }
}

async function loadCleanupSettings() {
  try {
    const snap = await get(ref(db, 'appSettings/cleanup'));
    if (snap.exists()) {
      const c = snap.val();
      State.cleanupDays = typeof c.days !== 'undefined' ? Number(c.days) : 7;
      State.retentionMs = State.cleanupDays * 24 * 60 * 60 * 1000;
    }
  } catch(e) {}
}

function updateGreeting() {
  const n = State.profile?.displayName || 'Player';
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#userGreeting').innerHTML = `${greet}, ${n} <span id="topBlueTick"></span>`;
  
  if (isVipActive()) {
    $('#topBlueTick').innerHTML = '<i class="fa-solid fa-circle-check blue-tick"></i>';
    if($('#profBlueTick')) $('#profBlueTick').innerHTML = '<i class="fa-solid fa-circle-check blue-tick"></i>';
  } else {
    $('#topBlueTick').innerHTML = '';
    if($('#profBlueTick')) $('#profBlueTick').innerHTML = '';
  }
}

function loadProfileUI() {
  const p = State.profile || {};
  $('#profileName').innerHTML = `${p.displayName || 'Player'} <span id="profBlueTick"></span>`;
  $('#profileEmail').textContent = p.email || '';
  $('#profileFfUid').textContent = p.freeFireUid || 'Set FF UID';
  $('#profileJoined').textContent = fmtDate(p.createdAt);
  $('#refCode').textContent = p.referralCode || '—';
  
  const av = $('#profileAvatar');
  if (p.photoUrl && p.photoUrl.startsWith('data:image')) {
    av.innerHTML = `<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover;">`;
  } else if (p.profileEmoji) {
    av.innerHTML = `<span style="font-size:2.2rem; line-height:1;">${p.profileEmoji}</span>`;
    av.style.background = 'linear-gradient(135deg,var(--sf3),var(--sf2))'; 
  } else {
    av.textContent = (p.displayName || 'P').charAt(0).toUpperCase();
    av.style.background = 'linear-gradient(135deg,var(--ac),var(--ac2))';
  }
  
  const diamonds = Number(p.diamonds || 0);
  const walletD = $('#walletDiamonds'); if (walletD) walletD.textContent = diamonds.toLocaleString('en-IN');

  const homeBuyVipBtn = $('#homeBuyVipBtn');
  const vipExpiryText = $('#vipExpiryText');
  const vipCardSubText = $('#vipCardSubText');
  
  if (homeBuyVipBtn && vipExpiryText) {
    if (isVipActive()) {
      homeBuyVipBtn.innerHTML = '<i class="fa-solid fa-crown"></i> Extend VIP';
      homeBuyVipBtn.style.display = 'flex'; 
      vipExpiryText.style.display = 'block';
      
      const now = Date.now();
      const expiry = p.vipExpiry;
      const diffMs = expiry - now;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      let timeText = '';
      if (diffDays >= 1) {
        timeText = `Expires in ${diffDays} Day${diffDays > 1 ? 's' : ''}`;
      } else {
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
        timeText = `Expires in ${diffHours} Hour${diffHours > 1 ? 's' : ''}`;
      }
      
      vipExpiryText.innerHTML = `<i class="fa-solid fa-crown"></i> VIP Active<br><span style="color:var(--txm); font-size:0.68rem; font-weight:500;">${timeText}</span>`;
      if(vipCardSubText) vipCardSubText.textContent = `VIP Active till ${fmtDate(expiry)}. Click to Extend.`;
    } else {
      homeBuyVipBtn.innerHTML = '<i class="fa-solid fa-crown"></i> Buy VIP';
      homeBuyVipBtn.style.display = 'flex';
      vipExpiryText.style.display = 'none';
      if(vipCardSubText) vipCardSubText.textContent = `Blue Tick, Themes, World Chat & Direct Admin DM`;
    }
  }

  renderThemeGrid();
  updateGreeting();
}

async function loadChannels() {
  try {
    const [supSnap, linksSnap] = await Promise.all([ get(ref(db, 'appSettings/supportiveLinks')).catch(()=>null), get(ref(db, 'appSettings/support')).catch(()=>null) ]);
    const card = $('#channelsCard'); const host = $('#channelsHost');
    const v1 = supSnap?.exists() ? supSnap.val() : {}; const v2 = linksSnap?.exists() ? linksSnap.val() : {};
    let tgUser = v1.telegram || v2.telegram || 'PunjabEsports';
    let waNum  = v1.whatsapp || v2.whatsapp || '+919876543210';
    let igUser = v1.instagram || v2.instagram || 'punjab_esports';
    let ytLink = v1.youtube || 'https://www.youtube.com/@PunjabEsports';
    let email  = v1.gmail || v2.email || 'support@punjabesports.com';
    let html = '';
    if (waNum) { const cleanWa = waNum.replace(/[^0-9]/g, ''); const link = waNum.startsWith('http') ? waNum : `https://wa.me/${cleanWa}`; html += `<a href="${esc(link)}" target="_blank" rel="noopener" class="channel-btn whatsapp"><div class="channel-btn-icon"><i class="fa-brands fa-whatsapp"></i></div><div class="cb-text"><b>WhatsApp</b><small>Get updates & chat directly on WhatsApp</small></div><i class="fa-solid fa-arrow-right"></i></a>`; }
    if (tgUser) { const cleanTg = tgUser.replace(/^@/, '').replace(/^https?:\/\/t\.me\//,'').replace(/\/$/,''); const link = tgUser.startsWith('http') ? tgUser : `https://t.me/${cleanTg}`; html += `<a href="${esc(link)}" target="_blank" rel="noopener" class="channel-btn telegram"><div class="channel-btn-icon"><i class="fa-brands fa-telegram"></i></div><div class="cb-text"><b>Telegram</b><small>Join our official channel for latest announcements</small></div><i class="fa-solid fa-arrow-right"></i></a>`; }
    if (igUser) { const cleanIg = igUser.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//,'').replace(/\/$/,''); const link = igUser.startsWith('http') ? igUser : `https://instagram.com/${cleanIg}`; html += `<a href="${esc(link)}" target="_blank" rel="noopener" class="channel-btn instagram"><div class="channel-btn-icon"><i class="fa-brands fa-instagram"></i></div><div class="cb-text"><b>Instagram</b><small>Follow for match highlights & stories</small></div><i class="fa-solid fa-arrow-right"></i></a>`; }
    if (ytLink) { let ytUrl = ytLink; if (!ytUrl.startsWith('http')) { ytUrl = 'https://www.youtube.com/' + (ytUrl.startsWith('@') ? ytUrl : '@' + ytUrl); } html += `<a href="${esc(ytUrl)}" target="_blank" rel="noopener" class="channel-btn youtube"><div class="channel-btn-icon"><i class="fa-brands fa-youtube"></i></div><div class="cb-text"><b>YouTube</b><small>Watch live streams & match highlights</small></div><i class="fa-solid fa-arrow-right"></i></a>`; }
    if (email) { html += `<a href="mailto:${esc(email)}" class="channel-btn email"><div class="channel-btn-icon"><i class="fa-solid fa-envelope"></i></div><div class="cb-text"><b>Email Support</b><small>${esc(email)}</small></div><i class="fa-solid fa-arrow-right"></i></a>`; }
    host.innerHTML = html; card.hidden = false;
  } catch(e) { $('#channelsCard').hidden = false; }
}

function attachListeners() {
  const uid = State.user.uid;

  trackListener(ref(db, 'users/' + uid), (snap) => {
    if (snap.exists()) {
      State.profile = snap.val();
      loadProfileUI();
    }
  });

  trackListener(ref(db, 'wallets/' + uid), (snap) => {
    const w = snap.val() || { balance: 0, reserved: 0 };
    State.wallet = isObj(w) ? w : { balance: 0, reserved: 0 };
    const balanceStr = fmtMoney(State.wallet.balance || 0);
    $('#homeBalance').textContent = balanceStr;
    $('#walletBalance').textContent = balanceStr;
  });

  trackListener(query(ref(db, 'worldChat'), orderByChild('createdAt'), limitToLast(50)), (snap) => {
    const arr = []; snap.forEach(c => { const v = c.val(); if (!isObj(v)) return; if (v.deleted) return; arr.push(v); });
    State.chatMessages = arr.filter(m => !State.localDeletedChats.includes(m.id));
    if ($('#chatMessages') && $('#chatMessages').parentElement) renderChatMessages();
  });

  trackListener(ref(db, 'tournaments'), (snap) => {
    const newTours = [];
    snap.forEach(c => {
      const v = c.val(); if (!isObj(v)) return; v.id = c.key;
      newTours.push(v);
    });
    State.tournaments = newTours;
    State.tournaments.sort((a, b) => {
      const timeA = new Date((a.matchDate || '2099-01-01') + 'T' + (a.matchTime || '00:00')).getTime();
      const timeB = new Date((b.matchDate || '2099-01-01') + 'T' + (b.matchTime || '00:00')).getTime();
      return timeA - timeB;
    });
    
    const cancelled = State.tournaments.filter(t => t.status === 'cancelled' || t.status === 'canceled');
    cancelled.forEach(m => processRefundIfNeeded(m.id, m));

    renderHomeMatches(); renderTourList(); renderMyMatches();
  });

  trackListener(ref(db, 'matchResults'), (snap) => {
    State.matchResultsCache = {};
    if (snap.exists()) {
      snap.forEach(c => { const v = c.val(); if (isObj(v)) State.matchResultsCache[c.key] = v; });
    }
    renderMyMatches();
    // Auto refresh leaderboard if on that tab and data changed
    if (State.currentPage === 'mymatches' && State.myTab === 'leaderboard') {
        State.lbCache = { data: null, ts: 0 }; // Clear cache to force reload
        loadLeaderboardData(); 
    }
  });

  trackListener(query(ref(db, 'registrations'), orderByChild('userId'), equalTo(uid)), (snap) => {
    State.myRegistrations = [];
    snap.forEach(c => { const v = c.val(); if (!isObj(v)) return; if (isWithinRetention(v.createdAt)) { v.id = c.key; State.myRegistrations.push(v); } });
    
    State.myRegistrations.forEach(reg => {
      const m = State.tournaments.find(t => t.id === reg.matchId);
      if (m && (m.status === 'cancelled' || m.status === 'canceled')) {
        processRefundIfNeeded(m.id, m);
      }
    });

    renderMyMatches(); updateStats(); updateWalletStats();
  });

  trackListener(query(ref(db, 'walletTransactions'), orderByChild('userId'), equalTo(uid)), (snap) => {
    const arr = []; snap.forEach(c => { const v = c.val(); if (!isObj(v)) return; if (isWithinRetention(v.createdAt)) arr.push(v); });
    arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    State.transactions = arr;
    renderTransactions(); updateWalletStats();
  });

  trackListener(query(ref(db, 'notifications/' + uid), orderByChild('createdAt'), limitToLast(50)), (snap) => {
    const arr = []; snap.forEach(c => { const v = c.val(); if (!isObj(v)) return; if (isWithinRetention(v.createdAt)) { v.id = c.key; arr.push(v); } });
    arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    
    const filteredArr = arr.filter(n => {
      if (n.type === 'announcement' || n.type === 'custom_message') return false;
      if (n.type === 'match_result' && n.matchId) {
         const res = State.matchResultsCache[n.matchId];
         if (!res || res.status !== 'approved') return false; 
      }
      return true;
    });

    State.notifications = filteredArr;
    const unread = filteredArr.filter(n => !n.read).length;
    const dot = $('#notifDot');
    if (dot) { if (unread > 0) { dot.hidden = false; dot.textContent = unread > 99 ? '99+' : unread; } else { dot.hidden = true; } }

    let maxTs = 0;
    filteredArr.forEach(n => { if (n.createdAt > maxTs) maxTs = n.createdAt; });
    
    if (State.lastNotifTs && maxTs > State.lastNotifTs) {
      const newest = filteredArr[0];
      if (newest && newest.createdAt > State.lastNotifTs && !newest.read) {
        playNotifSound();
        const bell = $('#notifBtn');
        bell.classList.remove('bell-ring');
        void bell.offsetWidth;
        bell.classList.add('bell-ring');
        
        if (!$('.notif-modal')) {
          openNotifications();
        }
      }
    }
    State.lastNotifTs = maxTs;
  });

  trackListener(query(ref(db, 'announcements'), orderByChild('createdAt'), limitToLast(5)), (snap) => {
    const arr = []; snap.forEach(c => { const v = c.val(); if (!isObj(v)) return; if (v.active !== false) arr.push(v); });
    arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    renderAnnouncements(arr);
  });

  trackListener(ref(db, 'themeSettings'), (snap) => {
    const cfg = snap.exists() ? snap.val() : {};
    themeState.mode = cfg.mode || 'user'; themeState.globalTheme = cfg.globalTheme || 'gold'; themeState.default = cfg.default || 'gold'; themeState.enabled = cfg.enabled || {};
    refreshTheme();
    if (State.currentPage === 'profile') renderThemeGrid();
  });

  trackListener(ref(db, 'appSettings/cleanup'), (snap) => {
    if (snap.exists()) {
      const c = snap.val(); State.cleanupDays = typeof c.days !== 'undefined' ? Number(c.days) : 7; State.retentionMs = State.cleanupDays * 24 * 60 * 60 * 1000;
      renderTransactions(); renderMyMatches();
    }
  });

  trackListener(ref(db, 'vipSettings'), (snap) => {
    if (snap.exists()) State.vipSettings = snap.val();
  });

  trackListener(query(ref(db, 'referrals'), orderByChild('referrerId'), equalTo(uid)), (snap) => {
    const arr = [];
    snap.forEach(c => { const v = c.val(); if (isObj(v) && isWithinRetention(v.createdAt)) { v.id = c.key; arr.push(v); } });
    State.referrals = arr;
    renderReferralStats();
  });

  trackListener(ref(db, 'appSettings/supportiveLinks'), () => loadChannels());
  trackListener(ref(db, 'appSettings/support'), () => loadChannels());

  trackListener(ref(db, 'userTeams/' + uid), async (snap) => {
    if (snap.exists()) {
      const { teamId, role } = snap.val();
      const teamSnap = await get(ref(db, 'teams/' + teamId)).catch(()=>null);
      if (teamSnap && teamSnap.exists()) {
        State.myTeam = { ...teamSnap.val(), teamId };
        State.teamRole = role;
        trackListener(ref(db, 'teamWallets/' + teamId), (walletSnap) => {
          State.teamWalletData = walletSnap.exists() ? walletSnap.val() : { balance: 0, transactions: {}, matchHistory: {} };
          if (State.currentPage === 'mymatches' && State.myTab === 'team') renderMyTeam();
        });
      } else { State.myTeam = null; State.teamRole = null; State.teamWalletData = null; }
    } else { State.myTeam = null; State.teamRole = null; State.teamWalletData = null; }
    if (State.currentPage === 'mymatches') renderMyTeam();
  });

  trackListener(ref(db, 'teamInvites/' + uid), (snap) => {
    const arr = [];
    snap.forEach(c => { const v = c.val(); if (isObj(v) && v.status === 'pending') { v.id = c.key; arr.push(v); } });
    State.myTeamInvites = arr;
    if (State.currentPage === 'mymatches') renderMyTeam();
  });

  get(ref(db, 'appSettings')).then(s => { State.settings = s.val() || {}; }).catch(()=>{});
}

async function processRefundIfNeeded(matchId, m) {
    if (m.status !== 'cancelled' && m.status !== 'canceled') return;
    const myRegs = State.myRegistrations.filter(r => r.matchId === matchId);
    for (const reg of myRegs) {
        if (reg.refunded) continue;
        const isPayer = reg.paidBy === State.user.uid || (!reg.paidBy && reg.userId === State.user.uid);
        if (isPayer) {
            const refundAmount = Number(reg.entryFee || 0);
            await update(ref(db, 'registrations/' + reg.id), { refunded: true });
            reg.refunded = true;
            if (refundAmount > 0) {
                await runTransaction(ref(db, 'wallets/' + State.user.uid + '/balance'), (cur) => (Number(cur)||0) + refundAmount);
                const txRef = push(ref(db, 'walletTransactions'));
                await set(txRef, { id: txRef.key, userId: State.user.uid, type: 'refund', amount: refundAmount, currency: 'INR', relatedId: matchId, status: 'completed', createdAt: Date.now() });
            }
            const notifRef = push(ref(db, 'notifications/' + State.user.uid));
            await set(notifRef, { id: notifRef.key, type: 'match_cancelled', title: 'Match Cancelled & Refunded', body: `Match "${m.title}" has been cancelled. ₹${refundAmount} has been refunded to your wallet.`, matchId: matchId, read: false, createdAt: Date.now() });
            toast('info', 'Match Cancelled', `₹${refundAmount} refunded to your wallet.`);
        }
    }
}

function renderReferralStats() {
  const refs = State.referrals || [];
  const total = refs.length;
  let earned = 0, pending = 0;
  refs.forEach(r => { if (r.status === 'credited') earned += Number(r.rewardAmount || 0); else pending++; });
  const elTotal = $('#refCount'); if (elTotal) elTotal.textContent = total;
  const elEarned = $('#refEarned'); if (elEarned) elEarned.textContent = fmtMoney(earned);
  const elPending = $('#refPending'); if (elPending) elPending.textContent = pending;
}

function navigate(page) {
  State.currentPage = page;
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.nav === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'profile') { loadProfileExtras(); renderThemeGrid(); loadChannels(); renderReferralStats(); }
  if (page === 'mymatches') { switchMyTab(State.myTab || 'matches'); loadMyTeam(); }
}

function switchMyTab(tab) {
  State.myTab = tab;
  $$('#myTopTabs .filter-chip').forEach(c => c.classList.toggle('active', c.dataset.mytab === tab));
  const matches = $('#myTabMatches'); const team = $('#myTabTeam'); const lb = $('#myTabLeaderboard');
  if (matches) matches.hidden = tab !== 'matches';
  if (team) team.hidden = tab !== 'team';
  if (lb) lb.hidden = tab !== 'leaderboard';
  if (tab === 'team') loadMyTeam();
  if (tab === 'leaderboard') loadLeaderboardData();
}

$$('.bn-item').forEach(b => b.onclick = () => navigate(b.dataset.nav));
$$('[data-nav]').forEach(b => { if (!b.classList.contains('bn-item')) b.onclick = () => navigate(b.dataset.nav); });

$('#homeAddBtn').onclick = () => openAddBalance();
$('#homeWithdrawBtn').onclick = () => openWithdraw();
$('#walletAddBtn').onclick = () => openAddBalance();
$('#walletWithdrawBtn').onclick = () => openWithdraw();
$('#notifBtn').onclick = () => openNotifications();
$('#rulesBtn').onclick = () => openRules();
$('#editProfileBtn').onclick = () => openEditProfile();
$('#openVipStoreBtn').onclick = () => openVipStore();
$('#homeBuyVipBtn').onclick = () => openVipStore();
$('#chatBtn').onclick = () => openWorldChat();
$('#shareRefBtn').onclick = shareReferral;

// Button sound preference (default: ON), stored locally and available from Profile > Appearance.
function updateClickSoundToggle() {
  const enabled = isClickSoundEnabled();
  const toggle = $('#clickSoundToggle');
  const knob = $('#clickSoundKnob');
  if (!toggle || !knob) return;
  toggle.setAttribute('aria-checked', String(enabled));
  toggle.title = enabled ? 'Turn button sounds off' : 'Turn button sounds on';
  knob.style.left = enabled ? '24px' : '2px';
  knob.style.background = enabled ? 'var(--ac)' : 'var(--txm)';
}
$('#clickSoundToggle').onclick = () => {
  const enabled = !isClickSoundEnabled();
  try { localStorage.setItem('pe_click_sound', enabled ? 'on' : 'off'); } catch(e) {}
  updateClickSoundToggle();
  if (enabled) playClickSound();
  toast('success', 'Button sound ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'A soft sound will play when you tap buttons.' : 'Button sounds are now off.');
};
updateClickSoundToggle();
$('#logoutBtn').onclick = async () => {
  if (!await confirmDialog('Logout','End your session?')) return;
  detachAll();
  await signOut(auth);
  toast('success','Logged out','');
};

$('#darkModeToggle').onclick = () => {
  const currentBg = document.documentElement.getAttribute('data-bg');
  const nextBg = currentBg === 'dark' ? 'light' : 'dark';
  applyBgMode(nextBg === 'dark');
};

// My page top tabs
$$('#myTopTabs .filter-chip').forEach(c => c.onclick = () => switchMyTab(c.dataset.mytab));

// Leaderboard sub tabs
$$('#lbSubTabs .filter-chip').forEach(c => c.onclick = () => {
  State.lbTab = c.dataset.lbtab;
  $$('#lbSubTabs .filter-chip').forEach(x => x.classList.toggle('active', x.dataset.lbtab === State.lbTab));
  renderLeaderboard();
});

function renderHomeMatches() {
  const host = $('#homeMatches');
  const list = State.tournaments.filter(t => t.status === 'upcoming' || t.status === 'ongoing');
  if (!list.length) { host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-trophy"></i></div><h3>No matches yet</h3></div>`; return; }
  host.innerHTML = list.map(m => matchCardHTML(m)).join('');
  bindMatchCardClicks(host);
}

function updateStats() {
  const regs = State.myRegistrations || [];
  $('#statPlayed').textContent = regs.filter(r => r.status === 'confirmed').length;
  let wins = 0, kills = 0;
  regs.forEach(r => {
    const res = State.matchResultsCache[r.matchId];
    if (res && res.entries && res.entries[r.userId]) {
      const e = res.entries[r.userId];
      if (Number(e.rank) === 1) wins++;
      kills += Number(e.kills || 0);
    }
  });
  $('#statWins').textContent = wins;
  $('#statKills').textContent = kills;
}

function updateWalletStats() {
  const txs = State.transactions || [];
  let deposited = 0, won = 0, pending = 0;
  txs.forEach(t => {
    if (t.currency === 'DIAMONDS') return;
    if (t.type === 'deposit' && t.status === 'completed') deposited += Number(t.amount||0);
    if ((t.type === 'match_reward' || t.type === 'prize' || t.type === 'kill_reward' || t.type === 'referral') && t.status === 'completed') won += Number(t.amount||0);
    if (t.status === 'pending') pending += Number(t.amount||0);
  });
  const wd = $('#walletDeposited'); if (wd) wd.textContent = fmtMoney(deposited);
  const ww = $('#walletWon'); if (ww) ww.textContent = fmtMoney(won);
  const wp = $('#walletPending'); if (wp) wp.textContent = fmtMoney(pending);
}

function renderAnnouncements(list) {
  const host = $('#announcementHost');
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = list.slice(0,2).map(a => `<div class="card mb-3" style="border-left:4px solid var(--ac)"><div class="flex-between mb-2"><b>${esc(a.title || '')}</b><span class="badge neutral">${fmtDate(a.createdAt)}</span></div><p style="margin:0;font-size:.85rem">${esc(a.body || '')}</p></div>`).join('');
}

$$('#statusTabs .filter-chip').forEach(c => c.onclick = () => { $$('#statusTabs .filter-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); State.filters.status = c.dataset.status; renderTourList(); });
$$('#modeTabs .filter-chip').forEach(c => c.onclick = () => { $$('#modeTabs .filter-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); State.filters.mode = c.dataset.mode; renderTourList(); });
$('#tourSearch').oninput = (e) => { State.filters.search = e.target.value.trim().toLowerCase(); renderTourList(); };

const typeDropdownBtn = $('#typeDropdownBtn');
const typeDropdownMenu = $('#typeDropdownMenu');
if(typeDropdownBtn && typeDropdownMenu) {
  typeDropdownBtn.onclick = (e) => { e.stopPropagation(); typeDropdownMenu.classList.toggle('show'); };
  document.addEventListener('click', (e) => {
    if (!typeDropdownBtn.contains(e.target) && !typeDropdownMenu.contains(e.target)) {
      typeDropdownMenu.classList.remove('show');
    }
  });
  $$('#typeDropdownMenu .premium-item').forEach(item => {
    item.onclick = () => {
      $$('#typeDropdownMenu .premium-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      State.filters.type = item.dataset.type;
      const label = item.textContent.replace('All Entries', 'All').replace('Free Entry', 'Free').replace('Paid Entry', 'Paid').replace('✓', '').trim();
      $('#typeDropdownText').textContent = label;
      typeDropdownMenu.classList.remove('show');
      renderTourList();
    };
  });
}

function renderTourList() {
  const host = $('#tourList');
  let list = State.tournaments.filter(t => {
    if (State.filters.status !== 'all' && t.status !== State.filters.status) return false;
    if (State.filters.mode && t.mode !== State.filters.mode) return false;
    if (State.filters.type === 'free' && Number(t.entryFee) > 0) return false;
    if (State.filters.type === 'paid' && Number(t.entryFee) === 0) return false;
    if (State.filters.search) { const s = ((t.title||'') + ' ' + (t.id||'')).toLowerCase(); if (!s.includes(State.filters.search)) return false; }
    return true;
  });
  if (!list.length) { host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-trophy"></i></div><h3>No matches found</h3></div>`; return; }
  host.innerHTML = list.map(m => matchCardHTML(m)).join('');
  bindMatchCardClicks(host);
}

function getValidBanner(m) {
    let bannerRaw = m.bannerUrl || m.imageUrl || m.image || m.img || m.banner || m.thumbnail || '';
    bannerRaw = String(bannerRaw).trim().replace(/['"]/g, '');
    if (bannerRaw.includes('drive.google.com') && bannerRaw.includes('/file/d/')) {
        const idMatch = bannerRaw.match(/\/file\/d\/([^/]+)/);
        if (idMatch && idMatch[1]) bannerRaw = `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
    }
    if (bannerRaw && !bannerRaw.startsWith('http')) bannerRaw = 'https://' + bannerRaw;
    return bannerRaw;
}

function getAllowedSlotCapacity(matchOrMode, formatSize) {
  const mode = typeof matchOrMode === 'object' ? String(matchOrMode.mode || 'BR').toUpperCase() : String(matchOrMode || 'BR').toUpperCase();
  const size = Math.max(1, Number(typeof matchOrMode === 'object' ? (matchOrMode.teamSize || 1) : formatSize) || 1);
  // Free Fire BR supports 48 players total; Duo/Squad reserve one slot per whole team.
  // Clash Squad is two 4-player sides (8 players); Lone Wolf is a 1v1 (2 players).
  const playerLimit = mode === 'CS' ? 8 : mode === 'LW' ? 2 : 48;
  return Math.max(1, Math.floor(playerLimit / size));
}
function getMatchSlotCapacity(match) {
  const maxAllowed = getAllowedSlotCapacity(match);
  const configured = Math.floor(Number(match && match.capacity) || maxAllowed);
  return Math.max(1, Math.min(configured, maxAllowed));
}

function matchCardHTML(m) {
  const teamSize = Number(m.teamSize || 1);
  const reg = teamSize > 1 ? Number(m.registeredSlotCount ?? Math.floor(Number(m.registeredCount||0)/teamSize)) : Number(m.registeredCount || 0);
  const cap = getMatchSlotCapacity(m);
  const pct = cap ? Math.min(100, (reg/cap)*100) : 0;
  const isFull = reg >= cap;
  const modeCls = { BR:'br', CS:'cs', LW:'lw' }[m.mode] || 'neutral';
  const modeName = { BR:'Battle Royale', CS:'Clash Squad', LW:'Lone Wolf' }[m.mode] || m.mode;
  const teamLabel = teamSize === 2 ? 'Duo' : teamSize === 4 ? 'Squad' : 'Solo';

  const bannerRaw = getValidBanner(m);
  
  let bannerHTML = `<div class="match-banner"><i class="fa-solid fa-image"></i></div>`;
  if (bannerRaw) { 
      bannerHTML = `<div class="match-banner"><img src="${esc(bannerRaw)}" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-image\\'></i>'" alt="Match Banner" style="width:100%;height:100%;object-fit:cover;"></div>`; 
  }

  const dateStr = formatMatchDateTime(m.matchDate, m.matchTime);

  return `<div class="match-card" data-match-id="${esc(m.id)}">
    ${bannerHTML}
    <div class="match-body">
      <div class="flex-between mb-2">
        <span class="badge ${modeCls}">${esc(modeName)} · ${teamLabel}</span>
        <span class="badge ${m.status}">${esc(m.status)}</span>
      </div>
      <div class="match-title">${esc(m.title || 'Untitled')}</div>
      <div class="match-meta">
        <span><i class="fa-regular fa-calendar"></i> ${esc(dateStr)}</span>
        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${m.entryFee > 0 ? fmtMoney(m.entryFee) : 'FREE'}</span>
        ${m.perKill > 0 ? `<span><i class="fa-solid fa-crosshairs"></i> ${fmtMoney(m.perKill)}/kill</span>` : ''}
      </div>
      <div class="match-slot-row">
        <div class="slot-meta"><span>${reg} / ${cap} slots</span><span>${isFull ? 'FULL' : (cap - reg) + ' left'}</span></div>
        <div class="slot-bar"><div class="slot-fill ${isFull?'full':''}" style="width:${pct}%"></div></div>
      </div>
    </div>
  </div>`;
}

function bindMatchCardClicks(root) { root.querySelectorAll('[data-match-id]').forEach(el => { el.onclick = () => openMatchDetails(el.dataset.matchId); }); }

// ==========================================
// 🔥 FIXED MATCH DETAILS & ROOM CREDENTIALS 🔥
// ==========================================
async function openMatchDetails(matchId) {
  const m = State.tournaments.find(t => t.id === matchId);
  if (!m) { toast('error','Not found',''); return; }
  const myReg = State.myRegistrations.find(r => r.matchId === matchId && r.status === 'confirmed');
  const teamSize = Number(m.teamSize || 1);
  const reg = teamSize > 1 ? Number(m.registeredSlotCount ?? Math.floor(Number(m.registeredCount||0)/teamSize)) : Number(m.registeredCount || 0);
  const cap = getMatchSlotCapacity(m);
  const isFull = reg >= cap;
  const pct = cap ? Math.min(100, (reg/cap)*100) : 0;

  const bannerRaw = getValidBanner(m);
  
  let bannerHTML = '';
  if (bannerRaw) { bannerHTML = `<img src="${esc(bannerRaw)}" onerror="this.style.display='none'" style="width:100%;height:180px;object-fit:cover;border-radius:14px;margin-bottom:14px">`; }

  const modeName = { BR:'Battle Royale', CS:'Clash Squad', LW:'Lone Wolf' }[m.mode] || m.mode;
  const teamLabel = teamSize === 2 ? 'Duo (2 Players)' : teamSize === 4 ? 'Squad (4 Players)' : 'Solo (1 Player)';

  let myResultHTML = '';
  const res = State.matchResultsCache[matchId];
  if (res && res.entries && res.entries[State.user.uid]) {
    const e = res.entries[State.user.uid];
    let rankText = `Rank: ${e.rank || '-'}`;
    if(Number(e.rank) === 1) rankText = '🥇 Rank #1';
    else if(Number(e.rank) === 2) rankText = '🥈 Rank #2';
    else if(Number(e.rank) === 3) rankText = '🥉 Rank #3';

    if(res.status === 'approved') {
      myResultHTML = `
        <div class="alert success mt-3" style="background:var(--oks);color:var(--ok);border-color:rgba(34,197,94,.3);flex-direction:column;align-items:flex-start;gap:8px">
          <div style="font-weight:700;font-size:1rem"><i class="fa-solid fa-trophy"></i> Your Result (Approved)</div>
          <div style="display:flex;gap:16px;font-size:.9rem">
            <span>${rankText}</span>
            <span><i class="fa-solid fa-crosshairs"></i> ${e.kills || 0} kills</span>
            <span style="font-weight:700;color:var(--ok)">+${fmtMoney(e.reward || 0)}</span>
          </div>
        </div>
      `;
    } else if (res.status === 'pending_approval') {
      myResultHTML = `
        <div class="alert info mt-3" style="background:var(--infs);color:var(--inf);border-color:rgba(59,130,246,.3);flex-direction:column;align-items:flex-start;gap:8px">
          <div style="font-weight:700;font-size:1rem"><i class="fa-solid fa-hourglass-half"></i> Result Pending Approval</div>
          <div style="display:flex;gap:16px;font-size:.9rem">
            <span>${rankText}</span>
            <span><i class="fa-solid fa-crosshairs"></i> ${e.kills || 0} kills</span>
            <span style="font-weight:700;color:var(--inf)">Est: ${fmtMoney(e.reward || 0)}</span>
          </div>
        </div>
      `;
    }
  }

  let teammatesHTML = '';
  const mySlotNumber = myReg ? Number(myReg.slotIndex || (Number(myReg.teamSize || 1) === 1 ? myReg.teamSlotIndex : 0) || 0) : 0;
  const mySlotHTML = myReg && mySlotNumber ? `<div class="room-box mt-3" style="border:1px solid var(--ac2);background:var(--sf2);padding:14px 16px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div style="font-weight:800;color:var(--ac2);font-size:.92rem;letter-spacing:.3px"><i class="fa-solid fa-ticket"></i> YOUR ASSIGNED SLOT</div><div style="flex:0 0 58px;height:58px;border:2px solid var(--ac2);border-radius:14px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--ac2);font-size:1.7rem;font-weight:900;box-shadow:0 3px 12px rgba(0,0,0,.12)">${mySlotNumber}</div></div><div style="font-size:.8rem;color:var(--txm);margin-top:10px;line-height:1.55">Enter the game room using this exact slot number. Your whole Duo/Squad team shares this same slot. Playing in another slot may make you ineligible for prizes or rewards.</div></div>` : '';
  if (myReg && myReg.teamId) {
    const teamMates = State.myRegistrations.filter(r => r.matchId === matchId && r.teamId === myReg.teamId);
    if (teamMates.length > 1) {
      teammatesHTML = `<div class="room-box mt-3"><div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ac2);margin-bottom:8px"><i class="fa-solid fa-users"></i> Your Team</div>${teamMates.map((tm, i) => `<div class="room-row"><span class="rk">${esc(tm.teamMemberIndex ? 'Member ' + tm.teamMemberIndex : 'Player')}</span><span class="rv" style="color:var(--tx)">${esc(tm.userName)}</span></div>`).join('')}</div>`;
    }
  }

  // 🔥 FIX: ROOM CREDENTIALS FETCH & DISPLAY
  let roomHTML = '';
  if (m.status === 'ongoing' && myReg) {
    try {
      // Pehle root se check karo, phir match object se
      const snap = await get(ref(db, 'privateRoomCredentials/' + matchId));
      let rData = null;
      if (snap.exists()) {
        rData = snap.val();
      } else if (m.roomId || m.roomPass) {
        rData = { roomId: m.roomId, roomPass: m.roomPass };
      }

      if (rData && (rData.roomId || rData.roomPass)) {
        roomHTML = `<div class="room-box mt-3" style="border-color:var(--ok); background:linear-gradient(135deg, rgba(34,197,94,.1), transparent);">
          <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ok);margin-bottom:8px"><i class="fa-solid fa-key"></i> Room Credentials (Live)</div>
          <div class="room-row"><span class="rk">Room ID</span><span class="rv">${esc(rData.roomId || '—')} <button type="button" class="copy-btn" data-copy="${esc(rData.roomId||'')}">Copy</button></span></div>
          <div class="room-row"><span class="rk">Password</span><span class="rv">${esc(rData.roomPass || '—')} <button type="button" class="copy-btn" data-copy="${esc(rData.roomPass||'')}">Copy</button></span></div>
          <div style="font-size:0.7rem; color:var(--txm); margin-top:8px; text-align:center;"><i class="fa-solid fa-circle-info"></i> Join the room before the timer ends!</div>
        </div>`;
      } else {
        roomHTML = `<div class="alert warning mt-3" style="background:var(--wns);color:var(--wn);border-color:var(--wn)"><i class="fa-solid fa-triangle-exclamation"></i><span>Room ID & Password are not set yet. Admin will add them shortly.</span></div>`;
      }
    } catch (e) { 
      roomHTML = `<div class="alert info mt-3"><i class="fa-solid fa-lock"></i><span>Credentials available to confirmed participants only.</span></div>`; 
    }
  } else if (m.status === 'upcoming' && myReg) {
    roomHTML = `<div class="alert info mt-3"><i class="fa-solid fa-lock"></i><span>Room credentials will be revealed automatically when the match starts (Ongoing).</span></div>`;
  }

  let footerHTML = `<button class="btn btn-ghost w-100" data-x="close">Close</button>`;
  if (m.status === 'upcoming') {
    if (myReg) footerHTML = `<button class="btn btn-success w-100" disabled><i class="fa-solid fa-check"></i> Already Joined</button>`;
    else if (isFull) footerHTML = `<button class="btn btn-outline w-100" disabled><i class="fa-solid fa-ban"></i> Match Full</button>`;
    else footerHTML = `<button class="btn btn-primary w-100" data-x="join"><i class="fa-solid fa-right-to-bracket"></i> ${teamSize > 1 ? 'Join as Team' : 'Join Match'}</button>`;
  } else if (m.status === 'ongoing') footerHTML = `<button class="btn btn-outline w-100" disabled><i class="fa-solid fa-play"></i> Match in Progress</button>`;
  else if (m.status === 'completed') footerHTML = `<button class="btn btn-outline w-100" disabled><i class="fa-solid fa-flag-checkered"></i> Completed</button>`;
  else if (m.status === 'cancelled' || m.status === 'canceled') footerHTML = `<button class="btn btn-danger w-100" disabled><i class="fa-solid fa-ban"></i> Cancelled</button>`;

  openModal({
    title: 'Match Details',
    bodyHTML: `
      ${bannerHTML}
      <h2 style="font-size:1.15rem;margin-bottom:8px">${esc(m.title || '')}</h2>
      <div class="flex gap-2 mb-3"><span class="badge ${m.mode==='BR'?'br':m.mode==='CS'?'cs':'lw'}">${esc(modeName)}</span><span class="badge neutral">${esc(teamLabel)}</span><span class="badge ${m.status}">${esc(m.status)}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Date</div><div style="font-weight:500">${esc(m.matchDate || '—')}</div></div>
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Time</div><div style="font-weight:500">${esc(formatTime12h(m.matchTime) || '—')}</div></div>
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Entry Fee</div><div style="font-weight:500">${m.entryFee > 0 ? fmtMoney(m.entryFee) : 'FREE'}</div></div>
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Per Kill</div><div style="font-weight:500">${fmtMoney(m.perKill || 0)}</div></div>
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Prize Pool</div><div style="font-weight:500">${fmtMoney(m.prizePool || 0)}</div></div>
        <div><div style="font-size:.7rem;color:var(--txm);text-transform:uppercase;letter-spacing:.8px">Slots</div><div style="font-weight:500">${reg} / ${cap}</div></div>
      </div>
      <div class="slot-bar"><div class="slot-fill ${isFull?'full':''}" style="width:${pct}%"></div></div>
      <div class="slot-meta"><span>${isFull ? 'FULL' : (cap-reg) + ' slots left'}</span><span>${pct.toFixed(0)}%</span></div>
      ${myResultHTML}
      ${mySlotHTML}
      ${teammatesHTML}
      ${m.description ? `<hr class="divider"><h4 style="font-size:.88rem">Description</h4><p style="font-size:.84rem">${esc(m.description)}</p>` : ''}
      ${m.rules ? `<hr class="divider"><h4 style="font-size:.88rem">Rules</h4><p style="font-size:.84rem;white-space:pre-wrap">${esc(m.rules)}</p>` : ''}
      ${roomHTML}
    `,
    footerHTML,
    onMount: (el, close) => {
      el.querySelectorAll('[data-copy]').forEach(b => { b.type = 'button'; b.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await copyTextToClipboard(b.dataset.copy); }; });
      const cb = el.querySelector('[data-x="close"]');
      if (cb) cb.onclick = close;
      const jb = el.querySelector('[data-x="join"]');
      if (jb) jb.onclick = () => { close(); handleJoin(matchId); };
    }
  });
}

// 🔥 FIX: AUTO-SAVE ROOM CREDENTIALS TO PRIVATE PATH ON JOIN 🔥
async function ensureRoomCredentials(matchId, m) {
    try {
        const snap = await get(ref(db, 'privateRoomCredentials/' + matchId));
        if (!snap.exists() && (m.roomId || m.roomPass)) {
            await set(ref(db, 'privateRoomCredentials/' + matchId), {
                roomId: m.roomId || '',
                roomPass: m.roomPass || '',
                createdAt: Date.now()
            });
        }
    } catch(e) { console.warn('Failed to sync credentials', e); }
}

async function handleJoin(matchId) {
  if (!State.user) return;
  const m = State.tournaments.find(t => t.id === matchId);
  if (!m) return;
  const teamSize = Number(m.teamSize || 1);
  if (teamSize > 1) return handleTeamJoin(matchId, m, teamSize);

  const balance = Number(State.wallet.balance || 0);
  const fee = Number(m.entryFee || 0);

  if (fee > 0 && balance < fee) { toast('warning','Insufficient Balance', ''); openAddBalance(); return; }

  const confirmed = await new Promise(resolve => {
    openModal({
      title: 'Confirm Join',
      bodyHTML: `
        <div style="text-align:center;margin-bottom:14px"><i class="fa-solid fa-trophy" style="font-size:2.5rem;color:var(--ac2)"></i></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="room-row"><span class="rk">Match</span><span style="font-weight:600">${esc(m.title||'')}</span></div>
          <div class="room-row"><span class="rk">Entry Fee</span><span style="font-weight:600">${fee > 0 ? fmtMoney(fee) : 'FREE'}</span></div>
          <div class="room-row"><span class="rk">Your Balance</span><span style="font-weight:600">${fmtMoney(balance)}</span></div>
          <div class="room-row"><span class="rk">After Joining</span><span style="font-weight:600;color:var(--ok)">${fmtMoney(balance - fee)}</span></div>
        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-check"></i> Confirm & Join</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-x="c"]').onclick = () => { close(); resolve(false); };
        el.querySelector('[data-x="ok"]').onclick = () => { close(); resolve(true); };
      }
    });
  });

  if (!confirmed) return;
  await executeJoin(matchId, m, fee);
}

async function executeJoin(matchId, m, fee) {
  const uid = State.user.uid;
  const operationId = 'join_' + matchId + '_' + uid + '_' + Date.now();
  const regRef = push(ref(db, 'registrations'));
  const regId = regRef.key;

  try {
    const capResult = await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredCount'), (cur) => {
      const curr = Number(cur) || 0;
      if (curr >= getMatchSlotCapacity(m)) return;
      return curr + 1;
    });
    if (!capResult.committed) { toast('error','Match Full',''); return; }

    if (fee > 0) {
      const wResult = await runTransaction(ref(db, 'wallets/' + uid + '/balance'), (cur) => {
        const curr = Number(cur) || 0;
        if (curr < fee) return;
        return curr - fee;
      });
      if (!wResult.committed) {
        await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredCount'), (cur) => Math.max(0, (Number(cur)||0) - 1));
        toast('error','Insufficient Balance',''); openAddBalance(); return;
      }
    }

    const slotResult = await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredSlotCount'), cur => {
      const next = (Number(cur) || 0) + 1;
      if (next > getMatchSlotCapacity(m)) return;
      return next;
    });
    if (!slotResult.committed) {
      await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredCount'), cur => Math.max(0, (Number(cur)||0) - 1));
      if (fee > 0) await runTransaction(ref(db, 'wallets/' + uid + '/balance'), cur => (Number(cur)||0) + fee);
      toast('error','No Slot Available','All match slots are already assigned.'); return;
    }
    const assignedSlot = Number(slotResult.snapshot.val());
    await set(regRef, { id: regId, matchId, matchTitle: m.title || '', matchMode: m.mode || '', userId: uid, userName: State.profile?.displayName || 'Player', userFfUid: State.profile?.freeFireUid || '', entryFee: fee, paidBy: uid, payerId: uid, joinedBy: uid, teamMemberUids: [uid], teamSize: 1, slotIndex: assignedSlot, teamSlotIndex: assignedSlot, isEntryPayer: true, status: 'confirmed', operationId, createdAt: Date.now() });

    if (fee > 0) {
      const txRef = push(ref(db, 'walletTransactions'));
      await set(txRef, { id: txRef.key, userId: uid, type: 'entry_fee', amount: -fee, currency: 'INR', relatedId: matchId, relatedRegId: regId, status: 'completed', idempotencyKey: operationId, createdAt: Date.now() });
    }

    await set(ref(db, 'userRegistrations/' + uid + '/' + matchId), { regId, status: 'confirmed', matchTitle: m.title || '', createdAt: Date.now() });
    
    // 🔥 FIX: Save credentials silently for future display
    await ensureRoomCredentials(matchId, m);

    const notifRef = push(ref(db, 'notifications/' + uid));
    await set(notifRef, { id: notifRef.key, type: 'registration', title: 'Registration Confirmed', body: `You joined "${m.title}"`, matchId, read: false, createdAt: Date.now() });

    toast('success','Joined!', fee > 0 ? `${fmtMoney(fee)} deducted.` : 'Entry confirmed.');
    navigate('mymatches');
  } catch (e) { toast('error','Join Failed', e.message || ''); }
}

async function handleTeamJoin(matchId, m, teamSize) {
  const uid = State.user.uid;

  let teamId, team;
  try {
    const utSnap = await get(ref(db, 'userTeams/' + uid));
    if (!utSnap.exists()) {
      openModal({
        title: 'Team Required',
        bodyHTML: `<div style="text-align:center;padding:16px 0"><i class="fa-solid fa-users" style="font-size:3rem;color:var(--ac2);margin-bottom:14px"></i><h3>You need a team</h3><p style="font-size:.9rem">${teamSize === 4 ? 'Squad' : 'Duo'} matches require a team. Create or join a team to continue.</p></div>`,
        footerHTML: `<button class="btn btn-primary w-100" id="gotoTeamBtn"><i class="fa-solid fa-users"></i> Go to My Team</button>`,
        onMount: (el, close) => { el.querySelector('#gotoTeamBtn').onclick = () => { close(); navigate('mymatches'); setTimeout(()=>switchMyTab('team'), 200); }; }
      });
      return;
    }
    teamId = utSnap.val().teamId;
    const teamSnap = await get(ref(db, 'teams/' + teamId));
    if (!teamSnap.exists()) { toast('error','Team not found',''); return; }
    team = teamSnap.val();
  } catch(e) { toast('error','Error',e.message); return; }

  const members = Object.values(team.members || {});
  const passActive = Number(team.maintenanceExpiry || 0) > Date.now();

  if (!passActive) {
    openModal({
      title: 'Maintenance Pass Required',
      bodyHTML: `<div style="text-align:center;padding:16px 0"><i class="fa-solid fa-lock" style="font-size:3rem;color:var(--wn);margin-bottom:14px"></i><h3>Team Locked</h3><p style="font-size:.9rem">Your team's ₹5 Monthly Maintenance Pass is not active. Purchase or extend it to unlock Duo & Squad matches.</p></div>`,
      footerHTML: `<button class="btn btn-primary w-100" id="buyPassBtn"><i class="fa-solid fa-crown"></i> Buy ₹5 Pass</button>`,
      onMount: (el, close) => { el.querySelector('#buyPassBtn').onclick = () => { close(); setTimeout(()=>buyTeamMaintenancePass(teamId), 200); }; }
    });
    return;
  }

  if (members.length < teamSize) {
    toast('error', 'Not Enough Members', `Your team needs ${teamSize} members to join this match (currently ${members.length}).`);
    return;
  }

  let selectedTeammates = [];
  if (teamSize === 4) {
    selectedTeammates = members.filter(mem => mem.uid !== uid).slice(0, 3);
  } else if (teamSize === 2) {
    const candidates = members.filter(mem => mem.uid !== uid);
    const pick = await showTeammatePicker(candidates);
    if (!pick) return;
    selectedTeammates = [pick];
  }

  const fee = Number(m.entryFee || 0);
  const balance = Number(State.wallet.balance || 0);
  const allPlayers = [
    { uid, name: State.profile?.displayName || 'Player', ffUid: State.profile?.freeFireUid || '' },
    ...selectedTeammates.map(t => ({ uid: t.uid, name: t.name || 'Player', ffUid: t.ffUid || '' }))
  ];

  if (fee > 0 && balance < fee) { toast('warning','Insufficient Balance', ''); openAddBalance(); return; }

  const confirmed = await new Promise(resolve => {
    openModal({
      title: 'Confirm Team Join',
      bodyHTML: `
        <div style="text-align:center;margin-bottom:14px"><i class="fa-solid fa-users" style="font-size:2.5rem;color:var(--ac2)"></i></div>
        <div class="room-box mb-3">
          <div class="room-row"><span class="rk">Match</span><span style="font-weight:600">${esc(m.title||'')}</span></div>
          <div class="room-row"><span class="rk">Team Size</span><span style="font-weight:600">${allPlayers.length} Players</span></div>
          <div class="room-row"><span class="rk">Entry Fee</span><span style="font-weight:600">${fee > 0 ? fmtMoney(fee) : 'FREE'}</span></div>
        </div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--txm);margin-bottom:8px">Players</div>
        ${allPlayers.map((p,i) => `<div class="member-row"><div class="member-avatar">${esc((p.name||'P').charAt(0).toUpperCase())}</div><div style="flex:1"><b style="font-size:.9rem">${esc(p.name)}</b><small style="display:block;font-size:.72rem;color:var(--txm)">Slot ${i+1}${i===0?' · Leader':''}</small></div></div>`).join('')}
        <div class="alert info mt-3" style="margin-bottom:0"><i class="fa-solid fa-info-circle"></i><span>Entry fee is deducted from <b>your wallet</b>. All ${allPlayers.length} players will be registered.</span></div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-check"></i> Confirm & Join</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-x="c"]').onclick = () => { close(); resolve(false); };
        el.querySelector('[data-x="ok"]').onclick = () => { close(); resolve(true); };
      }
    });
  });

  if (!confirmed) return;
  await executeTeamJoin(matchId, m, teamSize, teamId, team, allPlayers, fee);
}

function showTeammatePicker(candidates) {
  return new Promise(resolve => {
    if (!candidates.length) { resolve(null); return; }
    openModal({
      title: 'Select Teammate',
      bodyHTML: `<div style="display:flex;flex-direction:column;gap:6px">${candidates.map(c => `<div class="member-row" data-pick="${esc(c.uid)}" style="cursor:pointer;padding:12px;background:var(--sf2);border-radius:var(--rm);border:1px solid var(--bd);margin-bottom:4px"><div class="member-avatar">${esc((c.name||'P').charAt(0).toUpperCase())}</div><div style="flex:1"><b style="font-size:.9rem">${esc(c.name || 'Player')}</b>${c.ffUid ? `<small style="display:block;font-size:.72rem;color:var(--txm)">UID: ${esc(c.ffUid)}</small>` : ''}</div><i class="fa-solid fa-circle-check" style="color:var(--ac2)"></i></div>`).join('')}</div>`,
      footerHTML: `<button class="btn btn-ghost w-100" data-x="c">Cancel</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-x="c"]').onclick = () => { close(); resolve(null); };
        el.querySelectorAll('[data-pick]').forEach(item => {
          item.onclick = () => {
            const pickedUid = item.dataset.pick;
            const picked = candidates.find(c => c.uid === pickedUid);
            close();
            resolve(picked || null);
          };
        });
      }
    });
  });
}

async function executeTeamJoin(matchId, m, teamSize, teamId, team, allPlayers, fee) {
  const uid = State.user.uid;
  const operationId = 'teamjoin_' + matchId + '_' + uid + '_' + Date.now();

  try {
    // capacity is the number of match slots/teams, not the number of players.
    const slotCapacity = getMatchSlotCapacity(m);
    const slotResult = await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredSlotCount'), cur => {
      const next = (Number(cur) || 0) + 1;
      if (next > slotCapacity) return;
      return next;
    });
    if (!slotResult.committed) { toast('error','Match Full','All team slots are already assigned.'); return; }
    const assignedTeamSlot = Number(slotResult.snapshot.val());

    if (fee > 0) {
      const wResult = await runTransaction(ref(db, 'wallets/' + uid + '/balance'), cur => {
        const curr = Number(cur) || 0;
        if (curr < fee) return;
        return curr - fee;
      });
      if (!wResult.committed) {
        await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredSlotCount'), cur => Math.max(0, (Number(cur)||0) - 1));
        toast('error','Insufficient Balance',''); openAddBalance(); return;
      }
    }
    await runTransaction(ref(db, 'tournaments/' + matchId + '/registeredCount'), cur => (Number(cur)||0) + teamSize);
    const regIds = [];
    for (let i = 0; i < allPlayers.length; i++) {
      const p = allPlayers[i];
      const regRef = push(ref(db, 'registrations'));
      regIds.push(regRef.key);
      const regData = {
        id: regRef.key, matchId, matchTitle: m.title || '', matchMode: m.mode || '',
        teamId, teamName: team.name || '', teamSize,
        userId: p.uid, userName: p.name, userFfUid: p.ffUid || '',
        entryFee: i === 0 ? fee : 0,
        paidBy: uid,
        payerId: uid,
        joinedBy: uid,
        teamLeaderId: team.leaderId || null,
        teamMemberUids: allPlayers.map(player => player.uid),
        teamSlotIndex: assignedTeamSlot,
        slotIndex: assignedTeamSlot,
        teamMemberIndex: i + 1,
        isEntryPayer: p.uid === uid,
        status: 'confirmed', operationId, createdAt: Date.now()
      };
      await set(regRef, regData);
      await set(ref(db, 'userRegistrations/' + p.uid + '/' + matchId), { regId: regRef.key, status: 'confirmed', matchTitle: m.title || '', teamId, createdAt: Date.now() });

      if (p.uid !== uid) {
        const notifRef = push(ref(db, 'notifications/' + p.uid));
        await set(notifRef, { id: notifRef.key, type: 'registration', title: 'Team Registration', body: `Your team "${team.name}" registered you for "${m.title}".`, matchId, read: false, createdAt: Date.now() });
      }
    }

    if (fee > 0) {
      const txRef = push(ref(db, 'walletTransactions'));
      await set(txRef, { id: txRef.key, userId: uid, type: 'entry_fee', amount: -fee, currency: 'INR', relatedId: matchId, status: 'completed', idempotencyKey: operationId, createdAt: Date.now() });
    }
    
    // 🔥 FIX: Save credentials silently
    await ensureRoomCredentials(matchId, m);

    const notifRef = push(ref(db, 'notifications/' + uid));
    await set(notifRef, { id: notifRef.key, type: 'registration', title: 'Team Joined Match', body: `Your team joined "${m.title}" with ${allPlayers.length} players.`, matchId, read: false, createdAt: Date.now() });

    toast('success','Team Registered!', `${allPlayers.length} players joined.`);
    navigate('mymatches');
  } catch(e) { toast('error','Join Failed', e.message || ''); }
}

async function loadMyTeam() {
  const uid = State.user.uid;
  try {
    const utSnap = await get(ref(db, 'userTeams/' + uid));
    if (utSnap.exists()) {
      const { teamId, role } = utSnap.val();
      const teamSnap = await get(ref(db, 'teams/' + teamId));
      if (teamSnap.exists()) {
        State.myTeam = { ...teamSnap.val(), teamId }; State.teamRole = role;
        // Refresh member avatar/name from the same publicProfiles source used by Leaderboard.
        const memberIds = Object.keys(State.myTeam.members || {});
        await Promise.all(memberIds.map(async (memberUid) => {
          try {
            const profileSnap = await get(ref(db, 'publicProfiles/' + memberUid));
            const profile = profileSnap.exists() ? profileSnap.val() : {};
            const current = State.myTeam.members[memberUid] || {};
            State.myTeam.members[memberUid] = {
              ...current,
              uid: memberUid,
              name: profile.displayName || current.name || 'Player',
              photoUrl: profile.photoUrl || current.photoUrl || '',
              profileEmoji: profile.profileEmoji || current.profileEmoji || '',
              ffUid: profile.freeFireUid || current.ffUid || ''
            };
          } catch (_) {}
        }));
        const walletSnap = await get(ref(db, 'teamWallets/' + teamId));
        State.teamWalletData = walletSnap.exists() ? walletSnap.val() : { balance: 0, transactions: {}, matchHistory: {} };
      } else { State.myTeam = null; State.teamRole = null; State.teamWalletData = null; }
    } else { State.myTeam = null; State.teamRole = null; State.teamWalletData = null; }

    const invSnap = await get(ref(db, 'teamInvites/' + uid));
    const invites = [];
    invSnap.forEach(c => { const v = c.val(); if (isObj(v) && v.status === 'pending') { v.id = c.key; invites.push(v); } });
    State.myTeamInvites = invites;
  } catch(e) { console.warn('loadMyTeam', e); }
  renderMyTeam();
}

function renderMyTeam() {
  const host = $('#myTeamContent');
  if (!host) return;

  const team = State.myTeam;
  const role = State.teamRole;
  const invites = State.myTeamInvites || [];

  let html = '';

  if (invites.length && !team) {
    html += `<div class="card mb-3" style="border-left:4px solid var(--ac)"><div class="card-head"><h3><i class="fa-solid fa-envelope" style="color:var(--ac2)"></i> Team Invites (${invites.length})</h3></div>`;
    invites.forEach(inv => {
      html += `<div class="member-row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
        <div class="member-avatar">${esc((inv.teamName||'T').charAt(0).toUpperCase())}</div>
        <div style="flex:1"><b style="font-size:.9rem">${esc(inv.teamName||'Team')}</b><small style="display:block;font-size:.72rem;color:var(--txm)">Invited by ${esc(inv.fromName||'Leader')}</small></div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-outline" data-decline="${esc(inv.id)}">Decline</button>
          <button class="btn btn-sm btn-primary" data-accept="${esc(inv.id)}">Accept</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (!team) {
    html += `<div class="card mb-3">
      <div class="card-head"><h3><i class="fa-solid fa-users" style="color:var(--ac2)"></i> Create Your Team</h3></div>
      <p style="font-size:.85rem">Create a free squad of up to 4 players. Get a <b>7-Day Free Trial</b> on your first team! After trial, a ₹5/month pass is required for Duo & Squad tournaments.</p>
      <div class="field"><label>Team Name <span class="req">*</span></label><input type="text" id="newTeamName" class="input" placeholder="e.g. Punjab Warriors" maxlength="30"></div>
      <button class="btn btn-primary btn-block" id="createTeamBtn"><i class="fa-solid fa-plus"></i> Create Team (Free)</button>
    </div>`;
    host.innerHTML = html;

    const createBtn = host.querySelector('#createTeamBtn');
    if (createBtn) createBtn.onclick = () => {
      const name = host.querySelector('#newTeamName').value.trim();
      if (name.length < 2) { toast('warning','Name Too Short',''); return; }
      createTeam(name);
    };
    host.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => acceptTeamInvite(b.dataset.accept));
    host.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => declineTeamInvite(b.dataset.decline));
    return;
  }

  const members = Object.values(team.members || {});
  const passExpiry = Number(team.maintenanceExpiry || 0);
  const passActive = passExpiry > Date.now();
  const daysLeft = passActive ? Math.ceil((passExpiry - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
  const isLeader = role === 'leader';

  const logoHTML = team.logo && team.logo.startsWith('data:image')
    ? `<img src="${team.logo}" alt="logo">`
    : esc((team.name || 'T').charAt(0).toUpperCase());

  html += `<div class="card mb-3">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
      <div class="team-logo">${logoHTML}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:1.15rem;font-weight:700;word-break:break-word">${esc(team.name||'Team')}</div>
        <div style="font-size:.75rem;color:var(--txm);margin-top:2px">${isLeader ? '<i class="fa-solid fa-crown" style="color:#fbbf24"></i> You are Leader' : '<i class="fa-solid fa-user"></i> Member'} · ${members.length}/${TEAM_MAX_MEMBERS} Players</div>
        ${team.isTrial && passActive ? '<span class="badge approved mt-2" style="font-size:.6rem;padding:2px 6px;">7-Day Free Trial Active</span>' : ''}
      </div>
      ${isLeader ? `<button class="icon-btn" id="editTeamBtn" style="width:36px;height:36px;font-size:.85rem"><i class="fa-solid fa-pen"></i></button>` : ''}
    </div>
    <div class="room-box" style="margin-top:0">
      <div class="room-row"><span class="rk">Maintenance Pass</span><span class="rv" style="font-family:inherit;letter-spacing:normal;color:${passActive?'var(--ok)':'var(--er)'}">${passActive ? `✓ Active · ${daysLeft} Day${daysLeft>1?'s':''} Remaining` : '✗ Locked · Pass Expired'}</span></div>
      <div class="room-row"><span class="rk">Team ID</span><span class="rv" style="font-size:.75rem">${esc(team.teamId||'')}</span></div>
    </div>
    ${passActive ? '' : '<div class="alert warning mt-3" style="margin-bottom:0"><i class="fa-solid fa-lock"></i><span>Duo & Squad matches are locked. Purchase the ₹5 monthly pass to unlock.</span></div>'}
  </div>`;

  // Team Wallet is shared by Duo/Squad results. All members can view it; only leader can transfer.
  const tw = State.teamWalletData || {};
  const teamBalance = Math.max(0, Number(tw.balance || tw.availableBalance || 0));
  const allTeamTx = Object.entries(tw.transactions || {}).map(([id, tx]) => ({ id, ...(tx || {}) }))
    .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const teamHistory = tw.matchHistory || {};
  const duoHistory = Object.entries(teamHistory.duo || {}).map(([id, x]) => ({ id, ...(x || {}) })).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,3);
  const squadHistory = Object.entries(teamHistory.squad || {}).map(([id, x]) => ({ id, ...(x || {}) })).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,3);
  const txLabel = (tx) => tx.type === 'match_earning' ? 'Match earning' : tx.type === 'leader_transfer' ? (tx.fromUid === State.user.uid ? 'Sent by you' : `Transfer to ${tx.toName || 'member'}`) : (tx.description || 'Team wallet transaction');
  html += `<div class="card mb-3" id="teamWalletCard">
    <div class="flex-between" style="align-items:flex-start"><div><div style="font-size:.8rem;color:var(--txm)"><i class="fa-solid fa-wallet"></i> TEAM WALLET</div><div style="font-size:1.8rem;font-weight:800;color:var(--ok);margin-top:4px">${fmtMoney(teamBalance)}</div><small style="color:var(--txm)">Live shared team balance · visible to all members</small></div><span class="badge approved">${isLeader ? 'Leader access' : 'View only'}</span></div>
    ${isLeader ? `<button class="btn btn-primary btn-block mt-3" id="teamSendMoneyBtn"><i class="fa-solid fa-paper-plane"></i> Send Money</button>` : `<p class="mt-3" style="font-size:.78rem;margin-bottom:0">Only the Team Leader can transfer money.</p>`}
    <div class="mt-3" style="border-top:1px solid var(--bd);padding-top:12px"><b style="font-size:.88rem">Recent Match Earnings</b><div class="grid grid-2 mt-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="room-box"><b>Duo</b><div style="font-size:1.1rem;color:var(--ok);font-weight:700">${fmtMoney(duoHistory.reduce((n,x)=>n+Number(x.totalEarnings ?? x.amount ?? 0),0))}</div><small>Latest 3 matches</small></div><div class="room-box"><b>Squad</b><div style="font-size:1.1rem;color:var(--ok);font-weight:700">${fmtMoney(squadHistory.reduce((n,x)=>n+Number(x.totalEarnings ?? x.amount ?? 0),0))}</div><small>Latest 3 matches</small></div></div></div>
  </div>`;

  const renderTeamMatchHistory = (items, label) => `<div class="card mb-3"><div class="card-head"><h3><i class="fa-solid fa-trophy" style="color:var(--ac2)"></i> ${label} Match History <small style="color:var(--txm);font-size:.68rem">(Latest 3)</small></h3></div>${items.length ? items.map(x=>`<div class="member-row" style="display:block"><div class="flex-between"><b>${esc(x.matchTitle || x.title || (label+' Match'))}</b><strong style="color:var(--ok)">${fmtMoney(x.totalEarnings ?? x.amount ?? 0)}</strong></div><small style="display:block;color:var(--txm)">${fmtDateTime(x.createdAt || x.playedAt)}</small><small style="display:block;margin-top:4px">Players: ${esc((Array.isArray(x.players) ? x.players.map(p=>typeof p==='string'?p:(p.name||p.uid)) : []).join(', ') || x.playerNames || 'Details unavailable')}</small></div>`).join('') : `<div class="empty-state" style="padding:14px"><p>No ${label} match history yet.</p></div>`}</div>`;
  html += renderTeamMatchHistory(duoHistory, 'Duo');
  html += renderTeamMatchHistory(squadHistory, 'Squad');

  html += `<div class="card mb-3"><div class="card-head"><h3><i class="fa-solid fa-receipt" style="color:var(--ac2)"></i> Team Wallet Transactions</h3><small style="color:var(--txm)">Full history</small></div>${allTeamTx.length ? allTeamTx.map(tx=>`<div class="member-row"><div style="flex:1;min-width:0"><b style="font-size:.84rem">${esc(txLabel(tx))}</b><small style="display:block;color:var(--txm)">${fmtDateTime(tx.createdAt)}${tx.fromName ? ' · From '+esc(tx.fromName) : ''}${tx.toName ? ' · To '+esc(tx.toName) : ''}</small>${tx.note ? `<small style="display:block;color:var(--txm)">${esc(tx.note)}</small>` : ''}</div><b style="color:${Number(tx.amount||0)>=0?'var(--ok)':'var(--er)'}">${Number(tx.amount||0)>=0?'+':''}${fmtMoney(tx.amount||0)}</b></div>`).join('') : `<div class="empty-state" style="padding:14px"><p>No team wallet transactions yet.</p></div>`}</div>`;

  html += `<div class="card mb-3">
    <div class="card-head"><h3><i class="fa-solid fa-users" style="color:var(--ac2)"></i> Members</h3>
    ${isLeader && members.length < TEAM_MAX_MEMBERS ? `<button class="btn btn-sm btn-primary" id="inviteMemberBtn"><i class="fa-solid fa-user-plus"></i> Invite</button>` : ''}
    </div>`;

  members.forEach(mem => {
    const isTeamLeader = mem.uid === team.leaderId;
    const avatarHtml = getAvatarHTML(mem.photoUrl, mem.profileEmoji, mem.name);
    html += `<div class="member-row">
      <div class="member-avatar">${avatarHtml}</div>
      <div style="flex:1;min-width:0">
        <b style="font-size:.9rem;display:block">${esc(mem.name||'Player')} ${isTeamLeader ? '<span style="font-size:.65rem;color:#fbbf24;background:rgba(251,191,36,.15);padding:1px 6px;border-radius:6px;margin-left:4px">LEADER</span>' : ''}</b>
        ${mem.ffUid ? `<small style="display:block;font-size:.72rem;color:var(--txm)">UID: ${esc(mem.ffUid)}</small>` : ''}
      </div>
      ${isLeader && !isTeamLeader ? `<div style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" data-make-leader="${esc(mem.uid)}" title="Make Leader"><i class="fa-solid fa-crown"></i></button><button class="btn btn-sm" style="background:var(--ers);color:var(--er);padding:6px 10px" data-kick="${esc(mem.uid)}" title="Remove Member"><i class="fa-solid fa-user-minus"></i></button></div>` : ''}
    </div>`;
  });

  html += `</div>`;

  html += `<div class="card mb-3">
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary btn-block" id="buyPassBtn2"><i class="fa-solid fa-crown"></i> ${passActive ? 'Extend Pass (+30 Days)' : 'Buy Maintenance Pass (₹5)'}</button>
      ${isLeader ? `<button class="btn btn-outline btn-block" id="disbandTeamBtn" style="color:var(--er);border-color:var(--er)"><i class="fa-solid fa-trash"></i> Disband Team</button>` : `<button class="btn btn-outline btn-block" id="leaveTeamBtn" style="color:var(--er);border-color:var(--er)"><i class="fa-solid fa-right-from-bracket"></i> Leave Team</button>`}
    </div>
  </div>`;

  host.innerHTML = html;

  host.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => kickTeamMember(b.dataset.kick));
  host.querySelectorAll('[data-make-leader]').forEach(b => b.onclick = () => transferTeamLeadership(b.dataset.makeLeader));
  const editBtn = host.querySelector('#editTeamBtn');
  if (editBtn) editBtn.onclick = () => editTeamInfo();
  const inviteBtn = host.querySelector('#inviteMemberBtn');
  if (inviteBtn) inviteBtn.onclick = () => openTeamInviteModal();
  const sendMoneyBtn = host.querySelector('#teamSendMoneyBtn');
  if (sendMoneyBtn) sendMoneyBtn.onclick = () => openTeamWalletTransferModal();
  const passBtn = host.querySelector('#buyPassBtn2');
  if (passBtn) passBtn.onclick = () => buyTeamMaintenancePass(team.teamId);
  const disbandBtn = host.querySelector('#disbandTeamBtn');
  if (disbandBtn) disbandBtn.onclick = () => disbandTeam();
  const leaveBtn = host.querySelector('#leaveTeamBtn');
  if (leaveBtn) leaveBtn.onclick = () => leaveTeam();
}

async function openTeamWalletTransferModal() {
  const team = State.myTeam;
  if (!team || State.teamRole !== 'leader' || team.leaderId !== State.user.uid) { toast('error','Leader Only','Only the current Team Leader can send money.'); return; }
  const members = Object.values(team.members || {});
  const options = members.map(m => `<option value="${esc(m.uid)}">${esc(m.name || 'Player')} · UID ${esc(m.ffUid || m.uid)}</option>`).join('');
  openModal({
    title: 'Send Team Wallet Money',
    bodyHTML: `<div class="alert info"><i class="fa-solid fa-shield-halved"></i><span>All team members can see this transfer in the full Team Wallet transaction history. You may send money to yourself too.</span></div><div class="field"><label>Choose recipient</label><select class="select" id="teamTransferRecipient">${options}</select></div><div class="field"><label>Amount (₹)</label><input class="input" id="teamTransferAmount" type="number" min="1" step="0.01" placeholder="Enter amount"></div><div class="field"><label>Note (optional)</label><input class="input" id="teamTransferNote" maxlength="100" placeholder="Payment note"></div><small style="color:var(--txm)">Available: ${fmtMoney(Number(State.teamWalletData?.balance || 0))}</small>`,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" id="teamTransferConfirm">Send</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="c"]').onclick = close;
      el.querySelector('#teamTransferConfirm').onclick = async () => {
        const recipientUid = el.querySelector('#teamTransferRecipient').value;
        const amount = Math.round(Number(el.querySelector('#teamTransferAmount').value) * 100) / 100;
        const note = el.querySelector('#teamTransferNote').value.trim();
        if (!recipientUid || !Number.isFinite(amount) || amount <= 0) { toast('warning','Invalid Amount','Enter a valid amount greater than zero.'); return; }
        const btn = el.querySelector('#teamTransferConfirm'); btn.disabled = true; btn.textContent = 'Sending…';
        try {
          await transferFromTeamWallet(recipientUid, amount, note);
          close(); toast('success','Money Sent',`${fmtMoney(amount)} transferred successfully.`); await loadMyTeam();
        } catch(e) { btn.disabled = false; btn.textContent = 'Send'; toast('error','Transfer Failed',e.message || 'Please try again.'); }
      };
    }
  });
}

async function transferFromTeamWallet(recipientUid, amount, note) {
  const team = State.myTeam; const leaderUid = State.user.uid; const teamId = team?.teamId;
  if (!teamId || State.teamRole !== 'leader' || team.leaderId !== leaderUid) throw new Error('Only the current team leader can transfer funds.');
  if (!team.members?.[recipientUid]) throw new Error('Recipient is not a current team member.');
  const transferRef = push(ref(db, 'teamWallets/' + teamId + '/transactions'));
  const transferId = transferRef.key; const now = Date.now();
  const recipient = team.members[recipientUid];
  // Reserve/deduct once and record a pending ledger item. The recipient credit is idempotent by transferId.
  const reserve = await runTransaction(ref(db, 'teamWallets/' + teamId), current => {
    if (!current) current = { balance: 0, transactions: {}, matchHistory: {} };
    const balance = Number(current.balance || current.availableBalance || 0);
    if (balance < amount) return;
    current.balance = Math.round((balance - amount) * 100) / 100;
    current.transactions = current.transactions || {};
    current.transactions[transferId] = { id: transferId, type: 'leader_transfer', amount: -amount, fromUid: leaderUid, fromName: State.profile?.displayName || 'Leader', toUid: recipientUid, toName: recipient.name || 'Player', note, status: 'pending_credit', createdAt: now };
    return current;
  });
  if (!reserve.committed) throw new Error('Insufficient Team Wallet balance.');
  try {
    const walletResult = await runTransaction(ref(db, 'wallets/' + recipientUid), current => {
      current = current || {};
      current.teamTransfers = current.teamTransfers || {};
      if (current.teamTransfers[transferId]) return current;
      current.balance = Math.round(((Number(current.balance) || 0) + amount) * 100) / 100;
      current.teamTransfers[transferId] = { teamId, amount, createdAt: now };
      return current;
    });
    if (!walletResult.committed) throw new Error('Recipient wallet credit could not be confirmed.');
    await update(ref(db, 'teamWallets/' + teamId + '/transactions/' + transferId), { status: 'completed' });
    const personalTx = push(ref(db, 'walletTransactions'));
    await set(personalTx, { id: personalTx.key, userId: recipientUid, type: 'team_wallet_transfer', amount, currency: 'INR', relatedId: teamId, relatedTransferId: transferId, status: 'completed', createdAt: now });
    const notif = push(ref(db, 'notifications/' + recipientUid));
    await set(notif, { id: notif.key, type: 'team_wallet_transfer', title: 'Team Wallet Payment Received', body: `${fmtMoney(amount)} received from ${State.profile?.displayName || 'Team Leader'}.`, read: false, createdAt: now });
  } catch (err) {
    // Keep the pending ledger record so the transfer is visible and can be reconciled; do not silently refund/duplicate.
    throw new Error('Team balance was reserved, but recipient credit needs reconciliation. Contact Admin before retrying. ' + (err.message || ''));
  }
}

async function createTeam(name) {
  const uid = State.user.uid;
  try {
    const utSnap = await get(ref(db, 'userTeams/' + uid));
    if (utSnap.exists()) { toast('error','Already in a team',''); return; }

    const userSnap = await get(ref(db, 'users/' + uid));
    let hasUsedTrial = false;
    if (userSnap.exists()) {
      hasUsedTrial = userSnap.val().hasUsedTeamTrial || false;
    }
    
    const isTrial = !hasUsedTrial;
    const teamRef = push(ref(db, 'teams'));
    const teamId = teamRef.key;
    const now = Date.now();
    
    const maintenanceExpiry = isTrial ? (now + TEAM_TRIAL_DURATION_MS) : 0;

    const member = { uid, name: State.profile.displayName || 'Player', ffUid: State.profile.freeFireUid || '', photoUrl: State.profile.photoUrl || '', profileEmoji: State.profile.profileEmoji || '', joinedAt: now, role: 'leader' };
    const teamData = {
      teamId, name, logo: '',
      leaderId: uid, leaderName: State.profile.displayName || 'Player',
      members: { [uid]: member },
      maintenanceExpiry: maintenanceExpiry,
      isTrial: isTrial,
      createdAt: now, updatedAt: now
    };
    await set(teamRef, teamData);
    await set(ref(db, 'userTeams/' + uid), { teamId, role: 'leader', joinedAt: now });
    
    if (isTrial) {
      await update(ref(db, 'users/' + uid), { hasUsedTeamTrial: true });
    }

    State.myTeam = { ...teamData };
    State.teamRole = 'leader';
    renderMyTeam();
    toast('success', isTrial ? 'Team Created! 7-Day Trial Active.' : 'Team Created!', '');
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function openTeamInviteModal() {
  if (!State.myTeam) return;
  if (State.teamRole !== 'leader') { toast('error','Leader Only',''); return; }
  const team = State.myTeam;
  const members = Object.values(team.members || {});
  if (members.length >= TEAM_MAX_MEMBERS) { toast('warning','Team Full',''); return; }

  let users = [];
  try {
    const snap = await get(ref(db, 'publicProfiles'));
    snap.forEach(c => { const v = c.val(); if (isObj(v) && v.uid !== State.user.uid) users.push({ uid: c.key, ...v }); });
  } catch(e) {}

  const memberUids = new Set(members.map(m => m.uid));

  openModal({
    title: 'Invite Players',
    bodyHTML: `
      <div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="inviteSearch" placeholder="Search by name…"></div>
      <div id="inviteResults" style="max-height:400px;overflow-y:auto"></div>
    `,
    footerHTML: `<button class="btn btn-ghost w-100" data-x="c">Close</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="c"]').onclick = close;
      const searchInput = el.querySelector('#inviteSearch');
      const resultsHost = el.querySelector('#inviteResults');

      const renderResults = (q) => {
        const filtered = users.filter(u => !memberUids.has(u.uid) && (u.displayName || '').toLowerCase().includes(q));
        if (!filtered.length) { resultsHost.innerHTML = `<div class="empty-state"><p>No players found.</p></div>`; return; }
        resultsHost.innerHTML = filtered.slice(0, 30).map(u => {
          const avatarHtml = getAvatarHTML(u.photoUrl, u.profileEmoji, u.displayName);
          return `
          <div class="member-row" style="padding:10px 0">
            <div class="member-avatar">${avatarHtml}</div>
            <div style="flex:1;min-width:0"><b style="font-size:.88rem">${esc(u.displayName||'Player')}</b>${u.freeFireUid ? `<small style="display:block;font-size:.7rem;color:var(--txm)">UID: ${esc(u.freeFireUid)}</small>` : ''}</div>
            <button class="btn btn-sm btn-primary" data-invite="${esc(u.uid)}">Invite</button>
          </div>
        `}).join('');
        resultsHost.querySelectorAll('[data-invite]').forEach(b => {
          b.onclick = async () => { b.disabled = true; await sendTeamInvite(b.dataset.invite); b.textContent = 'Sent'; };
        });
      };

      searchInput.oninput = () => renderResults(searchInput.value.trim().toLowerCase());
      renderResults('');
    }
  });
}

async function sendTeamInvite(targetUid) {
  if (!State.myTeam) return;
  if (State.teamRole !== 'leader') { toast('error','Leader Only',''); return; }
  try {
    const utSnap = await get(ref(db, 'userTeams/' + targetUid));
    if (utSnap.exists()) { toast('warning','Already in a team','That player is already in another team.'); return; }

    const invRef = push(ref(db, 'teamInvites/' + targetUid));
    await set(invRef, {
      id: invRef.key, teamId: State.myTeam.teamId, teamName: State.myTeam.name,
      fromUid: State.user.uid, fromName: State.profile.displayName || 'Leader',
      toUid: targetUid, status: 'pending', createdAt: Date.now()
    });

    const notifRef = push(ref(db, 'notifications/' + targetUid));
    await set(notifRef, { id: notifRef.key, type: 'team_invite', title: '🎮 Team Invitation', body: `${State.profile.displayName || 'Leader'} invited you to join "${State.myTeam.name}". Open My Team to accept.`, read: false, createdAt: Date.now() });

    toast('success','Invite Sent','');
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function acceptTeamInvite(inviteId) {
  const uid = State.user.uid;
  try {
    const invSnap = await get(ref(db, 'teamInvites/' + uid + '/' + inviteId));
    if (!invSnap.exists()) { toast('error','Invite not found',''); return; }
    const inv = invSnap.val();
    if (inv.status !== 'pending') { toast('warning','Already handled',''); return; }

    const utSnap = await get(ref(db, 'userTeams/' + uid));
    if (utSnap.exists()) { toast('error','Already in a team',''); return; }

    const teamSnap = await get(ref(db, 'teams/' + inv.teamId));
    if (!teamSnap.exists()) { toast('error','Team not found',''); return; }
    const team = teamSnap.val();
    const members = Object.values(team.members || {});
    if (members.length >= TEAM_MAX_MEMBERS) { toast('error','Team is full',''); return; }

    const now = Date.now();
    const memberData = { uid, name: State.profile.displayName || 'Player', ffUid: State.profile.freeFireUid || '', photoUrl: State.profile.photoUrl || '', profileEmoji: State.profile.profileEmoji || '', joinedAt: now, role: 'member' };
    await update(ref(db, 'teams/' + inv.teamId + '/members/' + uid), memberData);
    await update(ref(db, 'teams/' + inv.teamId), { updatedAt: now });
    await set(ref(db, 'userTeams/' + uid), { teamId: inv.teamId, role: 'member', joinedAt: now });
    await update(ref(db, 'teamInvites/' + uid + '/' + inviteId), { status: 'accepted' });

    const notifRef = push(ref(db, 'notifications/' + team.leaderId));
    await set(notifRef, { id: notifRef.key, type: 'team_join', title: 'New Team Member', body: `${State.profile.displayName || 'Player'} joined your team "${team.name}".`, read: false, createdAt: now });

    toast('success','Joined Team!','');
    await loadMyTeam();
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function declineTeamInvite(inviteId) {
  const uid = State.user.uid;
  try {
    await update(ref(db, 'teamInvites/' + uid + '/' + inviteId), { status: 'declined' });
    toast('info','Declined','');
    await loadMyTeam();
  } catch(e) { toast('error','Failed',''); }
}

async function transferTeamLeadership(newLeaderUid) {
  const team = State.myTeam; const oldLeaderUid = State.user.uid;
  if (!team || State.teamRole !== 'leader' || team.leaderId !== oldLeaderUid) { toast('error','Leader Only',''); return; }
  if (!team.members?.[newLeaderUid] || newLeaderUid === oldLeaderUid) return;
  const newName = team.members[newLeaderUid].name || 'selected member';
  if (!await confirmDialog('Transfer Leadership', `Make ${newName} the new Team Leader? You will become a normal member and may then leave the team.`, true)) return;
  try {
    const now = Date.now();
    await update(ref(db, 'teams/' + team.teamId), { leaderId: newLeaderUid, leaderName: newName, ['members/' + oldLeaderUid + '/role']: 'member', ['members/' + newLeaderUid + '/role']: 'leader', updatedAt: now });
    await update(ref(db, 'userTeams/' + oldLeaderUid), { role: 'member' });
    await update(ref(db, 'userTeams/' + newLeaderUid), { role: 'leader' });
    const notif = push(ref(db, 'notifications/' + newLeaderUid));
    await set(notif, { id: notif.key, type: 'team_leadership', title: 'You are the Team Leader', body: `You are now the leader of ${team.name}. Team wallet and history remain unchanged.`, read: false, createdAt: now });
    toast('success','Leadership Transferred',`${newName} is now the Team Leader.`);
    await loadMyTeam();
  } catch(e) { toast('error','Transfer Failed',e.message || ''); }
}

async function kickTeamMember(memberUid) {
  if (!State.myTeam || State.teamRole !== 'leader') { toast('error','Leader Only',''); return; }
  if (memberUid === State.user.uid) { toast('error','Cannot kick yourself',''); return; }
  const memberName = State.myTeam.members?.[memberUid]?.name || 'this member';
  if (!await confirmDialog('Remove Member', `Remove ${memberName} from the team?`, true)) return;
  try {
    await remove(ref(db, 'teams/' + State.myTeam.teamId + '/members/' + memberUid));
    await remove(ref(db, 'userTeams/' + memberUid));
    await update(ref(db, 'teams/' + State.myTeam.teamId), { updatedAt: Date.now() });
    const notifRef = push(ref(db, 'notifications/' + memberUid));
    await set(notifRef, { id: notifRef.key, type: 'team_kick', title: 'Removed from Team', body: `You were removed from "${State.myTeam.name}".`, read: false, createdAt: Date.now() });
    toast('success','Member Removed','');
    await loadMyTeam();
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function buyTeamMaintenancePass(teamId) {
  if (!State.myTeam || State.myTeam.teamId !== teamId) { toast('error','Team error',''); return; }
  const balance = Number(State.wallet.balance || 0);
  if (balance < TEAM_PASS_PRICE) {
    toast('warning','Insufficient Balance', `You need at least ₹${TEAM_PASS_PRICE} to buy the pass.`);
    openAddBalance();
    return;
  }

  const team = State.myTeam;
  const currentExpiry = Number(team.maintenanceExpiry || 0);
  const newExpiry = Math.max(Date.now(), currentExpiry) + TEAM_PASS_DURATION_MS;

  const confirmed = await confirmDialog(
    'Buy Maintenance Pass',
    `Pay ₹${TEAM_PASS_PRICE} from your wallet to ${currentExpiry > Date.now() ? 'extend' : 'activate'} the team pass for 30 days?`
  );
  if (!confirmed) return;

  try {
    const res = await runTransaction(ref(db, 'wallets/' + State.user.uid + '/balance'), (cur) => {
      const c = Number(cur) || 0;
      if (c < TEAM_PASS_PRICE) return;
      return c - TEAM_PASS_PRICE;
    });
    if (!res.committed) { toast('error','Failed','Insufficient balance.'); return; }

    await update(ref(db, 'teams/' + teamId), { maintenanceExpiry: newExpiry, isTrial: false, updatedAt: Date.now() });

    const txRef = push(ref(db, 'walletTransactions'));
    await set(txRef, { id: txRef.key, userId: State.user.uid, type: 'team_pass', amount: -TEAM_PASS_PRICE, currency: 'INR', relatedId: teamId, status: 'completed', createdAt: Date.now() });

    const memberUids = Object.keys(team.members || {});
    for (const muid of memberUids) {
      if (muid === State.user.uid) continue;
      const notifRef = push(ref(db, 'notifications/' + muid));
      await set(notifRef, { id: notifRef.key, type: 'team_pass', title: '🎉 Team Pass Activated', body: `Your team "${team.name}" now has an active maintenance pass for 30 days.`, read: false, createdAt: Date.now() });
    }

    toast('success','Pass Activated!', `Valid till ${fmtDate(newExpiry)}.`);
    await loadMyTeam();
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function editTeamInfo() {
  if (!State.myTeam || State.teamRole !== 'leader') { toast('error','Leader Only',''); return; }
  if (!isVipActive()) {
    openModal({
      title: 'VIP Required',
      bodyHTML: `<div style="text-align:center;padding:16px 0"><i class="fa-solid fa-crown" style="font-size:3rem;color:#fbbf24;margin-bottom:14px"></i><h3>Premium Feature</h3><p style="font-size:.9rem">Editing your team's name or uploading a team logo requires an active VIP subscription.</p></div>`,
      footerHTML: `<button class="btn btn-primary w-100" id="vipUpgradeBtn"><i class="fa-solid fa-crown"></i> Upgrade to VIP</button>`,
      onMount: (el, close) => { el.querySelector('#vipUpgradeBtn').onclick = () => { close(); setTimeout(()=>openVipStore(), 200); }; }
    });
    return;
  }

  const team = State.myTeam;
  const logoHTML = team.logo && team.logo.startsWith('data:image')
    ? `<img src="${team.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`
    : (team.name || 'T').charAt(0).toUpperCase();

  openModal({
    title: 'Edit Team',
    bodyHTML: `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div class="team-logo" id="teamLogoPreview">${logoHTML}</div>
        <div style="flex:1">
          <label for="teamLogoFile" class="btn btn-outline btn-sm" style="width:100%;cursor:pointer"><i class="fa-solid fa-cloud-arrow-up"></i> <span id="teamLogoLabel">Upload Logo</span></label>
          <input type="file" id="teamLogoFile" accept="image/*" style="display:none">
        </div>
      </div>
      <div class="field"><label>Team Name</label><input type="text" id="editTeamName" class="input" value="${esc(team.name||'')}" maxlength="30"></div>
      <div style="font-size:.72rem;color:var(--txm);margin-top:4px">* Upload a square image under 500KB for best results.</div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-floppy-disk"></i> Save</button>`,
    onMount: (el, close) => {
      let newLogoBase64 = null;
      const fileInput = el.querySelector('#teamLogoFile');
      const preview = el.querySelector('#teamLogoPreview');
      const label = el.querySelector('#teamLogoLabel');
      fileInput.onchange = (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        if (label) label.textContent = file.name.length > 16 ? file.name.substring(0,13)+'...' : file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target.result.length > 500 * 1024) { toast('error','Too Large','Image must be under 500KB.'); fileInput.value=''; if(label) label.textContent='Upload Logo'; return; }
          newLogoBase64 = e.target.result;
          preview.innerHTML = `<img src="${newLogoBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`;
        };
        reader.readAsDataURL(file);
      };
      el.querySelector('[data-x="c"]').onclick = close;
      el.querySelector('[data-x="ok"]').onclick = async () => {
        const newName = el.querySelector('#editTeamName').value.trim();
        if (newName.length < 2) { toast('error','Name Too Short',''); return; }
        try {
          const updates = { name: newName, updatedAt: Date.now() };
          if (newLogoBase64) updates.logo = newLogoBase64;
          await update(ref(db, 'teams/' + team.teamId), updates);
          State.myTeam = { ...State.myTeam, ...updates };
          toast('success','Team Updated','');
          close();
          renderMyTeam();
        } catch(e) { toast('error','Failed', e.message || ''); }
      };
    }
  });
}

async function disbandTeam() {
  if (!State.myTeam || State.teamRole !== 'leader') return;
  if (!await confirmDialog('Disband Team', 'This will remove all members and delete the team. Continue?', true)) return;
  try {
    const memberUids = Object.keys(State.myTeam.members || {});
    for (const muid of memberUids) {
      await remove(ref(db, 'userTeams/' + muid));
      if (muid !== State.user.uid) {
        const notifRef = push(ref(db, 'notifications/' + muid));
        await set(notifRef, { id: notifRef.key, type: 'team_disband', title: 'Team Disbanded', body: `Team "${State.myTeam.name}" has been disbanded by the leader.`, read: false, createdAt: Date.now() });
      }
    }
    await remove(ref(db, 'teams/' + State.myTeam.teamId));
    await remove(ref(db, 'teamWallets/' + State.myTeam.teamId));
    State.myTeam = null; State.teamRole = null; State.teamWalletData = null;
    toast('info','Team Disbanded','');
    renderMyTeam();
  } catch(e) { toast('error','Failed', e.message || ''); }
}

async function leaveTeam() {
  if (!State.myTeam) return;
  if (State.myTeam.leaderId === State.user.uid || State.teamRole === 'leader') { toast('warning','Transfer Leadership First','A Team Leader cannot leave directly. Transfer leadership to another member first.'); return; }
  if (!await confirmDialog('Leave Team', 'Leave this team?', true)) return;
  try {
    const teamId = State.myTeam.teamId;
    const leaderId = State.myTeam.leaderId;
    await remove(ref(db, 'teams/' + teamId + '/members/' + State.user.uid));
    await remove(ref(db, 'userTeams/' + State.user.uid));
    await update(ref(db, 'teams/' + teamId), { updatedAt: Date.now() });
    if (leaderId && leaderId !== State.user.uid) {
      const notifRef = push(ref(db, 'notifications/' + leaderId));
      await set(notifRef, { id: notifRef.key, type: 'team_leave', title: 'Member Left', body: `${State.profile.displayName || 'A member'} left your team.`, read: false, createdAt: Date.now() });
    }
    State.myTeam = null; State.teamRole = null;
    toast('info','Left Team','');
    renderMyTeam();
  } catch(e) { toast('error','Failed', e.message || ''); }
}

// ==========================================
// ⭐ LEADERBOARD — FINAL BULLETPROOF VERSION ⭐
// ==========================================
async function loadLeaderboardData() {
  const host = $('#lbContent');
  if (!host) return;
  host.innerHTML = `<div class="loading-center"><div class="spinner"></div>Loading leaderboard…</div>`;

  try {
    const resSnap = await get(ref(db, 'matchResults')).catch(()=>null);
    const regSnap = await get(ref(db, 'registrations')).catch(()=>null);
    const teamSnap = await get(ref(db, 'teams')).catch(()=>null);
    const ppSnap = await get(ref(db, 'publicProfiles')).catch(()=>null);

    const matchResults = {};
    if (resSnap && resSnap.exists()) {
      resSnap.forEach(c => { 
        const v = c.val(); 
        if (isObj(v) && (v.status === 'approved' || v.status === 'pending_approval')) {
            matchResults[c.key] = v; 
        }
      });
    }

    const regs = [];
    if (regSnap && regSnap.exists()) {
      regSnap.forEach(c => { const v = c.val(); if (isObj(v)) regs.push(v); });
    }

    const teamsMap = {};
    if (teamSnap && teamSnap.exists()) {
      teamSnap.forEach(c => { teamsMap[c.key] = c.val(); });
    }

    const profilesMap = {};
    if (ppSnap && ppSnap.exists()) {
      ppSnap.forEach(c => { profilesMap[c.key] = c.val(); });
    }

    const matchSizes = {};
    State.tournaments.forEach(t => { matchSizes[t.id] = Number(t.teamSize || 1); });

    const soloStats = {};
    const duoTeamStats = {};
    const squadTeamStats = {};

    regs.forEach(reg => {
      const res = matchResults[reg.matchId];
      if (!res || !res.entries || !res.entries[reg.userId]) return;
      
      const entry = res.entries[reg.userId];
      const reward = Number(entry.reward || 0);
      const kills = Number(entry.kills || 0);
      const rank = Number(entry.rank) || 0;
      const isWin = rank === 1;
      const uid = reg.userId;
      
      let size = matchSizes[reg.matchId] || Number(reg.teamSize) || 1;

      if (size === 1) {
        if (!soloStats[uid]) soloStats[uid] = { uid, name: reg.userName || 'Player', matches: 0, wins: 0, kills: 0, earnings: 0, photoUrl:'', profileEmoji:'' };
        soloStats[uid].matches++;
        soloStats[uid].kills += kills;
        soloStats[uid].earnings += reward;
        if (isWin) soloStats[uid].wins++;
        
        const pp = profilesMap[uid];
        if (pp) { 
          soloStats[uid].photoUrl = pp.photoUrl || ''; 
          soloStats[uid].profileEmoji = pp.profileEmoji || ''; 
          if (!soloStats[uid].name || soloStats[uid].name === 'Player') soloStats[uid].name = pp.displayName || reg.userName;
        }
      } 
      else if (size === 2 || size === 4) {
        const bucket = size === 2 ? duoTeamStats : squadTeamStats;
        const teamKey = reg.teamId || (reg.teamName ? 'name_' + reg.teamName : 'solo_' + uid); 
        
        if (!bucket[teamKey]) {
          const teamInfo = teamsMap[reg.teamId] || {};
          bucket[teamKey] = {
            teamId: reg.teamId || teamKey,
            teamName: reg.teamName || teamInfo.name || 'Unknown Team',
            teamLogo: teamInfo.logo || '',
            leaderId: teamInfo.leaderId || null,
            matchSet: new Set(),
            totalEarnings: 0,
            totalWins: 0,
            totalKills: 0,
            members: {}
          };
        }
        
        const T = bucket[teamKey];
        T.matchSet.add(reg.matchId);
        T.totalEarnings += reward;
        T.totalKills += kills;
        if (isWin) T.totalWins++;

        if (!T.members[uid]) {
          const pp = profilesMap[uid];
          T.members[uid] = {
            uid,
            name: reg.userName || pp?.displayName || 'Player',
            photoUrl: pp?.photoUrl || '',
            profileEmoji: pp?.profileEmoji || '',
            earnings: 0,
            kills: 0,
            wins: 0,
            matchSet: new Set()
          };
        }
        
        const M = T.members[uid];
        M.earnings += reward;
        M.kills += kills;
        if (isWin) M.wins++;
        M.matchSet.add(reg.matchId);
      }
    });

    const finalizeTeam = (bucket) => Object.values(bucket).map(t => {
      const membersArr = Object.values(t.members).map(m => ({
        uid: m.uid, 
        name: m.name, 
        photoUrl: m.photoUrl, 
        profileEmoji: m.profileEmoji,
        earnings: m.earnings, 
        kills: m.kills, 
        wins: m.wins, 
        matches: m.matchSet.size,
        isLeader: m.uid === t.leaderId || (t.members[m.uid] && Object.keys(t.members)[0] === m.uid)
      }));

      membersArr.sort((a, b) => {
        if (a.isLeader && !b.isLeader) return -1;
        if (!a.isLeader && b.isLeader) return 1;
        return b.earnings - a.earnings;
      });
      
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        teamLogo: t.teamLogo,
        leaderId: t.leaderId,
        matches: t.matchSet.size,
        wins: t.totalWins,
        kills: t.totalKills,
        earnings: t.totalEarnings,
        members: membersArr
      };
    }).sort((a, b) => b.earnings - a.earnings);

    const duoList = finalizeTeam(duoTeamStats);
    const squadList = finalizeTeam(squadTeamStats);
    const soloList = Object.values(soloStats).sort((a,b) => b.earnings - a.earnings);

    State.lbCache = {
      data: { solo: soloList, duo: duoList, squad: squadList },
      ts: Date.now()
    };

    renderLeaderboard();
  } catch(e) {
    console.warn("Leaderboard error:", e);
    host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Failed to load</h3><p style="font-size:0.8rem; margin-top:8px;">कृपया पेज को रिफ्रेश करें या बाद में देखें।</p></div>`;
  }
}

function renderLeaderboard() {
  const host = $('#lbContent');
  if (!host) return;
  const data = State.lbCache.data;
  if (!data) { host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-list-ol"></i></div><h3>No leaderboard data</h3><p>Rankings will appear after matches are played.</p></div>`; return; }

  const tab = State.lbTab;

  if (tab === 'solo') {
    // SOLO: Show top 10 players
    const list = data.solo.slice(0, 10);
    if (!list.length) { host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-medal"></i></div><h3>No Solo data yet</h3><p>Top players will appear once Solo matches finish.</p></div>`; return; }
    
    host.innerHTML = `<div class="card">` + list.map((u, i) => {
      const rank = i + 1;
      let rankHTML = '';
      
      // Professional medal display for top 3, number for rest
      if (rank === 1) rankHTML = `<div class="pro-rank-badge rank-1">🥇</div>`;
      else if (rank === 2) rankHTML = `<div class="pro-rank-badge rank-2">🥈</div>`;
      else if (rank === 3) rankHTML = `<div class="pro-rank-badge rank-3">🥉</div>`;
      else rankHTML = `<div class="pro-rank-badge">#${rank}</div>`;

      const avatarHtml = getAvatarHTML(u.photoUrl, u.profileEmoji, u.name);
      
      return `<div class="list-item">
        ${rankHTML}
        <div class="member-avatar" style="width:38px;height:38px;font-size:.95rem;">${avatarHtml}</div>
        <div class="li-body">
          <b>${esc(u.name)}</b>
          <small>${u.matches} matches · ${u.wins} wins · ${u.kills} kills</small>
        </div>
        <span class="amount pos">${fmtMoney(u.earnings)}</span>
      </div>`;
    }).join('') + `</div>`;
    return;
  }

  // DUO & SQUAD: Show only top 3 teams
  const list = tab === 'duo' ? data.duo.slice(0, 3) : data.squad.slice(0, 3);
  const headerTitle = tab === 'duo' ? '🏆 Top Duo Teams' : '🏆 Top Squad Teams';
  const teamSizeLabel = tab === 'duo' ? '2 Players (Duo)' : '4 Players (Squad)';

  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-users"></i></div><h3>No ${tab} data yet</h3><p>Team rankings appear once ${tab} matches are played.</p></div>`;
    return;
  }

  host.innerHTML = `<div style="font-size:.72rem;color:var(--txm);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;text-align:center">${esc(headerTitle)} · ${esc(teamSizeLabel)}</div>` + list.map((t, i) => {
    const rank = i + 1;
    let cardCls = '';
    let rankHTML = '';

    // Professional medal display for top 3 teams
    if (rank === 1) {
      cardCls = 'is-rank-1';
      rankHTML = `<div class="pro-rank-badge rank-1">🥇</div>`;
    } else if (rank === 2) {
      cardCls = 'is-rank-2';
      rankHTML = `<div class="pro-rank-badge rank-2">🥈</div>`;
    } else if (rank === 3) {
      cardCls = 'is-rank-3';
      rankHTML = `<div class="pro-rank-badge rank-3">🥉</div>`;
    }

    const logoHTML = t.teamLogo && t.teamLogo.startsWith('data:image')
      ? `<img src="${t.teamLogo}" alt="logo">`
      : esc((t.teamName || 'T').charAt(0).toUpperCase());

    return `<div class="lb-team-card ${cardCls}">
      <div class="lb-team-header">
        ${rankHTML}
        <div class="lb-team-logo">${logoHTML}</div>
        <div class="lb-team-info">
          <b>${esc(t.teamName)}</b>
          <small>${t.matches} matches · ${t.wins} wins · ${t.kills} kills</small>
        </div>
        <div class="lb-team-earnings">
          <div class="val">${fmtMoney(t.earnings)}</div>
          <div class="lbl">Total Earning</div>
        </div>
      </div>
      <div class="lb-team-members">
        ${t.members.map(mem => {
          const avatarHtml = getAvatarHTML(mem.photoUrl, mem.profileEmoji, mem.name);
          return `<div class="lb-member-item">
            <div class="lb-member-avatar">${avatarHtml}</div>
            <div class="lb-member-info">
              <div class="lb-member-name">
                <span>${esc(mem.name)}</span>
                ${mem.isLeader ? '<span class="leader-tag">👑 Leader</span>' : ''}
              </div>
              <div class="lb-member-stats">
                <span><i class="fa-solid fa-gamepad"></i> ${mem.matches} matches</span>
                <span><i class="fa-solid fa-crosshairs"></i> ${mem.kills} kills</span>
                ${mem.wins > 0 ? `<span><i class="fa-solid fa-medal"></i> ${mem.wins} wins</span>` : ''}
              </div>
            </div>
            <div class="lb-member-earning">
              ${fmtMoney(mem.earnings)}
              <small>Earned</small>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderMyMatches() {
  const host = $('#myMatchesList');
  if (!host) return;
  const list = (State.myRegistrations || []).filter(r => isWithinRetention(r.createdAt)).slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-list-check"></i></div><h3>No matches yet</h3><button class="btn btn-primary mt-3" data-nav="tournaments"><i class="fa-solid fa-trophy"></i> Browse Matches</button></div>`;
    host.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigate(b.dataset.nav));
    return;
  }
  const active = list.filter(r => { const m = State.tournaments.find(t => t.id === r.matchId); return m && (m.status === 'upcoming' || m.status === 'ongoing'); });
  const past = list.filter(r => { const m = State.tournaments.find(t => t.id === r.matchId); return m && (m.status === 'completed' || m.status === 'cancelled' || m.status === 'canceled'); });

  let html = '';
  if (active.length) html += `<h3 class="mb-3">Active</h3>` + active.map(r => myMatchHTML(r)).join('');
  if (past.length) html += `<h3 class="mb-3 mt-4">History</h3>` + past.map(r => myMatchHTML(r)).join('');
  host.innerHTML = html;
  bindMatchCardClicks(host);
}

function myMatchHTML(r) {
  const m = State.tournaments.find(t => t.id === r.matchId) || {};
  const modeCls = { BR:'br', CS:'cs', LW:'lw' }[m.mode] || 'neutral';
  const teamSize = Number(m.teamSize || 1);
  const teamLabel = teamSize === 2 ? 'Duo' : teamSize === 4 ? 'Squad' : 'Solo';
  
  const res = State.matchResultsCache[r.matchId];
  const myResult = res && res.entries ? res.entries[r.userId] : null;
  
  let resultHTML = '';
  if (myResult && res.status === 'approved') {
    let rankIcon = '';
    if(Number(myResult.rank) === 1) rankIcon = '🥇';
    else if(Number(myResult.rank) === 2) rankIcon = '🥈';
    else if(Number(myResult.rank) === 3) rankIcon = '🥉';

    resultHTML = `
      <div class="match-reward-detail">
        <span>${rankIcon} <b>Rank: ${myResult.rank || '-'}</b></span>
        <span><i class="fa-solid fa-crosshairs"></i> ${myResult.kills || 0} kills</span>
        <span class="reward-badge"><i class="fa-solid fa-coins"></i> +${fmtMoney(myResult.reward || 0)}</span>
      </div>
    `;
  } else if (myResult && res.status === 'pending_approval') {
    resultHTML = `<div class="match-reward-detail"><span class="muted" style="font-size:.75rem;color:var(--inf)"><i class="fa-solid fa-hourglass-half"></i> Result pending approval</span></div>`;
  } else if (res && res.status === 'pending_approval' && !myResult) {
    resultHTML = `<div class="match-reward-detail"><span class="muted" style="font-size:.75rem;color:var(--inf)"><i class="fa-solid fa-hourglass-half"></i> Results being prepared</span></div>`;
  }

  return `<div class="match-card" data-match-id="${esc(r.matchId)}">
    <div class="match-body">
      <div class="flex-between mb-2">
        <span class="badge ${modeCls}">${esc(m.mode || r.matchMode || '')} · ${teamLabel}</span>
        <span class="badge ${m.status || 'unknown'}">${esc(m.status || 'unknown')}</span>
      </div>
      <div class="match-title">${esc(r.matchTitle || m.title || '')}</div>
      <div class="match-meta">
        <span><i class="fa-regular fa-calendar"></i> ${esc(formatMatchDateTime(m.matchDate, m.matchTime))}</span>
        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${r.entryFee > 0 ? fmtMoney(r.entryFee) : 'FREE'}</span>
      </div>
      ${resultHTML}
    </div>
  </div>`;
}

async function openAddBalance() {
  const sSnap = await get(ref(db, 'appSettings/payment')).catch(()=>null);
  const s = sSnap?.val() || {};
  const upiId = s.upiId || '';
  const qrUrl = s.qrUrl || '';
  const instructions = s.instructions || 'Send the exact amount and enter the UTR / transaction reference below.';
  const minDep = Number(s.minDeposit || 10);
  const maxDep = Number(s.maxDeposit || 10000);

  openModal({
    title: 'Add Balance',
    bodyHTML: `
      <div class="alert info"><i class="fa-solid fa-circle-info"></i><span>Pay via UPI, then submit the reference. Admin will verify and credit your wallet.</span></div>
      ${qrUrl ? `<div class="tc mb-3"><img src="${esc(qrUrl)}" style="max-width:200px;border-radius:12px;margin:0 auto" onerror="this.style.display='none'"></div>` : ''}
      ${upiId ? `<div class="room-box mb-3"><div class="room-row"><span class="rk">UPI ID</span><span class="rv">${esc(upiId)} <button type="button" class="copy-btn" data-copy="${esc(upiId)}">Copy</button></span></div></div>` : ''}
      <div style="font-size:.8rem;color:var(--txd);margin-bottom:14px;white-space:pre-wrap">${esc(instructions)}</div>
      <div class="field"><label>Amount (₹) <span class="req">*</span></label><input type="number" id="depAmt" class="input" min="${minDep}" max="${maxDep}" step="1" placeholder="Min ₹${minDep}"></div>
      <div class="field"><label>Your UPI ID <span class="req">*</span></label><input type="text" id="depUpi" class="input" placeholder="yourname@upi"></div>
      <div class="field"><label>Transaction / UTR Reference <span class="req">*</span></label><input type="text" id="depRef" class="input" placeholder="12-digit UTR"></div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-paper-plane"></i> Submit</button>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-copy]').forEach(b => { b.type = 'button'; b.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await copyTextToClipboard(b.dataset.copy); }; });
      el.querySelector('[data-x="c"]').onclick = close;
      el.querySelector('[data-x="ok"]').onclick = async () => {
        const amtRupees = Number(el.querySelector('#depAmt').value);
        const upi = el.querySelector('#depUpi').value.trim();
        const refVal = el.querySelector('#depRef').value.trim();
        if (!amtRupees || amtRupees < minDep) { toast('error','Invalid','Min amount is ₹' + minDep); return; }
        if (amtRupees > maxDep) { toast('error','Too High','Max amount is ₹' + maxDep); return; }
        if (!upi) { toast('error','Required','Enter your UPI ID'); return; }
        if (!refVal) { toast('error','Required','Enter transaction reference'); return; }
        try {
          const dupSnap = await get(query(ref(db, 'depositRequests'), orderByChild('transactionRef'), equalTo(refVal))).catch(()=>null);
          if (dupSnap && dupSnap.exists()) { toast('error','Duplicate','This reference is already used'); return; }
          const dRef = push(ref(db, 'depositRequests'));
          await set(dRef, { id: dRef.key, userId: State.user.uid, userName: State.profile?.displayName || '', amount: amtRupees, payerUpi: upi, transactionRef: refVal, status: 'pending', createdAt: Date.now() });
          
          const notifRef = push(ref(db, 'notifications/' + State.user.uid));
          await set(notifRef, { id: notifRef.key, type: 'deposit_request', title: 'Deposit Submitted', body: `Your deposit of ₹${amtRupees} is pending admin approval.`, read: false, createdAt: Date.now() });

          toast('success','Submitted','Pending verification');
          close();
        } catch (e) { toast('error','Failed',e.message); }
      };
    }
  });
}

async function openWithdraw() {
  const sSnap = await get(ref(db, 'appSettings/payment')).catch(()=>null);
  const s = sSnap?.val() || {};
  const minWd = Number(s.minWithdrawal || 100);
  const balance = Number(State.wallet.balance || 0);

  openModal({
    title: 'Withdraw',
    bodyHTML: `
      <div class="alert info"><i class="fa-solid fa-circle-info"></i><span>Min withdrawal: <b>${fmtMoney(minWd)}</b></span></div>
      <div class="room-box mb-3"><div class="room-row"><span class="rk">Available</span><span class="rv">${fmtMoney(balance)}</span></div></div>
      <div class="field"><label>Amount (₹) <span class="req">*</span></label><input type="number" id="wdAmt" class="input" min="${minWd}" placeholder="Min ₹${minWd}"></div>
      <div class="field"><label>Your UPI ID <span class="req">*</span></label><input type="text" id="wdDetail" class="input" placeholder="yourname@upi"></div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-arrow-up"></i> Request</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="c"]').onclick = close;
      el.querySelector('[data-x="ok"]').onclick = async () => {
        const amt = Number(el.querySelector('#wdAmt').value);
        const detail = el.querySelector('#wdDetail').value.trim();
        if (!amt || amt < minWd) { toast('error','Too Low','Min is ' + fmtMoney(minWd)); return; }
        if (amt > balance) { toast('error','Insufficient','Not enough balance'); return; }
        if (!detail) { toast('error','Required','Enter your UPI ID'); return; }
        try {
          const wResult = await runTransaction(ref(db, 'wallets/' + State.user.uid + '/balance'), (cur) => { const curr = Number(cur) || 0; if (curr < amt) return; return curr - amt; });
          if (!wResult.committed) { toast('error','Failed','Could not process'); return; }
          await runTransaction(ref(db, 'wallets/' + State.user.uid + '/reserved'), (cur) => (Number(cur)||0) + amt);
          const wdRef = push(ref(db, 'withdrawalRequests'));
          await set(wdRef, { id: wdRef.key, userId: State.user.uid, userName: State.profile?.displayName || '', amount: amt, payoutMethod: 'UPI', payoutDetail: detail, status: 'pending', createdAt: Date.now() });
          
          const txRef = push(ref(db, 'walletTransactions'));
          await set(txRef, { id: txRef.key, userId: State.user.uid, type: 'withdrawal', amount: -amt, currency: 'INR', relatedId: wdRef.key, status: 'pending', createdAt: Date.now() });
          
          const notifRef = push(ref(db, 'notifications/' + State.user.uid));
          await set(notifRef, { id: notifRef.key, type: 'withdrawal_request', title: 'Withdrawal Requested', body: `Your withdrawal of ₹${amt} is pending admin approval.`, read: false, createdAt: Date.now() });

          toast('success','Requested','Admin will process soon');
          close();
        } catch (e) { toast('error','Failed',e.message); }
      };
    }
  });
}

function renderTransactions() {
  const host = $('#txList');
  if (!host) return;
  
  const list = (State.transactions || [])
    .filter(t => isWithinRetention(t.createdAt) && !State.localDeletedTxs.includes(t.id))
    .slice(0, 50);
    
  if (!list.length) { host.innerHTML = `<div class="empty-state"><p>No transactions.</p></div>`; return; }
  
  host.innerHTML = list.map(t => {
    const icon = { 
      deposit:'fa-arrow-down', entry_fee:'fa-ticket', refund:'fa-rotate-left', referral:'fa-share-nodes', referral_bonus:'fa-gift', kill_reward:'fa-crosshairs', prize:'fa-medal', match_reward:'fa-trophy', spin_reward:'fa-dharmachakra', daily_bonus:'fa-gift', ad_reward:'fa-tv', withdrawal:'fa-arrow-up', withdrawal_refund:'fa-rotate-left', admin_set:'fa-pen-to-square', vip_purchase:'fa-crown', diamond_earn:'fa-gem', diamond_spend:'fa-gem', admin_diamond_gift:'fa-gift', admin_diamond_set:'fa-gem', team_pass:'fa-crown', match_cancelled:'fa-ban'
    }[t.type] || 'fa-receipt';
    
    let cls = t.amount >= 0 ? 'pos' : 'neg';
    let color = t.amount >= 0 ? 'var(--ok)' : 'var(--er)';
    let bg = t.amount >= 0 ? 'var(--oks)' : 'var(--ers)';
    
    let richBody = '';
    let title = (t.type || 'Transaction').replace(/_/g,' ').toUpperCase();
    let displayAmount = '';
    
    const isDiamonds = t.currency === 'DIAMONDS' || ['spin_reward', 'daily_bonus', 'ad_reward', 'admin_diamond_gift', 'admin_diamond_set'].includes(t.type);
    const displayVal = isDiamonds ? (t.diamonds || t.amount) : t.amount;
    
    if (isDiamonds) {
       cls = displayVal >= 0 ? 'pos' : 'neg';
       color = displayVal >= 0 ? 'var(--ok)' : 'var(--er)';
       bg = displayVal >= 0 ? 'var(--oks)' : 'var(--ers)';
       displayAmount = `${displayVal >= 0 ? '+' : ''}${displayVal} 💎`;
    } else {
       displayAmount = `${displayVal >= 0 ? '+' : ''}${fmtMoney(displayVal)}`;
    }

    if (t.type === 'match_reward' && t.matchTitle) {
      title = `Match Reward — ${t.matchTitle}`;
      let rankTxt = `Rank: ${t.rank || '-'}`;
      if(Number(t.rank) === 1) rankTxt = '🥇 Rank: 1st';
      else if(Number(t.rank) === 2) rankTxt = '🥈 Rank: 2nd';
      else if(Number(t.rank) === 3) rankTxt = '🥉 Rank: 3rd';

      richBody = `<div style="font-size:.75rem;color:var(--txd);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap">
        <span>${rankTxt}</span>
        <span>🎯 ${t.kills || 0} kills</span>
      </div>`;
    } else if (t.type === 'spin_reward') {
      title = '🎡 Spin & Win Reward';
    } else if (t.type === 'daily_bonus') {
      title = '🎁 Daily Login Bonus';
    } else if (t.type === 'ad_reward') {
      title = '📺 Ad Watch Reward';
    } else if (t.type === 'vip_purchase') {
      title = '👑 VIP Purchase';
      displayAmount = t.currency === 'DIAMONDS' ? `${displayVal > 0 ? '+' : ''}${displayVal} 💎` : `${displayVal >= 0 ? '+' : ''}${fmtMoney(displayVal)}`;
    } else if (t.type === 'team_pass') {
      title = '👥 Team Maintenance Pass';
    } else if (t.type === 'admin_diamond_gift') {
      title = '🎁 Diamonds Gifted by Admin';
    } else if (t.type === 'admin_diamond_set') {
      title = displayVal > 0 ? '💎 Diamonds Added by Admin' : '💎 Diamonds Deducted by Admin';
    } else if (t.type === 'refund') {
      title = '💸 Match Refund';
    } else if (t.type === 'match_cancelled') {
      title = '🚫 Match Cancelled';
    }
    
    if(!richBody) {
      richBody = `<small>${fmtDateTime(t.createdAt)} · ${esc(t.status||'')}</small>`;
    }

    return `<div class="list-item">
      <div class="li-icon" style="background:${bg};color:${color}"><i class="fa-solid ${icon}"></i></div>
      <div class="li-body">
        <b>${esc(title)}</b>
        ${richBody}
      </div>
      <span class="amount ${cls}" style="margin-right:8px;">${displayAmount}</span>
      <button class="delete-tx-btn" onclick="deleteTx('${t.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }).join('');
}

window.deleteTx = (id) => {
  if(!State.localDeletedTxs.includes(id)) {
    State.localDeletedTxs.push(id);
    localStorage.setItem('deleted_txs', JSON.stringify(State.localDeletedTxs));
    renderTransactions();
    toast('success', 'Deleted', 'Transaction removed from your history');
  }
};

function openWorldChat() {
  if (!isVipActive()) {
    openModal({
      title: 'Premium Required',
      bodyHTML: `<div style="text-align:center;padding:20px 0;"><i class="fa-solid fa-lock" style="font-size:3rem;color:var(--wn);margin-bottom:12px;"></i><h3>VIP Only Feature</h3><p style="font-size:0.9rem;">World Chat and Direct Admin DM are available only for Premium users. Upgrade now to chat with all players and get a Blue Tick!</p></div>`,
      footerHTML: `<button class="btn btn-primary w-100" id="vipFromChatBtn"><i class="fa-solid fa-crown"></i> Get Premium</button>`,
      onMount: (el, close) => {
        el.querySelector('#vipFromChatBtn').onclick = () => { close(); setTimeout(()=>openVipStore(), 200); };
      }
    });
    return;
  }

  openModal({
    title: '🌍 World Chat',
    extraClass: 'chat-modal',
    bodyHTML: `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--bd);">
        <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:600; color:var(--ok);">
          <i class="fa-solid fa-circle" style="font-size:0.5rem; animation: spPulse 2s infinite;"></i> World Chat Active
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="icon-btn" id="switchToDmBtn" style="width:32px;height:32px;font-size:0.9rem;color:var(--ac2);" title="Direct Admin DM">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
          <button class="icon-btn" id="clearMyChatBtn" style="width:32px;height:32px;font-size:0.9rem;color:var(--er);" title="Clear Chat">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div id="chatMessages"></div>
      <div class="chat-input-area" style="position:relative;">
        <button class="emoji-btn-chat" id="chatEmojiBtn"><i class="fa-regular fa-face-smile"></i></button>
        <input type="text" id="chatInput" class="input" placeholder="Type a message..." maxlength="100">
        <button class="btn btn-primary" id="sendChatBtn"><i class="fa-solid fa-paper-plane"></i></button>
        <div class="emoji-picker-popup" id="chatEmojiPicker"></div>
      </div>
    `,
    onMount: (el, close) => {
      renderChatMessages();
      
      const emojiBtn = el.querySelector('#chatEmojiBtn');
      const emojiPicker = el.querySelector('#chatEmojiPicker');
      const input = el.querySelector('#chatInput');

      const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👋','🤚','🖐','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏'];

      emojiPicker.innerHTML = emojis.map(e => `<span style="font-size:1.5rem;cursor:pointer;padding:4px;" data-emoji="${e}">${e}</span>`).join('');
      
      emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPicker.classList.toggle('show'); };
      document.addEventListener('click', (e) => { if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) emojiPicker.classList.remove('show'); });
      emojiPicker.querySelectorAll('[data-emoji]').forEach(sp => {
        sp.onclick = () => { input.value += sp.dataset.emoji; input.focus(); emojiPicker.classList.remove('show'); };
      });

      const sendFn = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        
        const msgRef = push(ref(db, 'worldChat'));
        const newMsg = { id: msgRef.key, userId: State.user.uid, userName: State.profile.displayName, userVip: isVipActive(), text: text, createdAt: Date.now(), deleted: false };
        
        State.chatMessages.push(newMsg);
        renderChatMessages();
        
        try { await set(msgRef, newMsg); } 
        catch(e) { State.chatMessages = State.chatMessages.filter(m => m.id !== newMsg.id); renderChatMessages(); toast('error', 'Failed to send', ''); }
      };

      el.querySelector('#sendChatBtn').onclick = sendFn;
      input.onkeydown = (e) => { if(e.key === 'Enter') sendFn(); };

      el.querySelector('#clearMyChatBtn').onclick = async () => {
        if(!await confirmDialog('Clear Chat', 'Clear all messages from your side?')) return;
        State.localDeletedChats = State.chatMessages.map(m => m.id);
        localStorage.setItem('deleted_chats', JSON.stringify(State.localDeletedChats));
        renderChatMessages();
        toast('info', 'Cleared', '');
      };

      el.querySelector('#switchToDmBtn').onclick = () => { close(); setTimeout(() => openAdminDM(), 200); };
    }
  });
}

function renderChatMessages() {
  const host = $('#chatMessages');
  if (!host) return;
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
  
  const validMsgs = State.chatMessages.filter(m => m.createdAt > fiveDaysAgo && !State.localDeletedChats.includes(m.id));

  host.innerHTML = validMsgs.map(m => {
    const isMine = m.userId === State.user.uid;
    return `<div class="chat-msg ${isMine ? 'mine' : ''}" data-id="${m.id}" data-text="${esc(m.text)}" data-mine="${isMine}">
      <div class="chat-msg-header">
        <span>${esc(m.userName)}</span>
        ${m.userVip ? '<i class="fa-solid fa-circle-check blue-tick"></i>' : ''}
      </div>
      <div class="chat-msg-text">${esc(m.text)} ${m.isEdited ? '<span style="font-size:0.65rem;color:var(--txm);">(edited)</span>' : ''}</div>
      <div class="chat-msg-time">${fmtTimeOnly(m.createdAt)}</div>
    </div>`;
  }).join('');
  
  host.querySelectorAll('.chat-msg.mine').forEach(msgEl => {
    let pressTimer;
    const startPress = (e) => {
      e.preventDefault();
      pressTimer = setTimeout(() => showMsgOptions(msgEl.dataset.id, msgEl.dataset.text, false), 600);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    msgEl.addEventListener('mousedown', startPress);
    msgEl.addEventListener('touchstart', startPress);
    msgEl.addEventListener('mouseup', cancelPress);
    msgEl.addEventListener('mouseleave', cancelPress);
    msgEl.addEventListener('touchend', cancelPress);
  });
  host.scrollTop = host.scrollHeight;
}

async function openAdminDM() {
  if (!isVipActive()) { toast('warning', 'VIP Only', 'Direct Admin DM requires Premium.'); return; }
  const uid = State.user.uid;
  const dmRef = ref(db, 'adminMessages/' + uid);
  
  openModal({
    title: '💬 Direct Admin DM',
    extraClass: 'dm-modal',
    bodyHTML: `
      <div class="alert info" style="margin-bottom:10px;"><i class="fa-solid fa-headset"></i><span>Message directly to admin. Replies appear here.</span></div>
      <div id="dmMessages" style="height: 45vh; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:4px;"></div>
    `,
    footerHTML: `
      <div class="chat-input-area" style="margin-top:0; width:100%; position:relative;">
        <button class="emoji-btn-chat" id="dmEmojiBtn"><i class="fa-regular fa-face-smile"></i></button>
        <input type="text" id="dmInput" class="input" placeholder="Type your message..." maxlength="300">
        <button class="btn btn-primary" id="dmSendBtn"><i class="fa-solid fa-paper-plane"></i></button>
        <div class="emoji-picker-popup" id="dmEmojiPicker"></div>
      </div>
    `,
    onMount: (el, close) => {
      const msgsHost = el.querySelector('#dmMessages');
      const emojiBtn = el.querySelector('#dmEmojiBtn');
      const emojiPicker = el.querySelector('#dmEmojiPicker');
      const input = el.querySelector('#dmInput');

      const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👋','🤚','🖐','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏'];
      emojiPicker.innerHTML = emojis.map(e => `<span style="font-size:1.5rem;cursor:pointer;padding:4px;" data-emoji="${e}">${e}</span>`).join('');

      emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPicker.classList.toggle('show'); };
      document.addEventListener('click', (e) => { if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) emojiPicker.classList.remove('show'); });
      emojiPicker.querySelectorAll('[data-emoji]').forEach(sp => {
        sp.onclick = () => { input.value += sp.dataset.emoji; input.focus(); emojiPicker.classList.remove('show'); };
      });

      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;

      const unsubscribe = onValue(dmRef, (snap) => {
        let messages = [];
        if (snap.exists()) {
          const v = snap.val();
          Object.keys(v).forEach(k => { if (isObj(v[k]) && !v[k].deleted && v[k].createdAt > fiveDaysAgo) messages.push({ id: k, ...v[k] }); });
        }
        messages.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
        
        msgsHost.innerHTML = messages.map(m => {
          const fromMe = m.from === 'user';
          return `<div class="chat-msg ${fromMe ? 'mine' : ''}" style="max-width:85%;" data-id="${m.id}" data-text="${esc(m.text)}" data-mine="${fromMe}">
            <div class="chat-msg-header"><span>${fromMe ? 'You' : '🛡️ Admin'}</span></div>
            <div class="chat-msg-text">${esc(m.text)} ${m.isEdited ? '<span style="font-size:0.65rem;color:var(--txm);">(edited)</span>' : ''}</div>
            <div class="chat-msg-time">${fmtTimeOnly(m.createdAt)}</div>
          </div>`;
        }).join('');
        
        msgsHost.querySelectorAll('.chat-msg.mine').forEach(msgEl => {
          let pressTimer;
          const startPress = (e) => { e.preventDefault(); pressTimer = setTimeout(() => showMsgOptions(msgEl.dataset.id, msgEl.dataset.text, true), 600); };
          const cancelPress = () => clearTimeout(pressTimer);
          msgEl.addEventListener('mousedown', startPress);
          msgEl.addEventListener('touchstart', startPress);
          msgEl.addEventListener('mouseup', cancelPress);
          msgEl.addEventListener('mouseleave', cancelPress);
          msgEl.addEventListener('touchend', cancelPress);
        });

        msgsHost.scrollTop = msgsHost.scrollHeight;
      });
      
      State.dmListener = unsubscribe;
      
      const sendFn = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        
        const pushRef = push(dmRef);
        const tempMsg = { id: pushRef.key, text, from: 'user', userId: uid, userName: State.profile.displayName, createdAt: Date.now() };
        
        try {
          await set(pushRef, tempMsg);
          const txRef = push(ref(db, 'notifications/' + uid));
          await set(txRef, { id: txRef.key, type: 'admin_dm', title: 'Message sent to Admin', body: text, read: false, createdAt: Date.now() });
        } catch(e) { toast('error', 'Failed', e.message); }
      };
      
      el.querySelector('#dmSendBtn').onclick = sendFn;
      input.onkeydown = (e) => { if(e.key === 'Enter') sendFn(); };
    }
  });
}

window.currentEditingMsg = null;
window.showMsgOptions = (id, text, isDm) => {
  window.currentEditingMsg = { id, text, isDm };
  const closeBtnId = 'closeMsgOpt_' + Date.now();
  openModal({
    title: 'Message Options',
    bodyHTML: `
       <div style="display:flex; flex-direction:column; gap:10px;">
         <button class="btn btn-outline" style="justify-content:flex-start;" id="editMsgBtn"><i class="fa-solid fa-pen"></i> Edit Message</button>
         <button class="btn btn-danger" style="justify-content:flex-start;" id="deleteMsgBtn"><i class="fa-solid fa-trash"></i> Delete for Everyone</button>
       </div>
    `,
    footerHTML: `<button class="btn btn-ghost w-100" id="${closeBtnId}" data-x="c">Cancel</button>`,
    onMount: (el, close) => { 
       el.querySelector(`#${closeBtnId}`).onclick = close; 
       el.querySelector('#editMsgBtn').onclick = () => { close(); setTimeout(() => window.editChatMsg(), 100); };
       el.querySelector('#deleteMsgBtn').onclick = () => { close(); setTimeout(() => window.deleteChatMsg(), 100); };
    }
  });
};

window.editChatMsg = () => {
  const { id, text, isDm } = window.currentEditingMsg;
  if (!id) return;
  openModal({
    title: 'Edit Message',
    bodyHTML: `<div class="field"><label>New Message</label><input type="text" id="editMsgInput" class="input" value="${esc(text)}" maxlength="100"></div>`,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok">Save</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="c"]').onclick = close;
      el.querySelector('[data-x="ok"]').onclick = async () => {
        const newText = el.querySelector('#editMsgInput').value.trim();
        if (!newText) return;
        const path = isDm ? `adminMessages/${State.user.uid}/${id}` : `worldChat/${id}`;
        await update(ref(db, path), { text: newText, isEdited: true });
        if (!isDm) {
           const msg = State.chatMessages.find(m => m.id === id);
           if (msg) { msg.text = newText; msg.isEdited = true; renderChatMessages(); }
        }
        toast('success', 'Edited', 'Message updated');
        close();
      };
    }
  });
};

window.deleteChatMsg = async () => {
  const { id, isDm } = window.currentEditingMsg;
  if (!id) return;
  if (!await confirmDialog('Delete Message', 'This will remove the message for everyone.', true)) return;
  const path = isDm ? `adminMessages/${State.user.uid}/${id}` : `worldChat/${id}`;
  await update(ref(db, path), { deleted: true });
  toast('success', 'Deleted', 'Message removed.');
};

function openNotifications() {
  const list = (State.notifications || []).filter(n => isWithinRetention(n.createdAt));
  const unread = list.filter(n => !n.read).length;

  let bodyHTML;
  if (!list.length) {
    bodyHTML = `<div class="notif-empty"><i class="fa-regular fa-bell-slash"></i><h4>No notifications</h4><p>Updates about matches, rewards, and more will appear here.</p></div>`;
  } else {
    bodyHTML = `<div class="notif-list">` + list.map(notifItemHTML).join('') + `</div>`;
  }

  const headerTitle = `Notifications${unread ? ` <span class="notif-header-count">${unread} new</span>` : ''}`;

  openModal({
    title: headerTitle,
    bodyHTML,
    extraClass: 'notif-modal',
    footerHTML: `
      <div style="display:flex; gap:10px; width:100%; flex-wrap:wrap;">
        ${list.length > 0 ? `<button class="btn btn-danger" style="flex:1;" id="clearAllNotifsBtn"><i class="fa-solid fa-trash"></i> Clear</button>` : ''}
        ${unread > 0 ? `<button class="btn btn-success" style="flex:1;" id="markAllReadBtn"><i class="fa-solid fa-check-double"></i> Mark as Read</button>` : ''}
        <button class="btn btn-primary" style="flex:1;" data-x="close">Close</button>
      </div>
    `,
    onMount: (el, close) => {
      const cb = el.querySelector('[data-x="close"]');
      if (cb) cb.onclick = close;
      
      const clearBtn = el.querySelector('#clearAllNotifsBtn');
      if (clearBtn) {
        clearBtn.onclick = async () => {
          if(!await confirmDialog('Clear All', 'Delete all notifications?', true)) return;
          try {
            await remove(ref(db, 'notifications/' + State.user.uid));
            toast('success', 'Cleared', '');
            close();
          } catch(e) { toast('error', 'Failed', ''); }
        };
      }

      const markBtn = el.querySelector('#markAllReadBtn');
      if (markBtn) {
        markBtn.onclick = async () => {
          const updates = {};
          list.filter(n => !n.read).forEach(n => { updates['notifications/' + State.user.uid + '/' + n.id + '/read'] = true; });
          if (Object.keys(updates).length) await update(ref(db), updates);
          toast('success', 'Marked as Read', '');
          close();
        };
      }
      
      el.querySelectorAll('.notif-item').forEach(item => {
        item.onclick = async () => {
          const id = item.dataset.notifId;
          const notif = list.find(n => n.id === id);
          if (!id) return;
          try { await update(ref(db, 'notifications/' + State.user.uid + '/' + id), { read: true }); } catch(e) {}
          item.classList.remove('unread');
          if (notif && notif.matchId) {
            close();
            setTimeout(() => openMatchDetails(notif.matchId), 300);
          } else if (notif && notif.type === 'admin_dm') {
            close();
            setTimeout(() => openAdminDM(), 300);
          } else if (notif && notif.type === 'team_invite') {
            close();
            setTimeout(() => { navigate('mymatches'); switchMyTab('team'); }, 300);
          }
        };
      });
    }
  });
}

function notifItemHTML(n) {
  const meta = getNotifMeta(n.type, n.title);
  const unread = !n.read;
  return `<div class="notif-item ${unread ? 'unread' : ''}" data-notif-id="${esc(n.id||'')}">
    <div class="notif-icon ${meta.cls}"><i class="fa-solid ${meta.icon}"></i></div>
    <div class="notif-content">
      <div class="notif-title">${esc(n.title || 'Notification')}</div>
      <div class="notif-body">${esc(n.body || '')}</div>
      <div class="notif-time"><i class="fa-regular fa-clock"></i> ${esc(fmtRelativeTime(n.createdAt))}</div>
    </div>
  </div>`;
}

function getNotifMeta(type, title) {
  const t = String(type || '').toLowerCase();
  const T = String(title || '').toLowerCase();
  if (t.includes('match_result')) return { cls: 'reward', icon: 'fa-trophy' };
  if (t.includes('registration') || T.includes('registration') || T.includes('joined')) return { cls: 'registration', icon: 'fa-trophy' };
  if (t.includes('balance') || T.includes('balance') || t.includes('admin_set')) return { cls: 'balance', icon: 'fa-wallet' };
  if (t.includes('deposit') || T.includes('deposit')) { if (T.includes('reject')) return { cls: 'reject', icon: 'fa-circle-xmark' }; return { cls: 'deposit', icon: 'fa-circle-check' }; }
  if (t.includes('withdraw') || T.includes('withdraw')) { if (T.includes('reject')) return { cls: 'reject', icon: 'fa-circle-xmark' }; return { cls: 'withdraw', icon: 'fa-money-bill-transfer' }; }
  if (t.includes('prize') || t.includes('reward') || T.includes('prize') || T.includes('reward') || T.includes('win') || t.includes('referral')) return { cls: 'reward', icon: 'fa-medal' };
  if (t.includes('admin_dm') || T.includes('admin')) return { cls: 'info', icon: 'fa-comment-dots' };
  if (t.includes('vip_gift') || T.includes('vip')) return { cls: 'reward', icon: 'fa-crown' };
  if (t.includes('team')) return { cls: 'info', icon: 'fa-users' };
  if (t.includes('cancelled') || t.includes('canceled') || T.includes('cancel')) return { cls: 'reject', icon: 'fa-ban' };
  if (T.includes('reject') || T.includes('fail')) return { cls: 'reject', icon: 'fa-circle-exclamation' };
  return { cls: 'info', icon: 'fa-bell' };
}

function openVipStore() {
  const vipActive = isVipActive();
  const expiryTxt = vipActive ? fmtDate(State.profile.vipExpiry) : null;
  const userDiamonds = Number(State.profile?.diamonds || 0);

  let html = `
    <div style="text-align:center; margin-bottom:16px;">
      <i class="fa-solid fa-crown" style="font-size:3rem; color:#fbbf24; margin-bottom:8px;"></i>
      <h2 style="margin:0; color:#fbbf24;">VIP & Premium Store</h2>
      ${vipActive ? `<p style="color:var(--ok);font-size:0.8rem;margin-top:4px;"><i class="fa-solid fa-circle-check"></i> Active till ${expiryTxt}</p>` : ''}
    </div>
    <div class="admin-note">
      <i class="fa-solid fa-gem"></i>
      <span>You have <b>${userDiamonds.toLocaleString('en-IN')}</b> diamonds. Buy VIP with diamonds or rupees.</span>
    </div>
    <ul class="vip-feature-list">
      <li><i class="fa-solid fa-check"></i> <b>Blue Tick</b> in Chat & Profile</li>
      <li><i class="fa-solid fa-check"></i> <b>World Chat</b> Access (Globe Icon)</li>
      <li><i class="fa-solid fa-check"></i> <b>Direct Message to Admin</b></li>
      <li><i class="fa-solid fa-check"></i> Unlock All App Themes</li>
      <li><i class="fa-solid fa-check"></i> Custom Image Upload (Profile & Team)</li>
    </ul>
    <h4 style="font-size:0.9rem; margin-bottom:8px;">Select Plan</h4>
  `;

  const plans = State.vipSettings?.plans || {};
  for (const [key, p] of Object.entries(plans)) {
    const diamonds = Number(p.diamonds || p.coins || 0);
    html += `
      <div class="vip-plan-card" data-plan="${key}">
        <div class="vpc-head">
          <b>${p.days} Days Premium</b>
          ${Number(p.days) >= 30 ? '<span class="vip-badge-premium">Best Value</span>' : ''}
        </div>
        <div class="vpc-prices">
          <div class="vpc-price"><i class="fa-solid fa-gem" style="color:#67e8f9;"></i> <span>${diamonds.toLocaleString('en-IN')} diamonds</span></div>
          <div class="vpc-price"><i class="fa-solid fa-indian-rupee-sign" style="color:var(--ok);"></i> <span>₹${p.rupees}</span></div>
        </div>
      </div>
    `;
  }

  openModal({
    title: 'Premium Store',
    bodyHTML: html,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="buy" disabled>Continue</button>`,
    onMount: (el, close) => {
      let selectedPlan = null;

      el.querySelector('[data-x="c"]').onclick = close;

      el.querySelectorAll('.vip-plan-card').forEach(card => {
        card.onclick = () => {
          el.querySelectorAll('.vip-plan-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedPlan = card.dataset.plan;
          el.querySelector('[data-x="buy"]').disabled = false;
        };
      });

      el.querySelector('[data-x="buy"]').onclick = () => {
        if (!selectedPlan) return;
        const p = State.vipSettings.plans[selectedPlan];
        const diamondPrice = Number(p.diamonds || p.coins || 0);
        
        close();
        setTimeout(() => openVipPaymentMethod(selectedPlan, p, diamondPrice), 150);
      };
    }
  });
}

function openVipPaymentMethod(planKey, p, diamondPrice) {
  const walletBal = Number(State.wallet.balance || 0);
  const userDiamonds = Number(State.profile?.diamonds || 0);
  const canRupees = walletBal >= Number(p.rupees || 0);
  const canDiamonds = userDiamonds >= diamondPrice;

  openModal({
    title: 'Choose Payment Method',
    bodyHTML: `
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:1.1rem;font-weight:700;color:var(--ac2);">${p.days} Days Premium</div>
        <div style="font-size:0.78rem;color:var(--txm);margin-top:4px;">Choose how you want to pay</div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
        <button class="btn btn-outline" id="payRupeesBtn" style="flex-direction:column; padding:16px; ${!canRupees?'opacity:0.5;':''}">
          <i class="fa-solid fa-indian-rupee-sign" style="font-size:1.5rem; margin-bottom:8px; color:var(--ok);"></i>
          <b>₹${p.rupees}</b>
          <small style="font-size:0.7rem; margin-top:4px;">Pay with Rupees</small>
          <small style="font-size:0.65rem;color:${canRupees?'var(--ok)':'var(--er)'};margin-top:2px;">Bal: ₹${walletBal.toFixed(2)}</small>
        </button>
        <button class="btn btn-outline" id="payDiamondsBtn" style="flex-direction:column; padding:16px; ${!canDiamonds?'opacity:0.5;':''}">
          <i class="fa-solid fa-gem" style="font-size:1.5rem; margin-bottom:8px; color:#67e8f9;"></i>
          <b>${diamondPrice.toLocaleString('en-IN')} 💎</b>
          <small style="font-size:0.7rem; margin-top:4px;">Pay with Diamonds</small>
          <small style="font-size:0.65rem;color:${canDiamonds?'var(--ok)':'var(--er)'};margin-top:2px;">Have: ${userDiamonds.toLocaleString('en-IN')}</small>
        </button>
      </div>
      <p style="font-size:0.72rem; text-align:center; color:var(--txm); margin:0;">Diamonds can be earned from matches, spins, ads & bonuses.</p>
    `,
    footerHTML: `<button class="btn btn-ghost w-100" id="vipPayCancel">Cancel</button>`,
    onMount: (el, close) => {
      el.querySelector('#vipPayCancel').onclick = close;
      el.querySelector('#payRupeesBtn').onclick = () => {
        if (!canRupees) { toast('error','Insufficient Balance','Add money to your wallet.'); return; }
        close();
        setTimeout(() => payVip(planKey, 'rupees', p), 100);
      };
      el.querySelector('#payDiamondsBtn').onclick = () => {
        if (!canDiamonds) { toast('error','Insufficient Diamonds','Earn more diamonds from matches & rewards.'); return; }
        close();
        setTimeout(() => payVip(planKey, 'diamonds', p), 100);
      };
    }
  });
}

window.payVip = async (planKey, method, p) => {
  const diamondPrice = Number(p.diamonds || p.coins || 0);

  try {
    if (method === 'rupees') {
      const bal = Number(State.wallet.balance || 0);
      if (bal < p.rupees) { toast('error', 'Insufficient Balance', 'Add money to your wallet.'); return; }
      
      const res = await runTransaction(ref(db, 'wallets/' + State.user.uid + '/balance'), (cur) => {
        const c = Number(cur) || 0;
        if (c < p.rupees) return;
        return c - p.rupees;
      });
      if (!res.committed) return toast('error', 'Failed', '');
      
    } else {
      const diamonds = Number(State.profile.diamonds || 0);
      if (diamonds < diamondPrice) { toast('error', 'Insufficient Diamonds', 'You don\'t have enough diamonds.'); return; }
      
      const res = await runTransaction(ref(db, 'users/' + State.user.uid + '/diamonds'), (cur) => {
        const c = Number(cur) || 0;
        if (c < diamondPrice) return;
        return c - diamondPrice;
      });
      if (!res.committed) return toast('error', 'Failed', '');
    }

    const currentExpiry = Number(State.profile.vipExpiry || 0);
    const newExpiry = Math.max(Date.now(), currentExpiry) + (p.days * 24 * 60 * 60 * 1000);
    
    await update(ref(db, 'users/' + State.user.uid), { vipExpiry: newExpiry });

    const txRef = push(ref(db, 'walletTransactions'));
    await set(txRef, {
      id: txRef.key,
      userId: State.user.uid,
      type: 'vip_purchase',
      amount: method === 'rupees' ? -p.rupees : 0,
      currency: method === 'rupees' ? 'INR' : 'DIAMONDS',
      diamonds: method === 'diamonds' ? -diamondPrice : 0,
      status: 'completed',
      createdAt: Date.now()
    });
    
    triggerVipCelebration(p.days);
    
  } catch(e) {
    toast('error', 'Failed', 'Could not complete transaction.');
  }
};

function triggerVipCelebration(days) {
  playNotifSound();
  if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 500]); } catch(e) {} }
  
  if (typeof confetti === 'function') {
    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };
    function randomInRange(min, max) { return Math.random() * (max - min) + min; }
    var interval = setInterval(function() {
      var timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) { return clearInterval(interval); }
      var particleCount = 50 * (timeLeft / duration);
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
  }

  openModal({
    title: '',
    bodyHTML: `
      <div style="text-align:center; padding:30px 10px;">
        <div style="font-size:5rem; animation:popIn .6s cubic-bezier(0.175, 0.885, 0.32, 1.275); line-height:1; margin-bottom:20px;">👑</div>
        <h1 style="font-size:1.8rem; background:linear-gradient(135deg,#fbbf24,#f59e0b); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:10px;">Welcome to VIP!</h1>
        <p style="font-size:1rem; color:var(--tx); font-weight:500;">You have successfully activated <b>${days} Days Premium</b>.</p>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:20px; flex-wrap:wrap;">
          <span class="badge" style="background:#00a3ff;color:#fff;padding:6px 12px;font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> Blue Tick</span>
          <span class="badge" style="background:#8b5cf6;color:#fff;padding:6px 12px;font-size:0.8rem;"><i class="fa-solid fa-globe"></i> World Chat</span>
          <span class="badge" style="background:#fbbf24;color:#000;padding:6px 12px;font-size:0.8rem;"><i class="fa-solid fa-crown"></i> All Themes</span>
        </div>
      </div>
    `,
    footerHTML: `<button class="btn btn-primary w-100" style="background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#000; font-weight:700;" data-x="close">Let's Go!</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="close"]').onclick = close;
    }
  });
}

function renderThemeGrid() {
  const host = $('#themeGrid');
  if (!host) return;
  const isLocked = themeState.mode === 'global';
  const current = computeActiveTheme();
  const vip = isVipActive();

  if (isLocked) {
    host.innerHTML = `<div class="alert info"><i class="fa-solid fa-lock"></i><span>Theme is managed by admin.</span></div>`;
    return;
  }

  const available = THEME_DEFS.filter(t => themeState.enabled[t.id] !== false);
  host.innerHTML = available.map(t => {
    const isVipOnly = t.id !== 'gold' && t.id !== 'amoled';
    const locked = isVipOnly && !vip;
    
    return `
    <div class="theme-swatch ${t.id===current?'active':''} ${locked?'locked':''}" data-theme-pick="${t.id}" style="${locked?'opacity:0.6;':''}">
      <div class="ts-dots">${t.dots.map(c => `<span style="background:${c}"></span>`).join('')}</div>
      <small>${esc(t.name)}</small>
      ${locked ? '<i class="fa-solid fa-lock" style="position:absolute; top:8px; right:8px; color:var(--wn);"></i>' : ''}
    </div>
  `}).join('');

  host.querySelectorAll('[data-theme-pick]').forEach(el => {
    el.onclick = async () => {
      const picked = el.dataset.themePick;
      const isVipOnly = picked !== 'gold' && picked !== 'amoled';
      
      if (isVipOnly && !isVipActive()) {
        toast('warning', 'VIP Feature', 'Buy Premium to unlock themes.');
        openVipStore();
        return;
      }

      try {
        await set(ref(db, 'users/' + State.user.uid + '/theme'), picked);
        themeState.userTheme = picked;
        applyTheme(picked);
        renderThemeGrid();
        toast('success','Theme applied','');
      } catch (e) {
        toast('error','Cannot save','');
      }
    };
  });
}

function loadProfileExtras() {
  renderReferralStats();
}

async function shareReferral() {
  const code = State.profile?.referralCode || 'PUNJAB';
  const rs = State.referralSettings || {};

  let downloadLink = rs.downloadLink || 'https://punjabesports.app/download';
  let signupBonus = rs.signupBonus || '₹2';
  let referralBonus = rs.referralBonus || '₹2';
  let template = rs.customMessage || DEFAULT_REFERRAL_MSG;

  let shareText = template
    .replace(/\{code\}/g, code)
    .replace(/\{downloadLink\}/g, downloadLink)
    .replace(/\{signupBonus\}/g, signupBonus)
    .replace(/\{referralBonus\}/g, referralBonus);

  openShareSheet(shareText, downloadLink);
}

function openShareSheet(text, link) {
  const encText = encodeURIComponent(text);
  const encLink = encodeURIComponent(link);
  const shortLink = link.startsWith('http') ? link : 'https://' + link;

  openModal({
    title: 'Share Punjab Esports',
    bodyHTML: `
      <div class="alert info" style="margin-bottom:12px;padding:10px;"><i class="fa-solid fa-share-nodes"></i><span>Share with friends and earn rewards</span></div>
      <div class="share-grid">
        <a class="share-btn whatsapp" href="https://wa.me/?text=${encText}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></a>
        <a class="share-btn telegram" href="https://t.me/share/url?url=${encLink}&text=${encText}" target="_blank" rel="noopener"><i class="fa-brands fa-telegram"></i><span>Telegram</span></a>
        <a class="share-btn instagram" href="https://www.instagram.com/" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i><span>Instagram</span></a>
        <a class="share-btn sms" href="sms:?body=${encText}"><i class="fa-solid fa-comment-sms"></i><span>SMS</span></a>
      </div>
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--txm);margin-bottom:6px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-eye"></i> Preview Message</div>
      <div class="share-preview">${esc(text)}</div>
      <button class="btn btn-primary btn-block" id="copyFullText" style="margin-bottom:8px;"><i class="fa-solid fa-copy"></i> Copy Full Message</button>
      <button class="btn btn-outline btn-block" id="copyLinkOnly"><i class="fa-solid fa-link"></i> Copy Link Only</button>
    `,
    footerHTML: `<button class="btn btn-ghost w-100" data-x="close">Close</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="close"]').onclick = close;
      el.querySelector('#copyFullText').onclick = () => { navigator.clipboard?.writeText(text).then(() => toast('success','Message copied','')).catch(()=>toast('error','Copy failed','')); };
      el.querySelector('#copyLinkOnly').onclick = () => { navigator.clipboard?.writeText(shortLink).then(() => toast('success','Link copied','')).catch(()=>toast('error','Copy failed','')); };
    }
  });
}

function openEditProfile() {
  const p = State.profile || {};
  const isVip = isVipActive();
  
  const emojis = ['😀','😎','🔥','💀','🥶','🤡','👽','🤖','💩','👻','👾','🎮','🎯','🏆','🥇','🎬','💎','👑','⚡','🌙','🦁','🐯','🐉','🦅','🦊','🐺','🦈','🐼','🐨','🐸','🦄','🍕','🍔','🍟','🥤','🍺','🚀','🛸','✈️','🏎️','🏍️','🎸','🎧','🎤','💣','🔫','🛡️','⚔️','🏹','💪','✌️','🤘','🤙','👊','🎲','🏮','🃏','🔮','💯','💸','💰','💵','🤝','🙏'];
  const emojiPickerHTML = `<div class="emoji-grid" style="display:grid; margin-top:10px;">${emojis.map(e => `<div class="emoji-btn" data-emoji="${e}">${e}</div>`).join('')}</div>`;

  openModal({
    title: 'Edit Profile',
    bodyHTML: `
      <div class="field"><label>Free Fire Username</label><input type="text" id="epName" class="input" value="${esc(p.displayName||'')}" maxlength="40"></div>
      <div class="field"><label>Free Fire UID</label><input type="text" id="epFfUid" class="input" value="${esc(p.freeFireUid||'')}" maxlength="20"></div>
      
      <div class="field">
        <label>Profile Image</label>
        ${isVip ? 
          `<div style="display:flex; gap:10px; align-items:center;">
             <label for="epPhotoFile" class="btn btn-outline btn-sm" style="flex:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
               <i class="fa-solid fa-cloud-arrow-up"></i> <span id="epPhotoLabel">Upload Image</span>
             </label>
             <input type="file" id="epPhotoFile" accept="image/*" style="display:none;">
             <button type="button" class="btn btn-outline btn-sm" id="toggleEmojiPicker"><i class="fa-solid fa-face-smile"></i> Emoji</button>
           </div>
           <div style="font-size:0.7rem; color:var(--txm); margin-top:4px;">* Upload a square image or select an emoji.</div>`
          : 
          `<div style="display:flex; gap:10px; align-items:center;">
             <button type="button" class="btn btn-outline btn-sm" style="flex:1;" id="toggleEmojiPicker"><i class="fa-solid fa-face-smile"></i> Choose Emoji</button>
           </div>
           <div style="font-size:0.75rem; color:var(--er); margin-top:8px;">* Image upload requires VIP. Choose an emoji for free!</div>`
        }
      </div>
      
      <div id="emojiPicker" style="display:none; margin-bottom:14px;">
         ${emojiPickerHTML}
      </div>

      <input type="hidden" id="epEmoji" value="${esc(p.profileEmoji||'')}">
    `,
    footerHTML: `<button class="btn btn-ghost" data-x="c">Cancel</button><button class="btn btn-primary" data-x="ok"><i class="fa-solid fa-floppy-disk"></i> Save</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-x="c"]').onclick = close;
      
      let base64Image = null;
      const fileInput = el.querySelector('#epPhotoFile');
      if (fileInput) {
        fileInput.onchange = (ev) => {
          const file = ev.target.files[0];
          if (!file) return;
          const labelSpan = el.querySelector('#epPhotoLabel');
          if (labelSpan) labelSpan.textContent = file.name.length > 16 ? file.name.substring(0, 13) + '...' : file.name;
          const reader = new FileReader();
          reader.onload = (e) => {
            base64Image = e.target.result;
            if (base64Image.length > 500 * 1024) { 
              toast('error', 'Too Large', 'Image must be under 500KB. Please compress it.');
              base64Image = null;
              fileInput.value = '';
              if (labelSpan) labelSpan.textContent = 'Upload Image';
            } else {
              toast('success', 'Image Selected', 'Ready to save.');
            }
          };
          reader.readAsDataURL(file);
        };
      }

      const toggleEmojiBtn = el.querySelector('#toggleEmojiPicker');
      const picker = el.querySelector('#emojiPicker');
      toggleEmojiBtn.onclick = () => { picker.style.display = picker.style.display === 'none' ? 'block' : 'none'; };

      el.querySelectorAll('#emojiPicker [data-emoji]').forEach(eb => {
        eb.onclick = () => {
          const emoji = eb.dataset.emoji;
          el.querySelector('#epEmoji').value = emoji;
          if(fileInput) fileInput.value = '';
          const labelSpan = el.querySelector('#epPhotoLabel');
          if (labelSpan) labelSpan.textContent = 'Upload Image';
          base64Image = null;
          toast('success', 'Emoji Selected', emoji);
          picker.style.display = 'none';
        };
      });

      el.querySelector('[data-x="ok"]').onclick = async () => {
        const name = el.querySelector('#epName').value.trim();
        const ff = el.querySelector('#epFfUid').value.trim();
        const chosenEmoji = el.querySelector('#epEmoji').value;
        
        if (name.length < 2) { toast('error','Invalid Name',''); return; }
        if (ff && !/^\d{6,15}$/.test(ff)) { toast('error','Invalid FF UID',''); return; }
        
        let finalPhotoUrl = p.photoUrl || '';
        let finalEmoji = chosenEmoji || '';

        if (base64Image) {
           if (!isVip) { toast('error','VIP Only','Upgrade to add profile photo.'); return; }
           finalPhotoUrl = base64Image;
           finalEmoji = '';
        } else if (finalEmoji) {
           finalPhotoUrl = '';
        } else if (p.photoUrl) {
           finalPhotoUrl = p.photoUrl;
        }

        try {
          await update(ref(db, 'users/' + State.user.uid), { 
            displayName: name, 
            freeFireUid: ff, 
            photoUrl: finalPhotoUrl,
            profileEmoji: finalEmoji,
            updatedAt: Date.now() 
          });
          await update(ref(db, 'publicProfiles/' + State.user.uid), { displayName: name, freeFireUid: ff, photoUrl: finalPhotoUrl, profileEmoji: finalEmoji });
          
          State.profile = { ...State.profile, displayName: name, freeFireUid: ff, photoUrl: finalPhotoUrl, profileEmoji: finalEmoji };
          loadProfileUI(); updateGreeting();
          toast('success','Saved','Profile updated.');
          close();
        } catch (e) { toast('error','Failed',e.message); }
      };
    }
  });
}

function openRules() {
  openModal({
    title: 'Terms & Fair Play Policy',
    bodyHTML: `<h4>1. Fair Play</h4><p>No hacking, cheating, teaming, or unauthorized tools.</p><h4>2. Entry & Rewards</h4><p>Entry fees deducted on confirmed registration. Rewards credited after admin verification.</p><h4>3. Refunds</h4><p>Cancelled matches refunded per admin policy. If admin cancels a match, the entry fee is auto-refunded to the payer.</p><h4>4. Withdrawals</h4><p>Minimum withdrawal set by admin. Manual UPI payout.</p><h4>5. VIP & Premium</h4><p>VIP features are time-bound. Once expired, access to themes, chat, blue tick, and Direct Admin DM will be revoked automatically. Diamonds are non-refundable once spent.</p><h4>6. Teams</h4><p>Squads can be created for free. Duo & Squad matches require an active ₹5/month Maintenance Pass. First-time users get a 7-day free trial. Pass payments are non-refundable.</p><h4>7. Account</h4><p>You are responsible for your account credentials.</p>`,
    footerHTML: `<button class="btn btn-primary w-100" data-x="close">Close</button>`,
    onMount: (el, close) => { el.querySelector('[data-x="close"]').onclick = close; }
  });
}

function initSpinWheel() {
  return;
}


// ========================================================
// STATUS BAR & NAVIGATION BAR COLOR SYNC
// ========================================================
function syncAppBars(isDark) {
  const barColor = isDark ? '#000000' : '#ffffff';
  const meta = document.getElementById('appThemeColor');
  if (meta) meta.setAttribute('content', barColor);
  document.documentElement.style.backgroundColor = barColor;
  if (document.body) document.body.style.backgroundColor = barColor;
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) bottomNav.style.backgroundColor = barColor;
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.backgroundColor = barColor;
}

// ========================================================
// SCREENSHOT 2: TERMS OF USE & PRIVACY POLICY MODAL
// ========================================================
function showTermsModal(onAgreeCallback) {
  const modalDiv = document.createElement('div');
  modalDiv.className = 'terms-modal-overlay';
  modalDiv.id = 'termsPromptModal';
  modalDiv.innerHTML = `
    <div class="terms-modal-card">
      <h3>Terms of Use and Privacy Policy</h3>
      <p>I confirm that I have read and agree to Punjab Esports's Terms of Use and Privacy Policy</p>
      <div class="terms-modal-btns">
        <button class="terms-modal-btn cancel" id="btnTermsCancel">Cancel</button>
        <button class="terms-modal-btn agree" id="btnTermsAgree">Agree</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);

  modalDiv.querySelector('#btnTermsCancel').onclick = () => {
    modalDiv.remove();
  };

  modalDiv.querySelector('#btnTermsAgree').onclick = () => {
    modalDiv.remove();
    const radio = document.getElementById('authRadioCircle');
    if (radio) radio.classList.add('checked');
    if (typeof onAgreeCallback === 'function') onAgreeCallback();
  };
}

// ========================================================
// SCREENSHOT 3: CHOOSE AN ACCOUNT (GOOGLE ACCOUNT CHOOSER)
// ========================================================
const GOOGLE_ACCOUNTS = [
  { name: 'ANMOLPREET Singh', email: 'anmolpreetsingh47902@gmail.com', initial: 'A', bg: '#e11d48' },
  { name: 'PB ANMOL', email: 'pbanmol025@gmail.com', initial: 'P', bg: '#0d9488' },
  { name: 'Story Vault', email: 'storyvault858@gmail.com', initial: 'S', bg: '#475569' },
  { name: 'Anmol Singh', email: 'singhanmol3988@gmail.com', initial: 'A', bg: '#7c3aed' },
  { name: 'Anmol preet Singh', email: 'anmolpreetsingh87608@gmail.com', initial: 'A', bg: '#334155' },
  { name: 'anmol', email: 'anmmolchannel1@gmail.com', initial: 'a', bg: '#c026d3' },
  { name: 'ANMOL H', email: 'anmolh707@gmail.com', initial: 'A', bg: '#0284c7' },
  { name: 'anmol channel 2', email: 'anmolchannel17@gmail.com', initial: 'a', bg: '#d97706' },
  { name: 'Zor Hub', email: 'hubzor3@gmail.com', initial: 'Z', bg: '#0891b2' }
];

function showGoogleAccountChooser() {
  const existing = document.getElementById('googleAccountChooserModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'account-chooser-overlay';
  overlay.id = 'googleAccountChooserModal';

  let listHtml = '';
  GOOGLE_ACCOUNTS.forEach(acc => {
    listHtml += `
      <button class="account-item-btn" data-email="${acc.email}" data-name="${acc.name}">
        <div class="account-avatar-circle" style="background-color: ${acc.bg}">${acc.initial}</div>
        <div class="account-item-info">
          <div class="account-item-name">${acc.name}</div>
          <div class="account-item-email">${acc.email}</div>
        </div>
      </button>
    `;
  });

  listHtml += `
    <button class="account-item-btn" id="btnUseAnotherAccount">
      <div class="account-avatar-circle" style="background-color: #64748b"><i class="fa-solid fa-user-plus text-sm"></i></div>
      <div class="account-item-info">
        <div class="account-item-name">Use another account</div>
      </div>
    </button>
  `;

  overlay.innerHTML = `
    <div class="account-chooser-sheet">
      <div class="account-chooser-header">
        <div class="account-chooser-logo">
          <img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Logo">
        </div>
        <div class="account-chooser-title">Choose an account</div>
        <div class="account-chooser-subtitle">to continue to Punjab Esports</div>
      </div>
      <div class="account-chooser-list">
        ${listHtml}
      </div>
      <button class="btn btn-outline btn-block mt-2" id="btnCloseAccountChooser">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#btnCloseAccountChooser').onclick = () => overlay.remove();

  overlay.querySelectorAll('.account-item-btn[data-email]').forEach(btn => {
    btn.onclick = async () => {
      const email = btn.getAttribute('data-email');
      const name = btn.getAttribute('data-name');
      overlay.remove();
      await handleGoogleAccountLogin(email, name);
    };
  });

  overlay.querySelector('#btnUseAnotherAccount').onclick = () => {
    overlay.remove();
    openClassicAuth('login');
  };
}

async function handleGoogleAccountLogin(email, name) {
  showSplash();
  const defaultPass = 'Punjab@1234';

  try {
    await signInWithEmailAndPassword(auth, email, defaultPass);
    // onAuthStateChanged will handle loading the app
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      hideSplash();
      promptNewUserRegistration(email, name);
    } else if (err.code === 'auth/wrong-password') {
      hideSplash();
      toast('info', 'Password Required', 'Please enter your password to sign in.');
      openClassicAuth('login');
      const emailInput = document.getElementById('loginEmail');
      if (emailInput) emailInput.value = email;
    } else {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, defaultPass);
        await updateProfile(cred.user, { displayName: name });
        hideSplash();
        promptNewUserRegistration(email, name, cred.user);
      } catch (createErr) {
        hideSplash();
        promptNewUserRegistration(email, name);
      }
    }
  }
}

function promptNewUserRegistration(email, name, preCreatedUser = null) {
  openModal({
    title: 'Complete Free Fire Profile',
    bodyHTML: `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:40px;height:40px;border-radius:10px;background:var(--bg);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;padding:4px">
          <img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" style="width:100%;height:100%;object-fit:contain">
        </div>
        <div>
          <b style="color:var(--tx)">Welcome, ${name}</b>
          <p style="font-size:0.75rem;margin:0;color:var(--txm)">${email}</p>
        </div>
      </div>
      <div class="field">
        <label>Free Fire Username <span class="req">*</span></label>
        <input type="text" id="gRegFfName" class="input" placeholder="e.g. PB_ANMOL" required>
      </div>
      <div class="field">
        <label>Free Fire UID (Numbers) <span class="req">*</span></label>
        <input type="text" id="gRegFfUid" class="input" placeholder="e.g. 123456789" maxlength="15" required>
      </div>
    `,
    footerHTML: `
      <div style="display:flex;gap:10px;width:100%">
        <button class="btn btn-outline" style="flex:1" data-x="cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:2" id="gRegSubmitBtn">Join Punjab Esports</button>
      </div>
    `,
    onMount: (el, close) => {
      el.querySelector('[data-x="cancel"]').onclick = close;
      el.querySelector('#gRegSubmitBtn').onclick = async () => {
        const ffName = el.querySelector('#gRegFfName').value.trim();
        const ffUid = el.querySelector('#gRegFfUid').value.trim();
        if (!ffName || !ffUid) {
          toast('warning', 'Required', 'Please fill Free Fire details');
          return;
        }

        const submitBtn = el.querySelector('#gRegSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Setting up…';

        try {
          let user = preCreatedUser || auth.currentUser;
          if (!user) {
            const cred = await createUserWithEmailAndPassword(auth, email, 'Punjab@1234');
            user = cred.user;
            await updateProfile(user, { displayName: ffName || name });
          }

          const now = Date.now();
          const refCode = 'PE' + user.uid.slice(0, 5).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

          await set(ref(db, 'users/' + user.uid), {
            uid: user.uid,
            displayName: ffName || name,
            email: email,
            freeFireUid: ffUid,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            referralCode: refCode,
            diamonds: 0,
            hasUsedTeamTrial: false,
            hasUsedVipTrial: true,
            vipExpiry: now + (7 * 24 * 60 * 60 * 1000)
          });

          await set(ref(db, 'wallets/' + user.uid), {
            balance: 10,
            reserved: 0,
            updatedAt: now
          });

          toast('success', 'Welcome!', 'Profile created with ₹10 Welcome Bonus and 7-day VIP Trial!');
          close();
          checkMediaPermissionDialog();
        } catch (e) {
          toast('error', 'Setup Failed', e.message);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Join Punjab Esports';
        }
      };
    }
  });
}

function checkMediaPermissionDialog() {
  if (localStorage.getItem('pe_media_permission_asked')) return;
  localStorage.setItem('pe_media_permission_asked', 'true');

  setTimeout(() => {
    openModal({
      title: 'Media & Storage Access',
      bodyHTML: `
        <div style="text-align:center;padding:10px 0">
          <i class="fa-solid fa-photo-film" style="font-size:2.8rem;color:var(--ac);margin-bottom:12px"></i>
          <p style="font-size:0.9rem;color:var(--tx);font-weight:600">Allow Punjab Esports to access photos and media on this device?</p>
          <p style="font-size:0.75rem;color:var(--txm)">This allows you to select custom avatars and team emblems directly from your gallery.</p>
        </div>
      `,
      footerHTML: `
        <div style="display:flex;gap:10px;width:100%">
          <button class="btn btn-outline" style="flex:1" data-x="deny">Don't allow</button>
          <button class="btn btn-primary" style="flex:1" data-x="allow">Allow</button>
        </div>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-x="deny"]').onclick = close;
        el.querySelector('[data-x="allow"]').onclick = () => {
          toast('success', 'Permission Granted', 'Gallery access enabled.');
          close();
        };
      }
    });
  }, 1000);
}

function openClassicAuth(tab = 'login') {
  const modal = document.getElementById('classicAuthModal');
  if (modal) {
    modal.style.display = 'grid';
    const tabBtn = modal.querySelector(`.auth-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

function closeClassicAuth() {
  const modal = document.getElementById('classicAuthModal');
  if (modal) modal.style.display = 'none';
}

function initNewAuthFlow() {
  const btnGoogle = document.getElementById('btnContinueGoogle');
  const btnPassword = document.getElementById('btnContinuePassword');
  const btnSignup = document.getElementById('btnContinueSignup');
  const termsBar = document.getElementById('authTermsBar');
  const radioCircle = document.getElementById('authRadioCircle');
  const closeClassic = document.getElementById('closeClassicAuthBtn');
  const termsLink = document.getElementById('authTermsLink');
  const privacyLink = document.getElementById('authPrivacyLink');

  if (termsLink) termsLink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRules(); };
  if (privacyLink) privacyLink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRules(); };
  if (closeClassic) closeClassic.onclick = closeClassicAuth;

  if (termsBar && radioCircle) {
    termsBar.onclick = () => {
      radioCircle.classList.toggle('checked');
    };
  }

  function isTermsChecked() {
    return radioCircle && radioCircle.classList.contains('checked');
  }

  if (btnGoogle) {
    btnGoogle.onclick = () => {
      playClickSound();
      if (!isTermsChecked()) {
        showTermsModal(() => showGoogleAccountChooser());
      } else {
        showGoogleAccountChooser();
      }
    };
  }

  if (btnPassword) {
    btnPassword.onclick = () => {
      playClickSound();
      if (!isTermsChecked()) {
        showTermsModal(() => openClassicAuth('login'));
      } else {
        openClassicAuth('login');
      }
    };
  }

  if (btnSignup) {
    btnSignup.onclick = () => {
      playClickSound();
      if (!isTermsChecked()) {
        showTermsModal(() => openClassicAuth('register'));
      } else {
        openClassicAuth('register');
      }
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNewAuthFlow);
} else {
  initNewAuthFlow();
}

window.PE = { State, toast, openModal, confirmDialog, playNotifSound, openVipStore, openAdminDM, loadMyTeam, renderMyTeam, switchMyTab };
console.log('%cPunjab Esports v2.5.1 — Royal Gold', 'color:#d4af37;font-weight:bold;font-size:14px');
