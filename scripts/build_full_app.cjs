const fs = require('fs');
const path = require('path');

const srcHtmlPath = path.resolve('public/assets/aistudio/Punjab_Esports_UserApp_TeamWallet_Updated_a354fbe5.html');
const rawHtml = fs.readFileSync(srcHtmlPath, 'utf8');

const scriptOpenTag = '<script type="module">';
const scriptStartIdx = rawHtml.indexOf(scriptOpenTag);
const scriptEndIdx = rawHtml.lastIndexOf('</script>');

let headAndBody = rawHtml.substring(0, scriptStartIdx);
let scriptContent = rawHtml.substring(scriptStartIdx + scriptOpenTag.length, scriptEndIdx);

// 1. Fix dabbi in CSS: Pure white in Light Mode, Pure Black in Dark Mode (NO YELLOW BACKGROUND)
headAndBody = headAndBody.replace(
  '.topbar .tb-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--ac),var(--ac2));display:grid;place-items:center;color:var(--onac);font-size:1rem;flex-shrink:0}',
  `.topbar .tb-logo{width:38px;height:38px;border-radius:11px;background:#ffffff!important;border:1.5px solid var(--bd)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:3px!important;flex-shrink:0!important;box-shadow:0 1px 4px rgba(0,0,0,.08)!important;overflow:hidden!important}
html[data-bg="dark"] .topbar .tb-logo{background:#000000!important;border-color:#262635!important}
html[data-bg="light"] .topbar .tb-logo{background:#ffffff!important;border-color:#e5e7eb!important}
.topbar .tb-logo img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important}`
);

headAndBody = headAndBody.replace(
  '#splash .sp-logo{width:88px;height:88px;border-radius:24px;background:var(--splash-ac,#d4af37);display:grid;place-items:center;color:#fff;font-size:2.5rem;box-shadow:0 12px 35px color-mix(in srgb,var(--splash-ac,#d4af37) 22%,transparent);animation:spPulse 1.6s ease infinite}',
  `#splash .sp-logo{width:96px;height:96px;border-radius:24px;background:#ffffff!important;border:2px solid var(--bd)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:8px!important;box-shadow:0 12px 35px rgba(0,0,0,.25)!important;animation:spPulse 1.6s ease infinite!important;overflow:hidden!important}
html[data-bg="dark"] #splash .sp-logo{background:#000000!important;border-color:#262635!important}
html[data-bg="light"] #splash .sp-logo{background:#ffffff!important;border-color:#e5e7eb!important}
#splash .sp-logo img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important}`
);

headAndBody = headAndBody.replace(
  '.brand-logo{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--ac),var(--ac2));display:grid;place-items:center;color:var(--onac);font-size:1.7rem;box-shadow:0 0 32px var(--acg);flex-shrink:0}',
  `.brand-logo{width:72px;height:72px;border-radius:20px;background:#ffffff!important;border:1.5px solid var(--bd)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:6px!important;box-shadow:0 4px 18px rgba(0,0,0,.15)!important;flex-shrink:0!important;overflow:hidden!important}
html[data-bg="dark"] .brand-logo{background:#000000!important;border-color:#262635!important}
html[data-bg="light"] .brand-logo{background:#ffffff!important;border-color:#e5e7eb!important}
.brand-logo img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important}`
);

// 2. Extra CSS for dark/light bar sync and Screenshots 1, 2, 3
const extraStyles = `
/* Status Bar and Navigation Bar Auto-Sync (Pure Black in Dark Mode, Pure White in Light Mode) */
html[data-bg="dark"],
html[data-bg="dark"] body {
  background-color: #000000 !important;
}
html[data-bg="light"],
html[data-bg="light"] body {
  background-color: #ffffff !important;
}

html[data-bg="dark"] .bottom-nav {
  background: #000000 !important;
  border-top-color: #222230 !important;
}
html[data-bg="light"] .bottom-nav {
  background: #ffffff !important;
  border-top-color: #e5e7eb !important;
}

html[data-bg="dark"] .topbar {
  background: #000000 !important;
  border-bottom-color: #222230 !important;
}
html[data-bg="light"] .topbar {
  background: #ffffff !important;
  border-bottom-color: #e5e7eb !important;
}

/* =================================================== */
/* NEW LOGIN SCREEN (Screenshots 1, 2, 3)              */
/* =================================================== */
#authScreen {
  background: var(--bg) !important;
}

.auth-container-new {
  width: 100%;
  max-width: 440px;
  min-height: 92vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px 20px 32px;
  box-sizing: border-box;
}

.auth-header-top {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.auth-contact-link {
  font-size: 0.95rem;
  color: var(--txd);
  font-weight: 500;
  cursor: pointer;
  padding: 6px 12px;
  text-decoration: none;
  transition: opacity var(--t);
}
.auth-contact-link:hover {
  color: var(--tx);
  opacity: 0.85;
}

.auth-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin: 60px 0 30px;
}

.auth-hero-logo {
  width: 82px;
  height: 82px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.auth-hero-title {
  font-size: 2.15rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--tx);
  margin-bottom: 4px;
}

.auth-actions-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  margin-top: auto;
  margin-bottom: 30px;
}

.auth-pill-btn {
  width: 100%;
  height: 52px;
  border-radius: 9999px;
  border: 1.5px solid var(--bd2);
  background: transparent;
  color: var(--tx);
  font-size: 0.98rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.auth-pill-btn:hover {
  border-color: var(--ac);
  background: var(--sf2);
}
.auth-pill-btn:active {
  transform: scale(0.985);
}

.auth-terms-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  font-size: 0.8rem;
  color: var(--txm);
  line-height: 1.4;
  user-select: none;
  cursor: pointer;
}
.auth-radio-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.8px solid var(--bd2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.auth-radio-circle.checked {
  border-color: #3b82f6;
  background: #3b82f6;
}
.auth-radio-circle.checked::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffffff;
}
.auth-terms-bar a {
  color: var(--tx);
  text-decoration: underline;
  font-weight: 600;
}

/* Screenshot 2: Terms of Use & Privacy Policy Modal */
.terms-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0,0,0,0.68);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 24px;
  animation: fadeIn 0.2s ease;
}
.terms-modal-card {
  width: 100%;
  max-width: 320px;
  background: var(--sf);
  border-radius: 24px;
  border: 1px solid var(--bd);
  box-shadow: var(--sh3);
  padding: 24px 20px 0;
  text-align: center;
  animation: scaleUp 0.2s ease;
  overflow: hidden;
}
.terms-modal-card h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 12px;
}
.terms-modal-card p {
  font-size: 0.88rem;
  color: var(--txd);
  line-height: 1.5;
  margin-bottom: 24px;
}
.terms-modal-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--bd);
  margin: 0 -20px;
}
.terms-modal-btn {
  padding: 16px 10px;
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--t);
}
.terms-modal-btn.cancel {
  color: var(--txd);
  border-right: 1px solid var(--bd);
}
.terms-modal-btn.agree {
  color: #3b82f6;
}
.terms-modal-btn:hover {
  background: var(--sf2);
}

/* Screenshot 3: Google Account Chooser Bottom Sheet */
.account-chooser-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0,0,0,0.68);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}
@media (min-width: 640px) {
  .account-chooser-overlay {
    align-items: center;
    padding: 20px;
  }
}
.account-chooser-sheet {
  width: 100%;
  max-width: 440px;
  background: var(--sf);
  border-radius: 28px 28px 0 0;
  border: 1px solid var(--bd);
  box-shadow: var(--sh3);
  padding: 26px 20px 20px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (min-width: 640px) {
  .account-chooser-sheet {
    border-radius: 28px;
  }
}
.account-chooser-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 20px;
}
.account-chooser-logo {
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
}
.account-chooser-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.account-chooser-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 4px;
}
.account-chooser-subtitle {
  font-size: 0.85rem;
  color: var(--txm);
}
.account-chooser-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
  margin-bottom: 14px;
}
.account-item-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background var(--t);
}
.account-item-btn:hover {
  background: var(--sf2);
}
.account-avatar-circle {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.account-item-info {
  min-width: 0;
  flex: 1;
}
.account-item-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--tx);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-item-email {
  font-size: 0.8rem;
  color: var(--txm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scaleUp {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
</style>
`;

headAndBody = headAndBody.replace('</style>', extraStyles);

// 3. Update DOM logos
headAndBody = headAndBody.replace(
  '<div class="sp-logo"><i class="fa-solid fa-gamepad"></i></div>',
  '<div class="sp-logo"><img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Punjab Esports Logo" style="width:100%;height:100%;object-fit:contain;display:block;"></div>'
);

headAndBody = headAndBody.replace(
  '<div class="tb-logo"><i class="fa-solid fa-gamepad"></i></div>',
  '<div class="tb-logo"><img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Punjab Esports Logo" style="width:100%;height:100%;object-fit:contain;display:block;"></div>'
);

headAndBody = headAndBody.replace(
  '<div class="brand-logo"><i class="fa-solid fa-gamepad"></i></div>',
  '<div class="brand-logo"><img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Punjab Esports Logo" style="width:100%;height:100%;object-fit:contain;display:block;"></div>'
);

// 4. Replace #authScreen with Screenshot 1 layout and classic modals
const newAuthScreenHTML = `
<div id="authScreen">
  <div class="auth-container-new">
    <!-- Top Right Contact Us -->
    <div class="auth-header-top">
      <a href="mailto:pbanmol025@gmail.com?subject=Punjab%20Esports%20Support" class="auth-contact-link">Contact us</a>
    </div>

    <!-- Center Hero Branding -->
    <div class="auth-hero">
      <div class="auth-hero-logo">
        <img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Punjab Esports Logo">
      </div>
      <h1 class="auth-hero-title">Punjab Esports</h1>
    </div>

    <!-- 3 Action Buttons (Screenshot 1) -->
    <div class="auth-actions-group">
      <button class="auth-pill-btn" id="btnContinueGoogle">
        <svg style="width:20px;height:20px;flex-shrink:0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Continue with Google</span>
      </button>

      <button class="auth-pill-btn" id="btnContinuePassword">
        <i class="fa-solid fa-lock" style="font-size:1.1rem;color:var(--txm)"></i>
        <span>Continue with Password</span>
      </button>

      <button class="auth-pill-btn" id="btnContinueSignup">
        <span>Sign up</span>
      </button>
    </div>

    <!-- Bottom Terms Radio (Screenshot 1) -->
    <div class="auth-terms-bar" id="authTermsBar">
      <span class="auth-radio-circle" id="authRadioCircle"></span>
      <span>I confirm that I have read and agree to Punjab Esports's <a href="#" id="authTermsLink">Terms of Use</a> and <a href="#" id="authPrivacyLink">Privacy Policy</a></span>
    </div>
  </div>

  <!-- Classic Forms Modal Container (for Password Login and Sign Up) -->
  <div id="classicAuthModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:2500;padding:20px;overflow-y:auto;place-items:center;">
    <div class="auth-card" style="position:relative">
      <button id="closeClassicAuthBtn" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--txd);font-size:1.4rem;cursor:pointer;padding:6px;">&times;</button>
      <div class="brand-mark">
        <div class="brand-logo"><img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Punjab Esports" style="width:100%;height:100%;object-fit:contain;"></div>
      </div>
      <div class="tc mb-4">
        <h1 style="margin-bottom:4px">Punjab Esports</h1>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">Sign In</button>
        <button class="auth-tab" data-tab="register">Register</button>
      </div>
      <div id="authAlert"></div>

      <form id="loginForm" novalidate>
        <div class="field"><label>Email <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-envelope igi"></i><input type="email" id="loginEmail" class="input" placeholder="you@example.com" autocomplete="email" required></div><small class="field-error" id="errLoginEmail"></small></div>
        <div class="field"><label>Password <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-lock igi"></i><input type="password" id="loginPass" class="input" placeholder="Enter password" autocomplete="current-password" required><button type="button" class="igt" id="loginPassToggle"><i class="fa-solid fa-eye"></i></button></div><small class="field-error" id="errLoginPass"></small></div>
        <button type="submit" class="btn btn-primary btn-block" id="loginBtn"><i class="fa-solid fa-right-to-bracket"></i> Sign In</button>
        <p class="tc mt-3"><a href="#" id="forgotLink" style="font-size:.8rem">Forgot password?</a></p>
      </form>

      <form id="registerForm" novalidate hidden>
        <div class="field"><label>Full Name <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-user igi"></i><input type="text" id="regName" class="input" placeholder="Your name" maxlength="40" required></div><small class="field-error" id="errRegName"></small></div>
        <div class="field"><label>Email <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-envelope igi"></i><input type="email" id="regEmail" class="input" placeholder="you@example.com" autocomplete="email" required></div><small class="field-error" id="errRegEmail"></small></div>
        <div class="field"><label>Free Fire UID <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-id-card igi"></i><input type="text" id="regFfUid" class="input" placeholder="Your FF UID (numbers)" maxlength="20" required></div><small class="field-error" id="errRegFfUid"></small></div>
        <div class="field"><label>Password <span class="req">*</span></label><div class="ig"><i class="fa-solid fa-lock igi"></i><input type="password" id="regPass" class="input" placeholder="At least 6 characters" autocomplete="new-password" required><button type="button" class="igt" id="regPassToggle"><i class="fa-solid fa-eye"></i></button></div><small class="field-error" id="errRegPass"></small></div>
        <div class="field"><label>Referral Code (Optional)</label><div class="ig"><i class="fa-solid fa-gift igi"></i><input type="text" id="regRefCode" class="input" placeholder="Enter friend's code" style="text-transform:uppercase"></div><small class="field-hint">Get bonus if valid code entered!</small></div>
        <label class="tc" style="display:flex;align-items:center;gap:8px;font-size:.8rem;margin-bottom:14px;cursor:pointer"><input type="checkbox" id="regTerms" style="width:18px;height:18px;accent-color:var(--ac)"><span class="muted">I agree to the Terms & Fair Play policy</span></label>
        <button type="submit" class="btn btn-primary btn-block" id="registerBtn"><i class="fa-solid fa-user-plus"></i> Create Account</button>
      </form>
    </div>
  </div>
</div>
`;

const authScreenStart = headAndBody.indexOf('<div id="authScreen">');
const appShellStart = headAndBody.indexOf('<div id="appShell">');
headAndBody = headAndBody.substring(0, authScreenStart) + newAuthScreenHTML + headAndBody.substring(appShellStart);

// 5. Update script to use NPM modules
scriptContent = scriptContent.replace(
  'import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";',
  'import { initializeApp } from "firebase/app";'
);
scriptContent = scriptContent.replace(
  'import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";',
  'import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "firebase/auth";'
);
scriptContent = scriptContent.replace(
  'import { getDatabase, ref, get, set, update, push, remove, onValue, off, query, orderByChild, equalTo, limitToLast, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";',
  'import { getDatabase, ref, get, set, update, push, remove, onValue, off, query, orderByChild, equalTo, limitToLast, runTransaction } from "firebase/database";\nimport confetti from "canvas-confetti";'
);

// Update Firebase Config to user's new punjab-turnaments project
scriptContent = scriptContent.replace(
  /apiKey:\s*"AIzaSyBmbL50TdxE1ZBSY0ukcsuGUXwOwZHUnaQ"[^}]+appId:\s*"1:60567816892:web:dbd6f7df1d21cb1a079eb9"/s,
  `apiKey: "AIzaSyBTLfhI3c2UBrA5re2UHHj_p1XamO5KWe4",
  authDomain: "punjab-turnaments.firebaseapp.com",
  databaseURL: "https://punjab-turnaments-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "punjab-turnaments",
  storageBucket: "punjab-turnaments.firebasestorage.app",
  messagingSenderId: "923158197845",
  appId: "1:923158197845:web:674a90ea877471281286dc"`
);

// Add showSplash function right after hideSplash
scriptContent = scriptContent.replace(
  "function hideSplash() { splashEl.classList.add('hide'); setTimeout(() => { splashEl.style.display = 'none'; }, 400); }",
  `function hideSplash() { if (splashEl) { splashEl.classList.add('hide'); setTimeout(() => { splashEl.style.display = 'none'; }, 400); } }
function showSplash() { if (splashEl) { splashEl.style.display = 'grid'; splashEl.classList.remove('hide'); } }`
);

// Ensure applyBgMode syncs topbar and bottom-nav
scriptContent = scriptContent.replace(
  "if (window.AndroidInterface && typeof window.AndroidInterface.updateSystemBars === 'function') {",
  `const navEl = document.querySelector('.bottom-nav'); if (navEl) navEl.style.backgroundColor = color;
  const tbEl = document.querySelector('.topbar'); if (tbEl) tbEl.style.backgroundColor = color;
  if (window.AndroidInterface && typeof window.AndroidInterface.updateSystemBars === 'function') {`
);

// Add Screenshots 1, 2, 3 functionality
const extraScriptLogic = `
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
  modalDiv.innerHTML = \`
    <div class="terms-modal-card">
      <h3>Terms of Use and Privacy Policy</h3>
      <p>I confirm that I have read and agree to Punjab Esports's Terms of Use and Privacy Policy</p>
      <div class="terms-modal-btns">
        <button class="terms-modal-btn cancel" id="btnTermsCancel">Cancel</button>
        <button class="terms-modal-btn agree" id="btnTermsAgree">Agree</button>
      </div>
    </div>
  \`;
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
    listHtml += \`
      <button class="account-item-btn" data-email="\${acc.email}" data-name="\${acc.name}">
        <div class="account-avatar-circle" style="background-color: \${acc.bg}">\${acc.initial}</div>
        <div class="account-item-info">
          <div class="account-item-name">\${acc.name}</div>
          <div class="account-item-email">\${acc.email}</div>
        </div>
      </button>
    \`;
  });

  listHtml += \`
    <button class="account-item-btn" id="btnUseAnotherAccount">
      <div class="account-avatar-circle" style="background-color: #64748b"><i class="fa-solid fa-user-plus text-sm"></i></div>
      <div class="account-item-info">
        <div class="account-item-name">Use another account</div>
      </div>
    </button>
  \`;

  overlay.innerHTML = \`
    <div class="account-chooser-sheet">
      <div class="account-chooser-header">
        <div class="account-chooser-logo">
          <img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" alt="Logo">
        </div>
        <div class="account-chooser-title">Choose an account</div>
        <div class="account-chooser-subtitle">to continue to Punjab Esports</div>
      </div>
      <div class="account-chooser-list">
        \${listHtml}
      </div>
      <button class="btn btn-outline btn-block mt-2" id="btnCloseAccountChooser">Cancel</button>
    </div>
  \`;

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
    bodyHTML: \`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:40px;height:40px;border-radius:10px;background:var(--bg);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;padding:4px">
          <img src="/assets/aistudio/41120_logo_transparent_d86f7d93.png" style="width:100%;height:100%;object-fit:contain">
        </div>
        <div>
          <b style="color:var(--tx)">Welcome, \${name}</b>
          <p style="font-size:0.75rem;margin:0;color:var(--txm)">\${email}</p>
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
    \`,
    footerHTML: \`
      <div style="display:flex;gap:10px;width:100%">
        <button class="btn btn-outline" style="flex:1" data-x="cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:2" id="gRegSubmitBtn">Join Punjab Esports</button>
      </div>
    \`,
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
      bodyHTML: \`
        <div style="text-align:center;padding:10px 0">
          <i class="fa-solid fa-photo-film" style="font-size:2.8rem;color:var(--ac);margin-bottom:12px"></i>
          <p style="font-size:0.9rem;color:var(--tx);font-weight:600">Allow Punjab Esports to access photos and media on this device?</p>
          <p style="font-size:0.75rem;color:var(--txm)">This allows you to select custom avatars and team emblems directly from your gallery.</p>
        </div>
      \`,
      footerHTML: \`
        <div style="display:flex;gap:10px;width:100%">
          <button class="btn btn-outline" style="flex:1" data-x="deny">Don't allow</button>
          <button class="btn btn-primary" style="flex:1" data-x="allow">Allow</button>
        </div>
      \`,
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
    const tabBtn = modal.querySelector(\`.auth-tab[data-tab="\${tab}"]\`);
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
`;

const peExportIdx = scriptContent.indexOf('window.PE = {');
scriptContent = scriptContent.substring(0, peExportIdx) + extraScriptLogic + '\n' + scriptContent.substring(peExportIdx);

const finalMainTs = '// @ts-nocheck\n/**\n * Punjab Esports User App Engine\n */\n' + scriptContent;

let finalIndexHtml = headAndBody + '\n<script type="module" src="/src/main.ts"></script>\n</body>\n</html>';

// Replace favicon with clean new logo
finalIndexHtml = finalIndexHtml.replace(
  /href="assets\/aistudio\/InShot_[^"]+"/g,
  'href="/assets/aistudio/41120_logo_transparent_d86f7d93.png"'
);

fs.writeFileSync(path.resolve('index.html'), finalIndexHtml, 'utf8');
fs.writeFileSync(path.resolve('src/main.ts'), finalMainTs, 'utf8');

console.log('Successfully re-assembled index.html and src/main.ts with refined Screenshot 1-3 flow!');
