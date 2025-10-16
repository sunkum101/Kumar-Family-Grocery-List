// --- AUTH & DOM READY ---
document.addEventListener("DOMContentLoaded", function () {
  // --- Set application title and branding ---
  const mainTitle = document.querySelector('.center-title');
  if (mainTitle) {
    mainTitle.innerHTML = '<i class="fas fa-clipboard-check" style="margin-right: 10px; color: #1976d2;"></i> <span class="modern-title-main">Your <span class="brand-accent">SwiftList</span></span><i id="help-icon" class="fas fa-question-circle" style="font-size: 0.6em; color: #757575; cursor: pointer; vertical-align: super; margin-left: 8px;" title="Help"></i>';
  }
  const loginTitle = document.querySelector('.login-title-modern');
  if (loginTitle) {
    loginTitle.innerHTML = 'Welcome to <span class="modern-title-main">Your <span class="brand-accent">SwiftList</span></span>';
  }
  const loginLogo = document.querySelector('.login-logo-modern');
  if (loginLogo) {
    loginLogo.innerHTML = '<i class="fas fa-clipboard-check" style="font-size: 48px; color: #1976d2;"></i>';
  }

  // --- Ensure Firebase SDK is loaded ---
  if (typeof firebase === "undefined" || !firebase.app) {
    alert("Firebase SDK not loaded. Please check your internet connection and script includes.");
    return;
  }

  // --- Hide the Edit button on load ---
  const moveDeleteBtn = document.getElementById('move-delete-toggle');
  if (moveDeleteBtn) {
    moveDeleteBtn.style.display = 'none';
  }

  // --- Prevent double initialization ---
  if (!firebase.apps.length) {
    const firebaseConfig = {
      apiKey: "AIzaSyADHt2ZI5eCYLWs9hA16WJaL16C8REHbMI",
      authDomain: "kumar-grocery-list.firebaseapp.com",
      databaseURL: "https://kumar-grocery-list-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "kumar-grocery-list",
      storageBucket: "kumar-grocery-list.appspot.com",
      messagingSenderId: "726095302244",
      appId: "1:726095302244:web:afacaef92680ad26151971",
      measurementId: "G-MC9K47NDW6"
    };
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.database();


    // Put these near your other constants/utilities (top of the file)
  const ADMIN_EMAILS = ['sunil.kumar101@gmail.com'];
  function isAdminEmail(email) {
    return ADMIN_EMAILS.includes((email || '').trim().toLowerCase());
  }
  function isValidFamilyId(f) {
    return typeof f === 'string' && !!f && f !== 'null';
}

  // === DEBUG HARNESS (overlay + logger + diagnostics) ===
(function () {
  const DEBUG_ON = false;
  const state = {
    shown: false,
    logs: [],
    panel: null,
    btn: null
  };
  function ts() { return new Date().toISOString().replace('T',' ').replace('Z',''); }

  function ensureUI() {
    if (state.panel) return;
    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'sl-debug-toggle';
    btn.textContent = 'Debug';
    btn.style.cssText = `
      position:fixed; right:12px; bottom:14px; z-index:10050;
      background:#0ea5e9; color:#fff; border:none; border-radius:18px;
      padding:8px 12px; font-weight:800; box-shadow:0 4px 16px rgba(0,0,0,.2); cursor:pointer;
    `;
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
    state.btn = btn;

    // Panel
    const panel = document.createElement('div');
    panel.id = 'sl-debug-panel';
    panel.style.cssText = `
      position:fixed; right:10px; bottom:56px; width: min(92vw, 720px); height: 50vh;
      z-index:10049; display:none; background:#0b1220; color:#e5e7eb; border:1px solid #1f2937;
      border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.45); overflow:hidden; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    `;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px; padding:8px 10px; background:#0f172a; border-bottom:1px solid #1f2937;">
        <strong style="flex:1">SwiftList Debug Console</strong>
        <button id="sl-run-diag" style="background:#22c55e;border:none;color:#fff;border-radius:8px;padding:6px 10px;font-weight:800;cursor:pointer;">Run diagnostics</button>
        <button id="sl-copy-logs" style="background:#334155;border:none;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Copy logs</button>
        <button id="sl-clear-logs" style="background:#ef4444;border:none;color:#fff;border-radius:8px;padding:6px 10px;font-weight:800;cursor:pointer;">Clear</button>
        <button id="sl-close" style="background:#111827;border:none;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">Close</button>
      </div>
      <pre id="sl-debug-pre" style="margin:0;padding:10px;overflow:auto;height: calc(50vh - 46px); white-space:pre-wrap;"></pre>
    `;
    document.body.appendChild(panel);
    state.panel = panel;
    panel.querySelector('#sl-close').onclick = togglePanel;
    panel.querySelector('#sl-clear-logs').onclick = () => { state.logs = []; render(); };
    panel.querySelector('#sl-copy-logs').onclick = () => {
      const text = state.logs.map(l => `[${l.t}] ${l.s}`).join('\n');
      navigator.clipboard.writeText(text).catch(()=>{});
    };
    panel.querySelector('#sl-run-diag').onclick = runDiagnostics;
    window.addEventListener('error', (e) => log('window.error', e?.error?.stack || String(e.message || e)));
    window.addEventListener('unhandledrejection', (e) => log('unhandledrejection', e?.reason?.stack || String(e.reason || e)));
  }

  function render() {
    if (!state.panel) return;
    const pre = state.panel.querySelector('#sl-debug-pre');
    if (!pre) return;
    pre.textContent = state.logs.map(l => `[${l.t}] ${l.s}`).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function togglePanel() {
    ensureUI();
    state.shown = !state.shown;
    state.panel.style.display = state.shown ? 'block' : 'none';
  }

  function log(...args) {
    if (!DEBUG_ON) return;
    ensureUI();
    const line = args.map(a => {
      if (a === undefined) return 'undefined';
      if (a === null) return 'null';
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' | ');
    const entry = { t: ts(), s: line };
    state.logs.push(entry);
    console.log('[SL]', ...args);
    if (state.shown) render();
  }

  async function safeGet(path) {
    try {
      const snap = await db.ref(path).once('value');
      const val = snap.val();
      log('READ OK', path, { keys: val && typeof val === 'object' ? Object.keys(val).length : 0 });
      return { ok: true, val };
    } catch (e) {
      log('READ ERR', path, { code: e?.code, msg: e?.message });
      return { ok: false, err: e };
    }
  }

  async function runDiagnostics() {
    log('=== DIAGNOSTICS START ===');
    try {
      const u = (firebase.auth && firebase.auth().currentUser) || null;
      log('auth.currentUser', { email: u?.email || null, uid: u?.uid || null });
      if (!u) { log('No user. Please sign in first.'); return; }

      // 1) authorisedUids/<uid>
      const uRes = await safeGet(`/authorisedUids/${u.uid}`);
      const family = uRes?.val?.family || (typeof uRes?.val === 'string' ? uRes.val : null);
      log('resolved family from authorisedUids', family);

      if (family) {
        // 2) family root
        await safeGet(`/shoppingListsPerFamily/${family}`);
        // 3) groceryLists
        const gl = await safeGet(`/shoppingListsPerFamily/${family}/groceryLists`);
        const cats = gl.ok && gl.val ? Object.keys(gl.val) : [];
        log('groceryLists cats', cats);
        // 4) sample: grocery table
        if (cats.includes('grocery')) {
          const g = await safeGet(`/shoppingListsPerFamily/${family}/groceryLists/grocery`);
          const count = g.ok && g.val ? Object.keys(g.val).filter(k => k !== 'order').length : 0;
          log('grocery item-count (excl order)', count);
        }
      }
    } finally {
      log('=== DIAGNOSTICS END ===');
      render();
    }
  }

  // Expose helpers for ad-hoc use
  window.SLDBG = { log, runDiagnostics, safeGet };
  log('DEBUG HARNESS READY');
})();





  const RESERVED_TOP_KEYS = new Set(['groceryLists', 'tableNames', 'tableOrder']);
  const isTempOrderKey = (key) => key.endsWith('_temp_items_orders_check_zeros_btn');

  // --- Globals for authorized users ---
  let AUTHORISED_USERS = {}; // { userKey: {email, family} }
  let EMAIL_TO_FAMILY = {};  // { email: family }
  let USER_FAMILY = null;
  let USER_EMAIL = null;
  let USER_LIST_KEY = null; // This will be set to the user's family
  let isLoggedIn = false; // Track login state
  let isVoiceAdding = false; // Flag to prevent re-render during voice add

  // --- Utility: Normalize email for matching ---
  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  // --- Utility: Convert string to Proper Case ---
  function toProperCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, function (txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  // --- Resolve user's family (authorisedUsers first, then authorisedUids fallback) ---
async function resolveFamilyForUser(u) {
  window.SLDBG?.log('resolveFamilyForUser.start', { email: u?.email || null, uid: u?.uid || null });
  if (!u) return null;
  const email = normalizeEmail(u.email);

  // 1) Preferred map: authorisedUsers
  if (EMAIL_TO_FAMILY[email]) {
    window.SLDBG?.log('resolveFamilyForUser.authorisedUsersHit', { email, family: EMAIL_TO_FAMILY[email] });
    return EMAIL_TO_FAMILY[email];
  }

  // 2) Object form: authorisedUids/<uid>/family
  try {
    const famSnap = await db.ref(`/authorisedUids/${u.uid}/family`).once('value');
    const fam = famSnap.val();
    if (typeof fam === 'string' && fam) {
      window.SLDBG?.log('resolveFamilyForUser.authorisedUids.object', { uid: u.uid, family: fam });
      return fam;
    }
  } catch (e) {
    window.SLDBG?.log('resolveFamilyForUser.authorisedUids.object.err', { code: e?.code, msg: e?.message });
  }

  // 3) Legacy string form
  try {
    const legacySnap = await db.ref(`/authorisedUids/${u.uid}`).once('value');
    const legacy = legacySnap.val();
    if (typeof legacy === 'string' && legacy) {
      window.SLDBG?.log('resolveFamilyForUser.authorisedUids.legacy', { uid: u.uid, family: legacy });
      return legacy;
    }
  } catch (e) {
    window.SLDBG?.log('resolveFamilyForUser.authorisedUids.legacy.err', { code: e?.code, msg: e?.message });
  }

  window.SLDBG?.log('resolveFamilyForUser.miss', { email, uid: u.uid });
  return null;
}


  // --- Fetch Authorised Users from DB ---
function fetchAuthorisedUsers(callback) {
  window.SLDBG?.log('fetchAuthorisedUsers.start');
  setSyncIndicator(true);
  db.ref('/authorisedUsers').once('value')
    .then(snap => {
      const data = snap.val();
      const count = data ? Object.keys(data).length : 0;
      window.SLDBG?.log('fetchAuthorisedUsers.ok', { count });
      AUTHORISED_USERS = data || {};
      EMAIL_TO_FAMILY = {};
      Object.values(AUTHORISED_USERS).forEach(user => {
        if (user && user.email && user.family) {
          EMAIL_TO_FAMILY[normalizeEmail(user.email)] = user.family;
        }
      });
      setSyncIndicator(false);
      if (typeof callback === "function") callback();
    })
    .catch(error => {
      setSyncIndicator(false);
      const msg = (error && (error.code || error.message) || '').toString().toLowerCase();
      const isPermission = msg.includes('permission') || msg.includes('denied');
      window.SLDBG?.log('fetchAuthorisedUsers.err', { code: error?.code, msg: error?.message, isPermission });
      if (typeof callback === "function") callback();
      if (!isPermission && isLoggedIn) handleFirebaseError(error);
    });
}

// Admin-only: add an email to authorisedUsers, dedup by email+family, return {addedKey, alreadyExists}
async function adminAddUserRecord(emailRaw, familyIdRaw) {
  const email = (emailRaw || '').trim().toLowerCase();
  const familyId = sanitizeFamilyId(familyIdRaw || '');
  if (!email || !familyId) throw new Error('Missing email or family');

  // Load all existing authorisedUsers once
  const auSnap = await firebase.database().ref('/authorisedUsers').once('value').catch(() => null);
  const au = (auSnap && auSnap.val && auSnap.val()) || {};

  // Dedup: if exact email+family is already present, short-circuit
  const pair = `${email}|${familyId}`;
  for (const [k, v] of Object.entries(au)) {
    if (v && v.email && v.family) {
      const p = `${String(v.email).trim().toLowerCase()}|${String(v.family).trim()}`;
      if (p === pair) {
        return { addedKey: null, alreadyExists: true };
      }
    }
  }

  // Find next sequential key user0001...
  let maxN = 0;
  Object.keys(au).forEach(k => {
    const m = /^user(\d+)$/.exec(k);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  const nextKey = 'user' + String(maxN + 1).padStart(4, '0');

  await firebase.database().ref('/authorisedUsers/' + nextKey).set({ email, family: familyId });
  return { addedKey: nextKey, alreadyExists: false };
}

// Optional: seed a new family node from template if it doesn't exist yet
async function seedFamilyIfMissing(familyId) {
  const famPath = `/shoppingListsPerFamily/${familyId}`;
  const famRef = firebase.database().ref(famPath);
  const snap = await famRef.once('value');
  if (snap.exists()) return false; // already there

  const templatePath = '/publicTemplates/shoppingListTemplate';
  const tSnap = await firebase.database().ref(templatePath).once('value');
  const template = tSnap.val();
  if (template) {
    // Slightly clone to avoid accidental shared refs
    const data = {
      groceryLists: template.groceryLists || {},
      tableNames: template.tableNames || {},
      tableOrder: Array.isArray(template.tableOrder) ? template.tableOrder : []
    };
    await famRef.set(data);
  } else {
    await famRef.set({ groceryLists: {}, tableNames: {}, tableOrder: [] });
  }
  return true;
}

  // --- Set Logout Button Visibility ---
  function setLogoutButtonVisible(visible) {
    const logoutBtn = document.getElementById('logout-btn-top');
    const collapseBtn = document.getElementById('collapse-all-btn');
    if (logoutBtn) {
      logoutBtn.style.display = visible ? '' : 'none';
    }
    if (collapseBtn) {
      collapseBtn.style.display = visible ? '' : 'none';
    }
  }

  // --- Show Logged In Email ---
  function showLoggedInEmail(email) {
    const emailLabel = document.getElementById('user-email-label');
    if (emailLabel) {
      emailLabel.textContent = email || '';
      emailLabel.style.display = email ? '' : 'none';
    }
  }

  // --- Show Main Section ---
  function showMain() {
    isLoggedIn = true;
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
    setAddUserButtonVisible(true);
  }

  // --- Show Login Section ---
  function showLogin() {
    isLoggedIn = false;
    document.getElementById('main-section').style.display = 'none';
    document.getElementById('login-bg').style.display = '';
    setLogoutButtonVisible(false);
    showLoggedInEmail('');
    setAddUserButtonVisible(false);
  }

  function getCurrentUser() {
    try { return (firebase.auth && firebase.auth().currentUser) || null; } catch { return null; }
  }

  // --- Subscribe to Family Shopping List ---
  let shoppingListRef = null;
  let tableOrder = [];

function subscribeFamilyList(family) {
  const path = `/shoppingListsPerFamily/${family}`;
  window.SLDBG?.log('subscribeFamilyList.attach', { path });
  setSyncIndicator(true);
  if (shoppingListRef) shoppingListRef.off();
  shoppingListRef = db.ref(path);

  shoppingListRef.on('value', snap => {
    if (isVoiceAdding) return;
    const data = snap.val() || {};
    const hasGL = !!data.groceryLists;
    const hasTN = !!data.tableNames;
    const hasTO = Array.isArray(data.tableOrder);
    const legacyCats = Object.keys(data).filter(
      (k) => !RESERVED_TOP_KEYS.has(k) && !isTempOrderKey(k) && data[k] && typeof data[k] === 'object'
    );
    window.SLDBG?.log('subscribeFamilyList.value', {
      exists: snap.exists(),
      keys: Object.keys(data || {}),
      hasGL, hasTN, hasTO,
      legacyCats
    });

    groceryData = {};
    tableNames = {};
    categories = [];
    tempOrders = {};

    const rawGroceryLists = data.groceryLists || {};
    const rawTableNames = data.tableNames || {};
    const rawTableOrder = Array.isArray(data.tableOrder) ? data.tableOrder : [];

    const allKeysSet = new Set([
      ...Object.keys(rawGroceryLists),
      ...Object.keys(rawTableNames),
      ...rawTableOrder,
      ...legacyCats
    ]);
    const allKeys = Array.from(allKeysSet);

    allKeys.forEach(cat => {
      if (rawGroceryLists[cat]) {
        groceryData[cat] = { ...rawGroceryLists[cat] };
      } else if (data[cat]) {
        groceryData[cat] = { ...data[cat] };
      }
      if (rawTableNames[cat]) {
        tableNames[cat] = rawTableNames[cat];
      }
    });
    categories = allKeys;

    Object.keys(data).forEach(key => {
      if (isTempOrderKey(key)) {
        const cat = key.replace('_temp_items_orders_check_zeros_btn', '');
        if (data[key] && Array.isArray(data[key])) {
          tempOrders[cat] = data[key];
        }
      }
    });

    let order = Array.isArray(rawTableOrder) ? [...rawTableOrder] : [];
    allKeys.forEach(cat => { if (!order.includes(cat)) order.push(cat); });
    tableOrder = order;

    window.SLDBG?.log('subscribeFamilyList.computed', {
      categories,
      tableOrderLen: tableOrder.length
    });

    renderAllTables();
    saveCache();
    setSyncIndicator(false);
  }, function (error) {
    setSyncIndicator(false);
    window.SLDBG?.log('subscribeFamilyList.err', { code: error?.code, msg: error?.message });
    if (isLoggedIn) handleFirebaseError(error);
  });
}



  // --- Google Sign-In Logic ---
/* ========== Google Sign-In (cleanup: avoid double handleUserLogin) ========== */
let signInInProgress = false;
async function googleSignIn() {
  if (signInInProgress) return;
  signInInProgress = true;

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const done = (tag) => { window.SLDBG?.log('googleSignIn.done', tag || ''); signInInProgress = false; };

  try {
    window.SLDBG?.log('googleSignIn.popup.attempt');
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result?.user || null;
    window.SLDBG?.log('googleSignIn.popup.success', { email: user?.email || null, uid: user?.uid || null });
    // Important: rely on onAuthStateChanged to call handleUserLogin — avoid duplicate flow
    done('popup-success');
  } catch (error) {
    window.SLDBG?.log('googleSignIn.popup.error', { code: error?.code, msg: error?.message });
    const fallbackCodes = new Set([
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
      'auth/operation-not-supported-in-this-environment'
    ]);
    if (fallbackCodes.has(error?.code)) {
      try {
        window.SLDBG?.log('googleSignIn.redirect.fallback.attempt');
        await firebase.auth().signInWithRedirect(provider);
        done('redirect-called');
        return;
      } catch (e2) {
        window.SLDBG?.log('googleSignIn.redirect.error', { code: e2?.code, msg: e2?.message });
        showModal(`Failed to sign in (redirect): ${e2?.message || 'unknown error'}`, () => {});
      }
    } else {
      showModal(`Failed to sign in: ${error?.message || 'unknown error'}`, () => {});
    }
    done('popup-failed');
  }
}

// Complete pending redirect results (if redirect was used)
// Guard so we wire only once even if this block runs multiple times.
if (!window._SL_REDIRECT_RESULT_WIRED) {
  window._SL_REDIRECT_RESULT_WIRED = true;
  firebase.auth().getRedirectResult()
    .then((res) => {
      if (res && res.user) {
        window.SLDBG?.log('getRedirectResult.user', { email: res.user.email, uid: res.user.uid });
      } else {
        window.SLDBG?.log('getRedirectResult.noUser');
      }
    })
    .catch((err) => {
      window.SLDBG?.log('getRedirectResult.error', { code: err?.code, msg: err?.message });
    });
}

// Wire the Sign-in button (single binding)
// Guard so we wire only once.
if (!window._SL_SIGNIN_WIRED) {
  window._SL_SIGNIN_WIRED = true;
  (() => {
    const btn = document.getElementById('google-signin-btn');
    if (btn) {
      btn.addEventListener('click', () => window.SLDBG?.log('UI click: google-signin-btn'));
      btn.addEventListener('click', googleSignIn, { once: false });
    }
  })();
}



  // --- Collapse All Tables Button ---
  document.getElementById('collapse-all-btn')?.addEventListener('click', function () {
    // Always get the latest list of containers from the DOM
    document.querySelectorAll('.container').forEach(container => {
      const cat = container.id.replace('-container', '');
      localStorage.setItem('col-' + cat, 'true');
      setCollapsed(cat, true);
    });
  });

  // --- Handle User Login (async, resolves family via authorisedUsers -> authorisedUids) ---
async function handleUserLogin(user = null) {
  window.SLDBG?.log('handleUserLogin.start', { email: user?.email || null, uid: user?.uid || null });
  if (!user) {
    showLogin();
    window.SLDBG?.log('handleUserLogin.noUser.showLogin');
    return;
  }

  USER_EMAIL = normalizeEmail(user.email);
  let family = EMAIL_TO_FAMILY[USER_EMAIL] || null;
  if (!family) family = await resolveFamilyForUser(user);
  window.SLDBG?.log('handleUserLogin.familyResolved', { USER_EMAIL, family });

  if (!family) {
    showModal('Access denied. Please use an authorized Google account. If you are a new user, please contact Sunil to get your Google account set up.', () => { });
    showLogin();
    try { await auth.signOut(); } catch (_) {}
    window.SLDBG?.log('handleUserLogin.accessDenied.signOut');
    return;
  }

  USER_FAMILY = family;
  USER_LIST_KEY = family;


// Ensure authorisedUids mapping exists for this user (first-login auto-create)
try {
  await firebase.database()
    .ref(`/authorisedUids/${user.uid}`)
    .transaction(cur => {
      // If already present, keep existing
      if (cur && typeof cur === 'object' && cur.family) return cur;
      return { email: USER_EMAIL, family: USER_FAMILY };
    });
  window.SLDBG?.log('handleUserLogin.authorisedUids.ensure', { uid: user.uid, family: USER_FAMILY });
} catch (e) {
  window.SLDBG?.log('handleUserLogin.authorisedUids.err', { code: e?.code, msg: e?.message });
}


  // Ensure family node exists
  const famPath = `/shoppingListsPerFamily/${USER_FAMILY}`;
  const famRef = db.ref(famPath);
  const famSnap = await famRef.once('value');
  window.SLDBG?.log('handleUserLogin.familyExists', { famPath, exists: famSnap.exists(), keys: Object.keys(famSnap.val() || {}) });

  if (!famSnap.exists()) {
    const TEMPLATE_PATH = '/publicTemplates/shoppingListTemplate';
    const templateSnap = await db.ref(TEMPLATE_PATH).once('value');
    const templateData = templateSnap.val();
    window.SLDBG?.log('handleUserLogin.seedFromTemplate', { hasTemplate: !!templateData });
    if (templateData) {
      const newTableNames = { ...(templateData.tableNames || {}) };
      const newData = { ...templateData, tableNames: newTableNames };
      await famRef.set(newData);
      window.SLDBG?.log('handleUserLogin.templateWritten');
    } else {
      await famRef.set({ groceryLists: {}, tableNames: {}, tableOrder: [] });
      window.SLDBG?.log('handleUserLogin.emptyFamilyCreated');
    }
  }

  showMain();
  showLoggedInEmail(user.email);
  window.SLDBG?.log('handleUserLogin.showMain', { USER_FAMILY });
  subscribeFamilyList(USER_FAMILY);
}


  // --- Auth State Change (single listener) ---
auth.onAuthStateChanged((user) => {
  window.SLDBG?.log('onAuthStateChanged', { email: user?.email || null, uid: user?.uid || null });
  // Always (re)load authorisedUsers first so EMAIL_TO_FAMILY is up-to-date
  fetchAuthorisedUsers(async () => {
    if (user) {
      await handleUserLogin(user);
    } else {
      showLogin();
      window.SLDBG?.log('onAuthStateChanged.showLogin');
    }
  });
});



  // // --- Try to subscribe early if already authenticated ---
  // fetchAuthorisedUsers(async () => {
  //   const currentUser = auth.currentUser;
  //   if (currentUser) {
  //     const fam = await resolveFamilyForUser(currentUser);
  //     if (fam) {
  //       USER_EMAIL = normalizeEmail(currentUser.email);
  //       USER_FAMILY = fam;
  //       USER_LIST_KEY = fam;
  //       subscribeFamilyList(fam);
  //       showMain();
  //       showLoggedInEmail(currentUser.email);
  //     }
  //   }
  // });

  // --- Logout ---
  const logoutBtnTop = document.getElementById('logout-btn-top');
  if (logoutBtnTop) {
    logoutBtnTop.onclick = function () {
      // Unsubscribe from DB before logging out to avoid permission_denied errors
      if (shoppingListRef) {
        shoppingListRef.off();
        shoppingListRef = null;
      }
      auth.signOut().then(() => {
        // Wait for onAuthStateChanged to handle UI update
      }).catch((error) => {
        console.warn("Logout warning:", error);
      });
    };
  }

  // Helper: only write when logged in and we have a valid family key
  function canWrite() {
    return Boolean(isLoggedIn && USER_LIST_KEY && typeof USER_LIST_KEY === 'string');
  }

  // Always hide base modal on load
  const baseBackdrop = document.getElementById('modal-backdrop');
  if (baseBackdrop) baseBackdrop.style.display = 'none';

  // --- Modal Helpers ---
  function showModal(title, callback) {
    // Remove any existing modals
    const existingModals = document.querySelectorAll('[id^="modal-backdrop-"]');
    existingModals.forEach(modal => modal.remove());

    // Create new modal with unique ID
    const modalId = 'modal-backdrop-' + Date.now();
    const backdrop = document.createElement('div');
    backdrop.id = modalId;
    backdrop.style.display = 'flex';
    backdrop.style.zIndex = '5000';
    backdrop.style.position = 'fixed';
    backdrop.style.left = '0';
    backdrop.style.top = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.background = 'rgba(30,40,60,0.18)';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';

    // Create modal content container
    const modalContent = document.createElement('div');
    modalContent.style.background = 'white';
    modalContent.style.borderRadius = '13px';
    modalContent.style.boxShadow = '0 4px 16px rgba(30,40,60,0.18)';
    modalContent.style.padding = '24px 16px 18px 16px';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '380px';
    modalContent.style.textAlign = 'center';

    // Create title element
    const titleEl = document.createElement('div');
    titleEl.style.fontSize = '1.13rem';
    titleEl.style.marginBottom = '22px';
    titleEl.style.fontWeight = '600';
    // CAUTION: title may include HTML in some static cases (kept as innerHTML).
    titleEl.innerHTML = title;
    modalContent.appendChild(titleEl);

    backdrop.appendChild(modalContent);
    document.body.appendChild(backdrop);
    backdrop.classList.add('active');

    // --- Confirmation modals: show both OK and Cancel for "Are you sure" or "Reset all" prompts ---
    if (
      typeof title === "string" &&
      (
        title.toLowerCase().includes("are you sure") ||
        title.toLowerCase().includes("reset all") ||
        title.toLowerCase().includes("delete this item") ||
        title.toLowerCase().includes("delete table")
      )
    ) {
      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex';
      btnContainer.style.gap = '14px';
      btnContainer.style.justifyContent = 'center';
      btnContainer.style.marginTop = '18px';

      // Styled Cancel button
      const btnNo = document.createElement('button');
      btnNo.textContent = 'Cancel';
      btnNo.style.padding = '12px 0';
      btnNo.style.borderRadius = '8px';
      btnNo.style.fontWeight = '700';
      btnNo.style.fontSize = '1.07rem';
      btnNo.style.border = 'none';
      btnNo.style.background = '#f3f6fa';
      btnNo.style.color = '#222';
      btnNo.style.cursor = 'pointer';
      btnNo.style.flex = '1';
      btnNo.style.boxShadow = '0 1px 4px rgba(60,80,130,0.07)';
      btnNo.style.transition = 'background 0.14s';

      // Styled OK button
      const btnYes = document.createElement('button');
      btnYes.textContent = 'OK';
      btnYes.style.padding = '12px 0';
      btnYes.style.borderRadius = '8px';
      btnYes.style.fontWeight = '700';
      btnYes.style.fontSize = '1.07rem';
      btnYes.style.border = 'none';
      btnYes.style.background = 'linear-gradient(90deg,#388e3c 60%, #5dd05d 100%)';
      btnYes.style.color = '#fff';
      btnYes.style.cursor = 'pointer';
      btnYes.style.flex = '1';
      btnYes.style.boxShadow = '0 1px 4px rgba(34,197,94,0.13)';
      btnYes.style.transition = 'background 0.14s';

      btnContainer.appendChild(btnNo);
      btnContainer.appendChild(btnYes);
      modalContent.appendChild(btnContainer);

      function cleanup() {
        backdrop.classList.remove('active');
        backdrop.style.display = 'none';
        backdrop.remove();
      }

      btnYes.onclick = () => {
        cleanup();
        if (callback) callback(true);
      };

      btnNo.onclick = () => {
        cleanup();
        if (callback) callback(false);
      };

      btnYes.focus();
      return;
    }

    // For success messages (no buttons needed)
    if (
      typeof title === "string" &&
      title.toLowerCase().includes("success!")
    ) {
      // Auto-close after 2 seconds
      setTimeout(() => {
        backdrop.classList.remove('active');
        backdrop.style.display = 'none';
        backdrop.remove();
        if (callback) callback(true);
      }, 2000);
      return;
    }

    // For info-only modals, just show OK button
    if (
      typeof title === "string" &&
      (
        title.toLowerCase().includes("already exists") ||
        title.toLowerCase().includes("duplicate") ||
        title.toLowerCase().includes("added to family") ||
        title.toLowerCase().includes("failed to add user")
      )
    ) {
      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex';
      btnContainer.style.justifyContent = 'center';
      btnContainer.style.marginTop = '20px';

      const btnYes = document.createElement('button');
      btnYes.textContent = 'OK';
      btnYes.style.padding = '8px 20px';
      btnYes.style.borderRadius = '8px';
      btnYes.style.fontWeight = '600';
      btnYes.style.border = 'none';
      btnYes.style.background = '#f3f6fa';
      btnYes.style.color = '#222';
      btnYes.style.cursor = 'pointer';

      btnContainer.appendChild(btnYes);
      modalContent.appendChild(btnContainer);

      function cleanup() {
        backdrop.classList.remove('active');
        backdrop.style.display = 'none';
        backdrop.remove();
      }

      btnYes.onclick = () => {
        cleanup();
        if (callback) callback(true);
      };

      btnYes.focus();
      return;
    }
  }

  // --- Custom Input Modal for Adding Items ---
  function showInputModal(title, callback) {
    // Create modal elements if not present
    let backdrop = document.getElementById('input-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'input-modal-backdrop';
      backdrop.id = 'input-modal-backdrop';
      backdrop.innerHTML = `
        <div class="input-modal-dialog">
          <div class="input-modal-title" id="input-modal-title"></div>
          <input type="text" id="input-modal-input" class="input-modal-input" autocomplete="off" />
          <div class="input-modal-btns">
            <button class="input-modal-btn input-modal-btn-cancel" id="input-modal-btn-cancel">Cancel</button>
            <button class="input-modal-btn input-modal-btn-ok" id="input-modal-btn-ok">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    }
    backdrop.style.display = 'flex';
    backdrop.classList.add('active');
    document.getElementById('input-modal-title').textContent = title;
    const input = document.getElementById('input-modal-input');
    input.value = '';
    input.focus();
    input.select();

    function cleanup() {
      backdrop.classList.remove('active');
      backdrop.style.display = 'none';
      document.getElementById('input-modal-btn-cancel').onclick = null;
      document.getElementById('input-modal-btn-ok').onclick = null;
      input.onkeydown = null;
    }

    document.getElementById('input-modal-btn-cancel').onclick = () => {
      cleanup();
      callback(null);
    };
    document.getElementById('input-modal-btn-ok').onclick = () => {
      const val = input.value.trim();
      if (!val) return input.focus();
      cleanup();
      callback(val);
    };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') document.getElementById('input-modal-btn-ok').click();
      if (e.key === 'Escape') document.getElementById('input-modal-btn-cancel').click();
    };
  }

  // --- AddItem function: custom modal, instant UI, then DB ---
  function addItem(cat) {
    if (!isLoggedIn) return;
    showInputModal('Add new item:', function (name) {
      if (!name) return;
      const trimmedName = toProperCase(name.trim().replace(/\s+/g, ' '));
      if (!trimmedName) return;

      // 1. Get current items
      const items = groceryData[cat] || {};
      const existingKeys = Object.keys(items)
        .filter(key => key !== 'order' && items[key] && typeof items[key] === 'object' && typeof items[key].name === 'string');
      const existingNames = existingKeys
        .map(key => items[key].name.trim().replace(/\s+/g, ' ').toLowerCase());
      if (existingNames.includes(trimmedName.toLowerCase())) {
        showModal(`Item "${trimmedName}" already exists in this table.`, () => { });
        return;
      }
      let maxNum = 0;
      existingKeys.forEach(key => {
        const match = key.match(/-?item(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const nextKey = existingKeys.some(k => k.startsWith('-')) ? `-item${maxNum + 1}` : `item${maxNum + 1}`;
      const item = { name: trimmedName, count: 0, checked: false };

      // 2. Add to local data and UI instantly
      if (!groceryData[cat]) groceryData[cat] = {};
      groceryData[cat][nextKey] = item;
      if (!Array.isArray(groceryData[cat].order)) groceryData[cat].order = [];
      groceryData[cat].order.push(nextKey);

      // NEW: if a temp order is active (after "Highlight items"), include the new key too.
      if (tempOrders[cat] && tempOrders[cat].length > 0) {
        // Since new items start with count 0, append to the end (bottom section).
        tempOrders[cat].push(nextKey);
        saveTempOrder(cat, tempOrders[cat]);
      }

      renderList(cat);
      saveCache();
      highlightAndScrollToItem(cat, nextKey);

      // 3. Add to DB in background
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${nextKey}`).set(item);
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
    });
  }
  window.addItem = addItem;

  // --- Globals ---
  let moveDeleteMode = false;
  let moveMode = false; // New: separate move mode
  let deleteMode = false; // New: separate delete mode
  let originalKeyOrder = {};
  let groceryData = {};
  let tableNames = {};
  let categories = [];
  let tempOrders = {}; // { cat: [key, ...] }

  // --- Fix: Add these globals for deleted tables/items ---
  let pendingDeletedTables = new Set();
  let pendingDeletedItems = {}; // { cat: Set([key, ...]) }

  // --- Utility: Get order for rendering (temp if exists, else original) ---
  function getRenderOrder(cat, items) {
    // If a temp order exists (e.g., after "Highlight items to buy"),
    // use it but APPEND any missing keys so new items still render.
    if (tempOrders[cat] && tempOrders[cat].length) {
      const order = tempOrders[cat].filter(k => items[k]);
      Object.keys(items).forEach(k => {
        if (
          k !== 'order' &&
          !order.includes(k) &&
          items[k] &&
          typeof items[k] === 'object' &&
          typeof items[k].name === 'string'
        ) {
          order.push(k);
        }
      });
      return order;
    }

    // Fallback to original order + any missing keys
    let keys = Array.isArray(items.order) ? [...items.order] : [];
    Object.keys(items).forEach(k => {
      if (
        k !== 'order' &&
        !keys.includes(k) &&
        items[k] &&
        typeof items[k] === 'object' &&
        typeof items[k].name === 'string'
      ) {
        keys.push(k);
      }
    });
    return keys;
  }

  // --- Utility: Save temp order for a table ---
  function saveTempOrder(cat, orderArr) {
    if (!USER_LIST_KEY) return;
    const tempKey = `${cat}_temp_items_orders_check_zeros_btn`;
    tempOrders[cat] = orderArr;
    firebase.database().ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/${tempKey}`).set(orderArr);
  }

  // --- Utility: Clear all temp orders for this family ---
  function clearAllTempOrders() {
    if (!USER_LIST_KEY) return;
    const updates = {};
    categories.forEach(cat => {
      const tempKey = `${cat}_temp_items_orders_check_zeros_btn`;
      updates[tempKey] = null;
      tempOrders[cat] = [];
    });
    firebase.database().ref(`/shoppingListsPerFamily/${USER_LIST_KEY}`).update(updates);
  }

  // --- Collapse/Expand Tables (moved earlier to ensure availability) ---
  function toggleCollapse(cat) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    let arrow = container ? container.querySelector('.collapse-arrow') : null;
    if (!arrow) arrow = document.getElementById(`${cat}-arrow`);
    if (!container || !ul || !arrow) return;
    const collapsed = container.classList.toggle('collapsed');
    if (collapsed) {
      ul.style.display = 'none';
      arrow.classList.add('collapsed');
      localStorage.setItem('col-' + cat, 'true');
    } else {
      ul.style.display = '';
      arrow.classList.remove('collapsed');
      localStorage.setItem('col-' + cat, 'false');
    }
  }

  function setCollapsed(cat, collapsed) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    const arrow = container ? container.querySelector('.collapse-arrow') : null;
    if (!container || !ul || !arrow) return;
    if (collapsed) {
      container.classList.add('collapsed');
      ul.style.display = 'none';
      arrow.classList.add('collapsed');
    } else {
      container.classList.remove('collapsed');
      ul.style.display = '';
      arrow.classList.remove('collapsed');
    }
  }

  // --- Render Grocery Tables ---
  function renderAllTables() {
    const area = document.getElementById('tables-area');
    if (!area) return;
    if (area.sortableInstance) {
      area.sortableInstance.destroy();
      area.sortableInstance = null;
    }
    while (area.firstChild) {
      area.removeChild(area.firstChild);
    }

    const order = Array.isArray(tableOrder) && tableOrder.length ? tableOrder : categories;
    order.forEach((cat) => {
      // --- Skip pending deleted tables ---
      if (pendingDeletedTables.has(cat)) return;

      const container = document.createElement('div');
      container.className = 'container';
      container.id = `${cat}-container`;

      // Use only tableNames from DB, fallback to key if missing
      const header = document.createElement('div');
      header.className = 'header';
      // Use soft palette for background and font color
      const headerName = tableNames[cat] || cat;
      const headerColors = stringToHeaderColor(headerName);
      header.style.background = headerColors.bg;
      header.style.color = headerColors.fg;
      // Optionally, add a class for future CSS overrides
      header.classList.add(`${cat.replace(/[^a-z0-9_]/gi, '').toLowerCase()}-header`);

      // Calculate count for header
      const items = groceryData[cat] || {};
      const count = Object.values(items)
        .filter(item => item && typeof item === "object" && item.count > 0 && !item.checked)
        .length;

      header.innerHTML = `
        <span class="header-count" id="${cat}-count">${count}</span>
        <span class="header-title" data-cat="${cat}"></span>
        ${
          moveMode
            ? `
          <span class="table-move-handle" title="Move table">
            <i class="fas fa-up-down-left-right" style="font-size:22px;color:#666;"></i>
          </span>
        `
            : deleteMode
              ? `
          <button class="table-delete-btn" onclick="deleteTable('${cat}')">
            <span class="table-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete table"></i>
            </span>
          </button>
        `
              : ''
        }
        <div class="header-actions">
            <button class="voice-add-btn" data-cat="${cat}" title="Long-press to add item by voice">
                <span class="icon-stack">
                  <i class="fas fa-microphone-alt"></i>
                  <i class="fas fa-plus"></i>
                </span>
            </button>
            <button class="header-burger-menu" data-cat="${cat}" title="More options">
              <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        <span class="collapse-arrow">&#9654;</span>
      `;
      // Securely set header title text
      const headerTitleSpan = header.querySelector('.header-title');
      if (headerTitleSpan) headerTitleSpan.textContent = headerName;

      header.addEventListener('click', function (e) {
        if (e.target !== header) {
          return;
        }
        toggleCollapse(cat);
      });

      // --- Add a dedicated click listener for the collapse arrow ---
      const collapseArrow = header.querySelector('.collapse-arrow');
      if (collapseArrow) {
        collapseArrow.addEventListener('click', function (e) {
          e.stopPropagation(); // Prevent the header's click listener from firing
          toggleCollapse(cat);
        });
      }

      // --- Add a dedicated click listener for the header title ---
      if (headerTitleSpan) {
        headerTitleSpan.addEventListener('click', function (e) {
          // Do not toggle if a dblclick is in progress for editing
          if (e.detail > 1) return;
          e.stopPropagation();
          toggleCollapse(cat);
        });
      }

      // --- Add burger menu click handler ---
      const burgerMenu = header.querySelector('.header-burger-menu');
      if (burgerMenu) {
        let longPressTimer = null;

        burgerMenu.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return; // Only left mouse button
          longPressTimer = setTimeout(() => {
            showHeaderContextMenu(cat, header, e.clientX, e.clientY);
          }, 1000); // 1 second long press
        });

        burgerMenu.addEventListener('mouseup', function () {
          clearTimeout(longPressTimer);
        });

        burgerMenu.addEventListener('mouseleave', function () {
          clearTimeout(longPressTimer);
        });

        // --- Add right-click context menu on burger menu ---
        burgerMenu.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          showHeaderContextMenu(cat, header, e.clientX, e.clientY);
        });

        // --- Touch events for mobile long press on burger menu ---
        burgerMenu.addEventListener('touchstart', function (e) {
          longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            showHeaderContextMenu(cat, header, touch.clientX, touch.clientY);
          }, 1000);
        }, { passive: true });

        burgerMenu.addEventListener('touchend', function () {
          clearTimeout(longPressTimer);
        }, { passive: true });

        burgerMenu.addEventListener('touchmove', function () {
          clearTimeout(longPressTimer);
        }, { passive: true });
      }

      // --- VOICE BUTTON: Add direct listeners for long-press (mimics burger menu logic) ---
      const voiceBtn = header.querySelector('.voice-add-btn');
      if (voiceBtn) {
        let voiceLongPressTimer = null;

        const startPress = (e) => {
          // Do not preventDefault—keep behavior consistent with burger menu.
          e.stopPropagation(); // Only stop propagation to prevent header collapse.

          voiceBtn.classList.add('pressing');

          voiceLongPressTimer = setTimeout(() => {
            startVoiceAddItem(cat);
            if (voiceBtn) voiceBtn.classList.remove('pressing');
            voiceLongPressTimer = null;
          }, 500); // 0.5 second press
        };

        const cancelPress = () => {
          if (voiceLongPressTimer) {
            clearTimeout(voiceLongPressTimer);
            voiceLongPressTimer = null;
          }
          if (voiceBtn) voiceBtn.classList.remove('pressing');
        };

        // Mouse events
        voiceBtn.addEventListener('mousedown', startPress);
        voiceBtn.addEventListener('mouseup', cancelPress);
        voiceBtn.addEventListener('mouseleave', cancelPress);

        // Touch events: passive (we don't call preventDefault here)
        voiceBtn.addEventListener('touchstart', startPress, { passive: true });
        voiceBtn.addEventListener('touchend', cancelPress, { passive: true });
        voiceBtn.addEventListener('touchmove', cancelPress, { passive: true });
        voiceBtn.addEventListener('touchcancel', cancelPress, { passive: true });

        // Prevent click from bubbling to header and causing collapse
        voiceBtn.addEventListener('click', (e) => e.stopPropagation());
      }

      container.appendChild(header);

      const ul = document.createElement('ul');
      ul.id = cat;
      container.appendChild(ul);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-table-btn';
      addBtn.textContent = '＋ Add Item';
      addBtn.onclick = () => addItem(cat);
      container.appendChild(addBtn);
      area.appendChild(container);

      const isCollapsed = localStorage.getItem('col-' + cat) === 'true';
      if (isCollapsed) {
        setCollapsed(cat, true);
      } else {
        setCollapsed(cat, false);
      }

      renderList(cat);
      updateHeaderCount(cat);
    });

    // --- Editable Table Name: Double-click to edit ---
    area.querySelectorAll('.header-title').forEach(span => {
      span.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const cat = this.getAttribute('data-cat');
        const oldName = tableNames[cat] || cat;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'edit-table-input';
        this.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
          let newName = input.value.trim();
          if (!newName) newName = oldName;
          tableNames[cat] = newName;
          renderAllTables();
          // Write to shoppingListsPerFamily
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).set(newName);
        }
        input.onblur = finishEdit;
        input.onkeydown = function (ev) {
          if (ev.key === 'Enter') { input.blur(); }
          if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
        };
      });
    });

    // --- Table-level drag and drop when move mode is enabled ---
    if (moveDeleteMode) {
      if (!area.sortableInstance) {
        area.sortableInstance = Sortable.create(area, {
          animation: 180,
          handle: '.table-move-handle',
          draggable: '.container',
          ghostClass: 'dragging',
          onEnd: function () {
            const newOrder = [];
            area.querySelectorAll('.container').forEach(div => {
              if (div.id) newOrder.push(div.id.replace('-container', ''));
            });
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(newOrder);
            tableOrder = newOrder;
            renderAllTables();
          }
        });
      }
    } else {
      if (area.sortableInstance) {
        area.sortableInstance.destroy();
        area.sortableInstance = null;
      }
    }
  }

  // --- Show custom context menu for table header ---
  function showHeaderContextMenu(cat, headerEl, x, y, showUpward = false) {
    // Remove any existing menu
    document.querySelectorAll('.header-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'header-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.zIndex = 6001;

    // --- FIX: Set background to a very light shade of the header color ---
    const headerName = tableNames[cat] || cat;
    const headerColors = stringToHeaderColor(headerName);
    menu.style.background = headerColors.lightBg || '#fff'; // Use lightBg from palette

    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 2px 12px rgba(30,40,60,0.18)';
    menu.style.padding = '8px 0';
    menu.style.minWidth = '180px';
    menu.style.fontSize = '1.05rem';
    menu.style.border = '1px solid #ddd';

    // Add arrow indicator
    if (showUpward) {
      menu.classList.add('upward');
      menu.style.bottom = (window.innerHeight - y) + 'px';
      const arrow = document.createElement('div');
      arrow.className = 'context-menu-arrow-down';
      arrow.innerHTML = '▼';
      arrow.style.position = 'absolute';
      arrow.style.bottom = '-8px';
      arrow.style.left = '50%';
      arrow.style.transform = 'translateX(-50%)';
      arrow.style.color = '#fff';
      arrow.style.fontSize = '12px';
      arrow.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
      menu.appendChild(arrow);
    } else {
      menu.style.top = y + 'px';
      const arrow = document.createElement('div');
      arrow.className = 'context-menu-arrow-up';
      arrow.innerHTML = '▲';
      arrow.style.position = 'absolute';
      arrow.style.top = '-8px';
      arrow.style.left = '50%';
      arrow.style.transform = 'translateX(-50%)';
      arrow.style.color = '#fff';
      arrow.style.fontSize = '12px';
      arrow.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
      menu.appendChild(arrow);
    }

    // Add Highlight items to buy option
    const markZeros = document.createElement('div');
    markZeros.innerHTML = '<i class="fas fa-check" style="margin-right:8px;color:#1976d2;"></i> Highlight items to buy';
    markZeros.style.padding = '10px 18px';
    markZeros.style.cursor = 'pointer';
    markZeros.style.fontWeight = '600';
    markZeros.style.color = '#1976d2';
    markZeros.onmouseenter = () => markZeros.style.background = '#e3f2fd';
    markZeros.onmouseleave = () => markZeros.style.background = '';
    markZeros.onclick = function () {
      menu.remove();
      markZerosInTable(cat);
    };
    menu.appendChild(markZeros);

    // Divider
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#eee';
    divider.style.margin = '8px 0';
    menu.appendChild(divider);

    // Move Items
    const moveItems = document.createElement('div');
    moveItems.innerHTML = '<i class="fas fa-up-down-left-right" style="margin-right:8px;color:#1976d2;"></i> Move Items/List';
    moveItems.style.padding = '10px 18px';
    moveItems.style.cursor = 'pointer';
    moveItems.style.fontWeight = '600';
    moveItems.style.color = '#1976d2';
    moveItems.onmouseenter = () => moveItems.style.background = '#e3f2fd';
    moveItems.onmouseleave = () => moveItems.style.background = '';
    moveItems.onclick = function () {
      menu.remove();
      enableMoveMode();
    };
    menu.appendChild(moveItems);

    // Delete Items
    const deleteItems = document.createElement('div');
    deleteItems.innerHTML = '<i class="fas fa-trash" style="margin-right:8px;color:#1976d2;"></i> Delete Items/List';
    deleteItems.style.padding = '10px 18px';
    deleteItems.style.cursor = 'pointer';
    deleteItems.style.fontWeight = '600';
    deleteItems.style.color = '#1976d2';
    deleteItems.onmouseenter = () => deleteItems.style.background = '#e3f2fd';
    deleteItems.onmouseleave = () => deleteItems.style.background = '';
    deleteItems.onclick = function () {
      menu.remove();
      enableDeleteMode();
    };
    menu.appendChild(deleteItems);

    // Reset Items
    const resetItems = document.createElement('div');
    resetItems.innerHTML = '<i class="fas fa-rotate-left" style="margin-right:8px;color:#1976d2;"></i> Reset List';
    resetItems.style.padding = '10px 18px';
    resetItems.style.cursor = 'pointer';
    resetItems.style.fontWeight = '600';
    resetItems.style.color = '#1976d2';
    resetItems.onmouseenter = () => resetItems.style.background = '#e3f2fd';
    resetItems.onmouseleave = () => resetItems.style.background = '';
    resetItems.onclick = function () {
      menu.remove();
      resetTable(cat);
    };
    menu.appendChild(resetItems);

    document.body.appendChild(menu);

    // --- Push state for back button dismissal ---
    history.pushState({ contextMenu: true }, 'Context Menu');

    // --- Auto-adjust menu position to avoid overflow ---
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      let newLeft = x;
      const padding = 8;
      if (rect.right > window.innerWidth) {
        newLeft = Math.max(window.innerWidth - rect.width - padding, 0);
        menu.style.left = newLeft + 'px';
      }
      if (rect.left < 0) {
        newLeft = padding;
        menu.style.left = newLeft + 'px';
      }
    }, 0);

    // Remove menu on click elsewhere
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          // If the history state is ours, go back to remove it
          if (history.state && history.state.contextMenu) {
            history.back();
          }
          document.removeEventListener('mousedown', handler);
        }
      });
    }, 0);
  }

  // --- Mark Zeros in a single table ---
  function markZerosInTable(cat) {
    if (!isLoggedIn) return;
    const items = groceryData[cat] || {};
    const updates = {};
    let changed = false;

    // First, mark all items with count 0 as checked
    for (const key in items) {
      if (key !== "order") {
        const item = items[key];
        if (item && (item.count || 0) === 0 && !item.checked) {
          groceryData[cat][key].checked = true;
          updates[`${key}/checked`] = true;
          changed = true;
        }
      }
    }

    // Move ALL checked items to bottom
    const keys = Object.keys(items).filter(k => k !== 'order' && items[k] && typeof items[k].name === 'string');
    const toBuy = []; // Items with count > 0 and not checked
    const checked = []; // All checked items (regardless of count)

    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const item = items[key];
      if (!item) continue;

      if (item.checked) {
        checked.push(key); // All checked items go to bottom
      } else if ((item.count || 0) > 0) {
        toBuy.push(key); // Unchecked items with count > 0 stay at top
      } else {
        // Unchecked items with count 0 - these were just marked as checked above
        checked.push(key);
      }
    }

    const newOrder = toBuy.concat(checked);
    saveTempOrder(cat, newOrder);

    renderList(cat);

    // Batch update DB for checked items
    if (changed) {
      setTimeout(() => {
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).update(updates);
      }, 0);
    }
  }

  // --- Add New Table ---
  const addTableMainBtn = document.getElementById('add-table-btn-main');
  if (addTableMainBtn) {
    addTableMainBtn.onclick = function () {
      if (!isLoggedIn) return;
      // Use custom modal for new table name
      showInputModal('New List Name:', function (listName) {
        if (!listName) return;
        const trimmedListName = listName.trim().replace(/\s+/g, ' ');
        if (!trimmedListName) return;
        const catKey = trimmedListName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

        // Add new table to DB (shoppingListsPerFamily)
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}`).set({ order: [] });
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${catKey}`).set(trimmedListName);
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).once('value')
          .then(snap => {
            let order = snap.val() || [];
            if (!order.includes(catKey)) {
              order.push(catKey);
              db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(order);
            }
          });

        localStorage.setItem('col-' + catKey, 'false');

        // Prompt for first item
        showInputModal('First item name:', function (itemName) {
          if (!itemName) return;
          const trimmedItemName = toProperCase(itemName.trim().replace(/\s+/g, ' '));
          if (!trimmedItemName) return;
          const nextKey = `item1`;
          const item = { name: trimmedItemName, count: 0, checked: false };
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}/${nextKey}`).set(item);
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}/order`).set([nextKey]);
        });
      });
    };
  }

  // --- Collapse/Expand Tables ---

  // --- Render List (override displayOrder logic) ---
  function renderList(cat) {
    if (pendingDeletedTables?.has?.(cat)) return;

    const ul = document.getElementById(cat);
    if (!ul) return;

    ul.innerHTML = '';

    const items = groceryData[cat] || {};
    // Safe write guard (prevents writes during/after logout)
    const canWriteNow =
      typeof canWrite === 'function'
        ? canWrite()
        : Boolean(typeof isLoggedIn !== 'undefined' && isLoggedIn && USER_LIST_KEY);

    // Determine render order
    let keys = getRenderOrder(cat, items);

    // Filter out items pending deletion from UI
    const pendingSet = pendingDeletedItems[cat] || new Set();
    const validKeys = keys.filter(
      (k) => items[k] && typeof items[k].name === 'string' && !pendingSet.has(k)
    );

    // Auto-fix stored order if it's out of sync (guarded write)
    if (
      Array.isArray(items.order) &&
      (items.order.length !== validKeys.length ||
        items.order.some((k) => !validKeys.includes(k)) ||
        validKeys.some((k) => !items.order.includes(k)))
    ) {
      groceryData[cat].order = validKeys;
      if (canWriteNow) {
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(validKeys);
      }
    }

    const displayOrder = keys.filter((k) => !pendingSet.has(k));

    // Render list items
    displayOrder.forEach((key) => {
      const item = items[key];
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;

      const li = document.createElement('li');
      li.dataset.key = key;

      // Classes based on state
      li.className = '';
      if (item.checked) {
        li.classList.add('checked');
      } else if ((item.count || 0) > 0) {
        li.classList.add('to-buy');
      } else {
        li.classList.add('zero-count');
      }

      // Structure (avoid inserting user-controlled text via innerHTML)
      li.innerHTML = `
        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecked('${cat}', '${key}', this.checked)">
        <div class="name" title="Alt+Click to edit item name" data-cat="${cat}" data-key="${key}"></div>
        ${
          moveMode
            ? `
          <span class="item-move-handle" title="Move item">
            <i class="fas fa-up-down-left-right" style="font-size:18px;color:#666;"></i>
          </span>
        `
            : deleteMode
            ? `
          <button class="item-delete-btn" onclick="deleteItem('${cat}', '${key}')">
            <span class="item-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete item"></i>
            </span>
          </button>
        `
            : `
          <div class="counter">
            <button onclick="updateCount('${cat}', '${key}', -1)">-</button>
            <span class="count">${typeof item.count === 'number' ? item.count : 0}</span>
            <button onclick="updateCount('${cat}', '${key}', 1)">+</button>
          </div>
        `
        }
      `;

      // Safely set the item name and language class
      const nameDiv = li.querySelector('.name');
      if (nameDiv) {
        nameDiv.textContent = item.name;

        // Hindi (Devanagari) detection for font/language tag
        if (/[\u0900-\u097F]/.test(item.name)) {
          nameDiv.setAttribute('lang', 'hi');
          nameDiv.classList.add('hindi-text');
        } else {
          nameDiv.removeAttribute('lang');
          nameDiv.classList.remove('hindi-text');
        }
      }

      ul.appendChild(li);
    });

    // Editable Item Name: Double-click to edit
    ul.querySelectorAll('.name').forEach((div) => {
      div.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        e.preventDefault();

        const c = this.getAttribute('data-cat');
        const k = this.getAttribute('data-key');
        const oldName = groceryData[c][k].name;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'edit-item-input';

        this.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
          let newName = input.value.trim();
          if (!newName) newName = oldName;

          groceryData[c][k].name = newName;
          renderList(c);

          // Persist only if allowed (prevents writes on logout)
          if (canWriteNow) {
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${c}/${k}/name`).set(newName);
          }

          // Update Hindi font/class after re-render
          setTimeout(() => {
            const listEl = document.getElementById(c);
            if (listEl) {
              listEl.querySelectorAll('.name').forEach((nameDiv) => {
                if (/[\u0900-\u097F]/.test(nameDiv.textContent)) {
                  nameDiv.setAttribute('lang', 'hi');
                  nameDiv.classList.add('hindi-text');
                } else {
                  nameDiv.removeAttribute('lang');
                  nameDiv.classList.remove('hindi-text');
                }
              });
            }
          }, 0);
        }

        input.onblur = finishEdit;
        input.onkeydown = function (ev) {
          if (ev.key === 'Enter') input.blur();
          if (ev.key === 'Escape') {
            input.value = oldName;
            input.blur();
          }
        };
      });
    });

    // Item-level sortable for move mode
    if (ul.sortableInstance) {
      ul.sortableInstance.destroy();
      ul.sortableInstance = null;
    }

    if (moveMode) {
      ul.sortableInstance = Sortable.create(ul, {
        animation: 200,
        handle: '.item-move-handle',
        draggable: 'li',
        ghostClass: 'dragging',
        chosenClass: 'item-moving',
        onStart() {
          ul.querySelectorAll('.item-squeeze').forEach((el) => el.classList.remove('item-squeeze'));
        },
        onEnd() {
          ul.querySelectorAll('.item-squeeze').forEach((el) => el.classList.remove('item-squeeze'));

          const newOrder = Array.from(ul.querySelectorAll('li'))
            .map((li) => li.dataset.key)
            .filter(Boolean);

          groceryData[cat].order = newOrder;

          if (canWriteNow) {
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`)
              .set(newOrder)
              .then(() => renderList(cat));
          } else {
            // No DB write (e.g., during logout). Just re-render UI.
            renderList(cat);
          }
        },
        onChange(evt) {
          ul.querySelectorAll('.item-squeeze').forEach((el) => el.classList.remove('item-squeeze'));
          const movedTo = ul.querySelectorAll('li')[evt.newIndex];
          if (movedTo) movedTo.classList.add('item-squeeze');
        }
      });
    }

    updateHeaderCount(cat);
  }

  // --- Toggle Checked ---
  function toggleChecked(cat, key, checked) {
    const item = groceryData[cat]?.[key];
    if (!item) return;

    // Update local data and UI instantly
    groceryData[cat][key].checked = checked;

    // --- Clear the sort flag if user manually checks/unchecks ---
    if (window._checkZerosSortFlags && window._checkZerosSortFlags[cat]) {
      delete window._checkZerosSortFlags[cat];
    }

    renderList(cat);

    // Update database in background
    setTimeout(() => {
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked });
    }, 0);

    updateHeaderCount(cat);
  }
  window.toggleChecked = toggleChecked;

  // --- Transaction helper for safe increments ---
  function incrementCountTransaction(cat, key, delta) {
    return db
      .ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}/count`)
      .transaction(current => {
        const cur = typeof current === 'number' ? current : 0;
        let next = cur + delta;
        if (next < 0) next = 0;
        return next;
      });
  }

  // --- Update Count (transaction-safe) ---
  function updateCount(cat, key, delta) {
    const item = groceryData[cat]?.[key];
    if (!item || item.checked) return;

    // Optimistic UI update
    const current = (typeof item.count === "number") ? item.count : 0;
    let optimistic = current + delta;
    if (optimistic < 0) optimistic = 0;
    groceryData[cat][key].count = optimistic;

    // Clear any check-zero sort flags
    if (window._checkZerosSortFlags && window._checkZerosSortFlags[cat]) {
      delete window._checkZerosSortFlags[cat];
    }

    renderList(cat); // re-render UI right away

    // Server-side transaction for race-free increment
    incrementCountTransaction(cat, key, delta)
      .then(() => {
        // Listener will sync the exact value
      })
      .catch(() => {
        // If transaction fails (e.g., offline), keep optimistic value
      });
  }
  window.updateCount = updateCount;

  // --- Delete Item ---
  function deleteItem(cat, key) {
    const itemName = groceryData[cat]?.[key]?.name || '';

    // --- Mark as pending deleted ---
    if (!pendingDeletedItems[cat]) pendingDeletedItems[cat] = new Set();
    pendingDeletedItems[cat].add(key);

    const backupItem = groceryData[cat][key];
    const backupOrder = Array.isArray(groceryData[cat].order) ? [...groceryData[cat].order] : [];

    // Remove from local data
    delete groceryData[cat][key];
    if (Array.isArray(groceryData[cat].order)) {
      groceryData[cat].order = groceryData[cat].order.filter(k => k !== key);
    }
    renderList(cat);

    // --- Create undo toast after re-render so it is not wiped out ---
    const undoToast = document.createElement('div');
    undoToast.className = 'undo-toast';
    undoToast.innerHTML = `
      <span class="undo-message">Item "${backupItem.name}" deleted.</span>
      <button class="undo-btn" type="button" tabindex="0">UNDO</button>
    `;
    document.body.appendChild(undoToast);

    let undone = false;
    let undoTimeout;

    function handleUndo() {
      if (undone) return;
      undone = true;
      clearTimeout(undoTimeout);
      // --- Remove from pending deletes ---
      pendingDeletedItems[cat].delete(key);
      // Restore in local data and UI
      groceryData[cat][key] = backupItem;
      groceryData[cat].order = backupOrder;
      renderList(cat);
      if (undoToast.parentNode) document.body.removeChild(undoToast);
    }

    const undoBtn = undoToast.querySelector('.undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', handleUndo, { passive: false });
      undoBtn.addEventListener('touchend', function (e) {
        e.preventDefault();
        handleUndo();
      }, { passive: false });
      undoBtn.focus(); // Ensure button is focused for accessibility
    }

    undoTimeout = setTimeout(() => {
      if (!undone) {
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
        // Remove from order array in DB
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).once('value').then(snap => {
          let order = snap.val() || [];
          order = order.filter(k => k !== key);
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(order);
        });
        if (undoToast.parentNode) document.body.removeChild(undoToast);
        // --- Remove from pending deletes after DB update ---
        if (pendingDeletedItems[cat]) pendingDeletedItems[cat].delete(key);
      }
    }, 8000);
  }
  window.deleteItem = deleteItem;

  // --- Delete Table ---
  function deleteTable(cat) {
    // Get table name and item count for confirmation
    const displayName = tableNames[cat] || cat;
    const itemsObj = groceryData[cat] || {};
    const itemKeys = Object.keys(itemsObj).filter(k => k !== "order" && itemsObj[k] && typeof itemsObj[k].name === "string");
    const itemCount = itemKeys.length;

    // Ask for confirmation before deleting
    showModal(
      `Delete table "${displayName}" with ${itemCount} item${itemCount === 1 ? '' : 's'}?`,
      function (yes) {
        if (!yes) return;

        // --- Mark as pending deleted ---
        pendingDeletedTables.add(cat);

        const backupTable = {
          groceryLists: groceryData[cat],
          tableName: tableNames[cat],
          tableOrder: Array.isArray(tableOrder) ? [...tableOrder] : []
        };

        // Remove from local data
        delete groceryData[cat];
        tableOrder = tableOrder.filter(k => k !== cat);
        renderAllTables();

        // --- Create undo toast after re-render so it is not wiped out ---
        const undoToast = document.createElement('div');
        undoToast.className = 'undo-toast';
        undoToast.innerHTML = `
          <span class="undo-message">Table "${displayName}" deleted.</span>
          <button class="undo-btn">UNDO</button>
        `;
        document.body.appendChild(undoToast);

        let undone = false;
        let undoTimeout;

        function handleUndo() {
          if (undone) return;
          undone = true;
          clearTimeout(undoTimeout);
          // --- Remove from pending deletes ---
          pendingDeletedTables.delete(cat);
          // Restore in local data and UI
          groceryData[cat] = backupTable.groceryLists;
          tableNames[cat] = backupTable.tableName;
          tableOrder = backupTable.tableOrder;
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).set(backupTable.groceryLists);
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).set(backupTable.tableName);
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(backupTable.tableOrder);
          renderAllTables();
          if (undoToast.parentNode) document.body.removeChild(undoToast);
        }

        const undoBtn = undoToast.querySelector('.undo-btn');
        if (undoBtn) {
          undoBtn.onclick = () => {
            handleUndo();
          };
          undoBtn.focus();
        }

        // --- After 8s, remove from DB: groceryLists, tableNames, tableOrder ---
        undoTimeout = setTimeout(() => {
          if (!undone) {
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).remove();
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
              let order = snap.val() || [];
              order = order.filter(k => k !== cat);
              db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(order);
            });
            if (undoToast.parentNode) document.body.removeChild(undoToast);
            pendingDeletedTables.delete(cat);
          }
        }, 8000);
      }
    );
  }
  window.deleteTable = deleteTable;

  // --- Voice Add Item ---
  function startVoiceAddItem(cat) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showModal("Sorry, your browser doesn't support voice recognition.", () => { });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // <-- Set to English (India)
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const listName = tableNames[cat] || cat;
    const headerColors = stringToHeaderColor(listName);

    // Remove any existing notification
    const existingNotification = document.querySelector('.voice-notification-backdrop');
    if (existingNotification) existingNotification.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'voice-notification-backdrop';
    backdrop.innerHTML = `
        <div class="voice-notification">
            <div class="voice-icon-wrapper">
                <i class="fas fa-microphone-alt"></i>
            </div>
            <div class="voice-text-wrapper">
                <span class="voice-title">Speak now...</span>
                <div class="voice-interim-results" id="voice-interim-results"></div>
                <span class="voice-subtitle">Adding item to:</span>
                <span class="voice-list-name" style="background-color: ${headerColors.bg}; color: ${headerColors.fg};">${listName}</span>
            </div>
            <button id="voice-cancel-btn" class="voice-cancel-btn">Cancel</button>
        </div>
    `;
    document.body.appendChild(backdrop);

    // --- Push state for back button dismissal ---
    history.pushState({ voicePromptActive: true }, 'Voice Input');

    let cleanedUp = false;
    const cleanup = (isPopState) => {
      if (cleanedUp) return;
      cleanedUp = true;
      recognition.stop();
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      window.removeEventListener('popstate', handlePopState);

      // If cleanup was triggered by something other than the back button,
      // we need to go back in history to remove the state we pushed.
      if (!isPopState && history.state && history.state.voicePromptActive) {
        history.back();
      }
    };

    const handlePopState = () => {
      cleanup(true); // Pass true to indicate it was triggered by popstate
    };
    window.addEventListener('popstate', handlePopState);

    let final_transcript = '';
    let final_transcript_timer = null;

    document.getElementById('voice-cancel-btn').onclick = () => cleanup(false);

    recognition.onresult = function (event) {
      // Clear any pending timer if new results are coming in.
      clearTimeout(final_transcript_timer);

      let interim_transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final_transcript += event.results[i][0].transcript;
        } else {
          interim_transcript += event.results[i][0].transcript;
        }
      }

      const interimEl = document.getElementById('voice-interim-results');
      if (interimEl) {
        interimEl.textContent = final_transcript || interim_transcript;
      }

      // If we have a final transcript, set a timer to process it.
      if (final_transcript) {
        if (interimEl) {
          interimEl.style.color = '#388e3c'; // Green for success
        }
        final_transcript_timer = setTimeout(() => {
          processVoiceResult(cat, final_transcript);
          cleanup(false); // Close the modal after processing
        }, 1000); // 1-second delay
      }
    };

    recognition.onspeechend = function () {
      // onresult handles cleanup
    };

    recognition.onerror = function (event) {
      if (event.error === 'not-allowed') {
        // Check if on insecure origin that is not localhost
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          showModal("<b>Microphone access denied.</b><br><br>For development on a private network, you must enable a browser flag. On Chrome, go to:<br><b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b><br><br>Add your site's address (e.g., http://192.168.1.140:5500) to the list, enable it, and relaunch.", () => { });
        } else {
          showModal("<b>Microphone access denied.</b><br><br>To use voice input, please grant microphone permission for this site. Note: Most browsers require a secure (HTTPS) connection.", () => { });
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showModal(`Voice recognition error: ${event.error}`, () => { });
      }
    };

    recognition.onend = function () {
      if (!final_transcript) {
        showErrorNotification("I didn't hear any voice prompt to add item! Please try again.");
        cleanup(false);
      }
    };

    recognition.start();
  }
  window.startVoiceAddItem = startVoiceAddItem;

  function highlightAndScrollToItem(cat, itemKey) {
    setTimeout(() => {
      const li = document.querySelector(`#${cat} li[data-key='${itemKey}']`);
      if (li) {
        // Expand table if collapsed
        const container = document.getElementById(`${cat}-container`);
        if (container && container.classList.contains('collapsed')) {
          toggleCollapse(cat);
        }

        li.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add a class to trigger the animation.
        li.classList.add('item-blink');

        // Remove the class after the animation duration (2 seconds)
        setTimeout(() => {
          li.classList.remove('item-blink');
        }, 2000);
      }
    }, 150);
  }

  // Error notification helper
  function showErrorNotification(message) {
    let notif = document.getElementById('voice-error-notification');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'voice-error-notification';
      notif.style.position = 'fixed';
      notif.style.top = '16px';
      notif.style.right = '16px';
      notif.style.zIndex = '9999';
      notif.style.padding = '14px 18px';
      notif.style.background = 'linear-gradient(135deg, #ff5252 0%, #e53935 100%)';
      notif.style.color = 'white';
      notif.style.fontWeight = 'bold';
      notif.style.borderRadius = '8px';
      notif.style.boxShadow = '0 4px 12px rgba(229, 57, 53, 0.3)';
      notif.style.transform = 'translateX(120%)';
      notif.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      notif.style.display = 'flex';
      notif.style.alignItems = 'center';
      notif.style.minWidth = '280px';
      notif.style.maxWidth = '90vw';

      // Add icon container
      const iconContainer = document.createElement('div');
      iconContainer.style.marginRight = '12px';
      iconContainer.innerHTML = '<i class="fas fa-exclamation-circle" style="font-size: 20px;"></i>';
      notif.appendChild(iconContainer);

      // Add text container
      const textContainer = document.createElement('div');
      textContainer.style.flex = '1';
      notif.appendChild(textContainer);

      document.body.appendChild(notif);
    }

    // Update the text
    const textContainer = notif.querySelector('div:nth-child(2)');
    if (textContainer) textContainer.textContent = message;

    // Show with animation
    setTimeout(() => {
      notif.style.transform = 'translateX(0)';
    }, 10);

    // Add shake animation
    setTimeout(() => {
      notif.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
    }, 300);

    // Add shake animation style if not already added
    if (!document.getElementById('error-notification-animation')) {
      const style = document.createElement('style');
      style.id = 'error-notification-animation';
      style.innerHTML = `
        @keyframes shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(120%); }
        }
      `;
      document.head.appendChild(style);
    }

    // Hide with animation after delay
    setTimeout(() => {
      notif.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => {
        notif.style.display = 'none';
        notif.style.transform = 'translateX(120%)';
      }, 500);
    }, 4000);
  }

  // --- Voice result processing (uses transactions) ---
  function processVoiceResult(cat, itemName) {
    // Validate and normalize
    if (!itemName || typeof itemName !== "string" || !itemName.trim()) {
      showErrorNotification("Sorry, I didn't catch that item. Please try again.");
      return;
    }
    const trimmedName = toProperCase(itemName.trim().replace(/\s+/g, ' '));
    if (!trimmedName) {
      showErrorNotification("Sorry, I couldn't process that item name.");
      return;
    }

    const items = groceryData[cat] || {};
    const existingKeys = Object.keys(items).filter(key =>
      key !== 'order' &&
      items[key] &&
      typeof items[key] === 'object' &&
      typeof items[key].name === 'string'
    );

    const searchName = trimmedName.toLowerCase();
    const existingItemKey = existingKeys.find(key =>
      items[key].name.trim().toLowerCase() === searchName
    );

    let targetKey;
    isVoiceAdding = true;

    if (existingItemKey) {
      // Existing item: transaction-safe increment
      targetKey = existingItemKey;
      const currentCount = items[targetKey].count || 0;

      try {
        // Optimistic UI update
        groceryData[cat][targetKey].count = currentCount + 1;
        groceryData[cat][targetKey].checked = false;

        // Transaction to increment count (race-safe)
        incrementCountTransaction(cat, targetKey, +1).catch(() => { /* ignore */ });

        // Ensure checked is false (non-transactional is fine)
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}/checked`).set(false);
      } catch (e) {
        showErrorNotification("Failed to update the item. Please try again.");
        isVoiceAdding = false;
        return;
      }
    } else {
      // New item: keep current logic (key generation unchanged)
      let maxNum = 0;
      existingKeys.forEach(key => {
        const match = key.match(/-?item(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      targetKey = existingKeys.some(k => k.startsWith('-')) ? `-item${maxNum + 1}` : `item${maxNum + 1}`;
      const newItem = { name: trimmedName, count: 1, checked: false };

      try {
        if (!groceryData[cat]) groceryData[cat] = {};
        groceryData[cat][targetKey] = newItem;
        if (!Array.isArray(groceryData[cat].order)) groceryData[cat].order = [];
        groceryData[cat].order.push(targetKey);

        if (tempOrders[cat] && tempOrders[cat].length > 0) {
          tempOrders[cat].unshift(targetKey);
          saveTempOrder(cat, tempOrders[cat]);
        }

        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}`).set(newItem);
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
      } catch (e) {
        showErrorNotification("Failed to add the item. Please try again.");
        isVoiceAdding = false;
        return;
      }
    }

    // Re-render and then scroll and blink
    renderList(cat);
    saveCache();
    highlightAndScrollToItem(cat, targetKey);

    setTimeout(() => {
      isVoiceAdding = false;
    }, 1500);
  }

  // --- Reset All (toolbar button) ---
  const resetAllBtn = document.getElementById('reset-all');
  if (resetAllBtn) {
    resetAllBtn.onclick = function () {
      showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
        if (!yes) return;

        // Change button icon to spinning refresh to indicate action
        resetAllBtn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> <span style="margin-left: 6px;">Reset All</span>';

        // 1. Update all local data instantly (only count and checked)
        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i];
          const items = groceryData[cat] || {};
          for (const key in items) {
            if (key !== "order") {
              if (typeof groceryData[cat][key].count === 'number') groceryData[cat][key].count = 0;
              groceryData[cat][key].checked = false;
            }
          }
          tempOrders[cat] = [];
        }

        // --- Instantly update UI ---
        renderAllTables();

        // 2. Update DB in the background (only count and checked)
        setTimeout(() => {
          for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            const items = groceryData[cat] || {};
            const updates = {};
            for (const key in items) {
              if (key !== "order") {
                updates[`${key}/count`] = 0;
                updates[`${key}/checked`] = false;
              }
            }
            if (Object.keys(updates).length > 0) {
              db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).update(updates);
            }
          }
          // --- Clear all temp order tables in DB ---
          clearAllTempOrders();
          setTimeout(() => {
            resetAllBtn.innerHTML = '<i class="fas fa-rotate-left"></i> <span style="margin-left: 6px;">Reset All</span>';
          }, 500);
        }, 0);
      });
    };
  }

  // --- Update Header Count ---
  function updateHeaderCount(cat) {
    const items = groceryData[cat] || {};
    // Only count items with count > 0 and not checked
    const count = Object.values(items)
      .filter(item => item && typeof item === "object" && item.count > 0 && !item.checked)
      .length;
    const el = document.getElementById(`${cat}-count`);
    if (!el) return;
    el.textContent = count; // Update the count in the header
    el.className = 'header-count'; // Ensure proper styling
  }

  // --- Inject custom CSS for moving/squeeze effects if not present ---
  (function injectMoveSqueezeCSS() {
    if (!document.getElementById('move-squeeze-css')) {
      const style = document.createElement('style');
      style.id = 'move-squeeze-css';
      style.innerHTML = `
        .item-moving {
          background: #e3f2fd !important;
          color: #01579b !important;
          border: none !important;
          box-shadow: 0 2px 12px 0 #90caf9;
          z-index: 10;
          transition: background 0.28s cubic-bezier(.68,-0.55,.27,1.55), color 0.18s, box-shadow 0.28s;
        }
        .item-squeeze {
          margin-top: 0.7em !important;
          margin-bottom: 0.7em !important;
          background: #bbdefb !important;
          border: 2.5px dashed #0288d1 !important;
          box-shadow: 0 0 8px 1px #4fc3f7;
          transition: margin 0.22s cubic-bezier(.68,-0.55,.27,1.55), background 0.18s, border 0.18s, box-shadow 0.18s;
        }
        ul li {
          transition: margin 0.22s cubic-bezier(.68,-0.55,.27,1.55), background 0.28s cubic-bezier(.68,-0.55,.27,1.55), border 0.18s, box-shadow 0.18s;
        }
      `;
      document.head.appendChild(style);
    }
  })();

  // --- Error Handling ---
  function handleFirebaseError(error) {
    if (!isLoggedIn) return; // Prevent popups after logout
    console.error("Firebase error:", error);
    const errorMsg = error && error.message ? error.message : "Unknown error occurred.";
    showModal(`Error: ${errorMsg}`, null); // Display error in a modal
  }

  // --- Add User Floating Button Logic ---
  function setAddUserButtonVisible(visible) {
    const btn = document.getElementById('add-user-btn');
    // Only show for sunil.kumar101@gmail.com
    const isSunil = USER_EMAIL === "sunil.kumar101@gmail.com";
    if (btn) btn.style.display = (visible && isSunil) ? 'flex' : 'none';
  }

  // Add User Modal
  function showAddUserModal(callback, prevData) {
    // Create modal if not present
    let backdrop = document.getElementById('add-user-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'add-user-modal-backdrop';
      backdrop.style = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:3000;background:rgba(30,40,60,0.18);display:flex;align-items:center;justify-content:center;';
      backdrop.innerHTML = `
        <div style="background:#fff;border-radius:13px;box-shadow:0 3px 14px rgba(0,0,0,0.13);padding:22px 20px 16px 20px;min-width:240px;max-width:90vw;width:340px;display:flex;flex-direction:column;gap:13px;">
          <div style="font-size:1.13rem;font-weight:700;margin-bottom:2px;text-align:center;">Add New User</div>
          <input id="add-user-email" type="email" placeholder="Email address" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;" autocomplete="off"/>
          <input id="add-user-family" type="text" placeholder="Family name" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;" autocomplete="off"/>
          <div id="add-user-error" style="color:#e53935;font-size:0.98rem;min-height:1.2em;text-align:center;"></div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:2px;">
            <button id="add-user-cancel" style="flex:1 1 0;padding:7px 0;border-radius:8px;font-weight:600;border:none;background:#f3f6fa;color:#222;">Cancel</button>
            <button id="add-user-ok" style="flex:1 1 0;padding:7px 0;border-radius:8px;font-weight:600;border:none;background:linear-gradient(90deg,#388e3c 60%, #5dd05d 100%);color:#fff;">Add</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
    } else {
      backdrop.style.display = 'flex';
    }
    backdrop.classList.add('active');
    document.getElementById('add-user-email').value = prevData && prevData.email ? prevData.email : '';
    document.getElementById('add-user-family').value = prevData && prevData.family ? prevData.family : '';
    document.getElementById('add-user-error').textContent = '';
    document.getElementById('add-user-email').focus();

    function cleanup() {
      backdrop.classList.remove('active');
      backdrop.style.display = 'none';
      document.getElementById('add-user-cancel').onclick = null;
      document.getElementById('add-user-ok').onclick = null;
      document.getElementById('add-user-email').onkeydown = null;
      document.getElementById('add-user-family').onkeydown = null;
    }

    document.getElementById('add-user-cancel').onclick = () => {
      cleanup();
      if (callback) callback(null);
    };

    function tryAddUser() {
      const email = document.getElementById('add-user-email').value.trim();
      const family = document.getElementById('add-user-family').value.trim();
      const errorDiv = document.getElementById('add-user-error');
      // Email validation
      if (!email) {
        errorDiv.textContent = 'Please enter an email address.';
        document.getElementById('add-user-email').focus();
        return;
      }
      // Simple email regex
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorDiv.textContent = 'Please enter a valid email address.';
        document.getElementById('add-user-email').focus();
        return;
      }
      if (!family) {
        errorDiv.textContent = 'Please enter a family name.';
        document.getElementById('add-user-family').focus();
        return;
      }
      // All good
      cleanup();
      callback({ email, family });
    }

    document.getElementById('add-user-ok').onclick = tryAddUser;
    document.getElementById('add-user-email').onkeydown = function (e) {
      if (e.key === 'Enter') tryAddUser();
      if (e.key === 'Escape') document.getElementById('add-user-cancel').click();
    };
    document.getElementById('add-user-family').onkeydown = function (e) {
      if (e.key === 'Enter') tryAddUser();
      if (e.key === 'Escape') document.getElementById('add-user-cancel').click();
    };
  }


// Return { emails: string[], families: string[] } for the Add User modal
// Robust families loader: UNION authorisedUsers + shoppingListsPerFamily, always include USER_FAMILY
async function fetchExistingFamilies() {
  window.SLDBG?.log('fetchExistingFamilies.start', { user: USER_EMAIL, isAdmin: isAdminEmail(USER_EMAIL) });
  const emails = [];
  const famSet = new Set();

  // 1) Read /authorisedUsers (admin-readable). Non-admin may get permission_denied; that's OK.
  try {
    const auSnap = await firebase.database().ref('/authorisedUsers').once('value');
    const au = auSnap.val() || {};
    Object.values(au).forEach(u => {
      const e = u?.email ? String(u.email).trim().toLowerCase() : '';
      const f = u?.family ? String(u.family).trim() : '';
      if (e) emails.push(e);
      if (isValidFamilyId(f)) famSet.add(f);
    });
    window.SLDBG?.log('fetchExistingFamilies.authorisedUsers', { emails: emails.length, families: famSet.size });
  } catch (e) {
    window.SLDBG?.log('fetchExistingFamilies.authorisedUsers.err', { code: e?.code, msg: e?.message });
  }

  // 2) UNION: keys under /shoppingListsPerFamily (admin-readable). We union even if AU had some.
  try {
    const famSnap = await firebase.database().ref('/shoppingListsPerFamily').once('value');
    const data = famSnap.val() || {};
    Object.keys(data).forEach(k => { if (isValidFamilyId(k)) famSet.add(k); });
    window.SLDBG?.log('fetchExistingFamilies.union.shoppingListsPerFamily', { families: famSet.size });
  } catch (e) {
    window.SLDBG?.log('fetchExistingFamilies.fallback.err', { code: e?.code, msg: e?.message });
  }

  // 3) Always include the current user’s family as a last resort
  if (isValidFamilyId(USER_FAMILY)) famSet.add(USER_FAMILY);

  const families = Array.from(famSet).sort((a, b) => a.localeCompare(b));
  window.SLDBG?.log('fetchExistingFamilies.done', { familiesLen: families.length });
  return { emails, families };
}


  // --- Add User Button click handler ---
// Replace your Add User button handler with this (unions families + logs)
const addUserBtn = document.getElementById('add-user-btn');
if (addUserBtn) {
  addUserBtn.onclick = async function () {
    try {
      const { emails, families } = await fetchExistingFamilies();
      window.SLDBG?.log('addUserBtn.click.loaded', { emailsLen: emails.length, familiesLen: families.length });
      showAddUserTwoStageModal(emails, families);
    } catch (e) {
      window.SLDBG?.log('addUserBtn.click.err', { code: e?.code, msg: e?.message });
      showAddUserTwoStageModal([], [USER_FAMILY].filter(Boolean)); // at least show own family
    }
  };
}

  // --- Two-stage modal with radio buttons for existing/new family ---
// Replace the entire modal function with this version.
// Non-admin: fixed family field (no dropdown), "new family" option hidden.
// Admin: dropdown with all families and can also create a new family.
function showAddUserTwoStageModal(existingEmails, existingFamilies) {
  // Remove any existing modal
  let backdrop = document.getElementById('add-user-modal-backdrop');
  if (backdrop) backdrop.remove();

  const admin = isAdminEmail(USER_EMAIL);
  const uniqueFamilies = Array.from(new Set((existingFamilies || []).filter(isValidFamilyId)));
  // Non-admin only ever sees their family
  const familiesForUi = admin ? uniqueFamilies : [USER_FAMILY].filter(isValidFamilyId);
  const famCount = familiesForUi.length;

  backdrop = document.createElement('div');
  backdrop.id = 'add-user-modal-backdrop';
  backdrop.style = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:4001;background:rgba(30,40,60,0.18);display:flex;align-items:center;justify-content:center;';
  backdrop.innerHTML = `
    <form id="add-user-form" style="background:#fff;border-radius:13px;box-shadow:0 3px 14px rgba(0,0,0,0.13);padding:22px 20px 16px 20px;min-width:240px;max-width:90vw;width:340px;display:flex;flex-direction:column;gap:13px;">
      <div style="font-size:1.13rem;font-weight:700;margin-bottom:2px;text-align:center;">Add New User</div>
      <div style="font-size:0.9rem;color:#64748b;text-align:center;margin-top:-4px;">Found ${famCount} famil${famCount === 1 ? 'y' : 'ies'}</div>

      <div id="add-user-mode-wrap" style="display:flex;flex-direction:column;gap:8px;justify-content:center;margin:10px 0 8px;">
        <label style="display:flex;align-items:center;gap:7px;font-size:1.09rem;font-weight:700;color:#1976d2;cursor:pointer;">
          <input type="radio" name="add-user-mode" value="existing" style="margin-right:6px;vertical-align:middle;">
          Add this new user to an existing family
        </label>
        <label id="add-user-radio-new" style="display:${admin ? 'flex' : 'none'};align-items:center;gap:7px;font-size:1.09rem;font-weight:700;color:#1976d2;cursor:pointer;">
          <input type="radio" name="add-user-mode" value="new" style="margin-right:6px;vertical-align:middle;">
          Add this new user along with a new family
        </label>
      </div>

      <div id="add-user-stage"></div>
      <div id="add-user-error" style="color:#e53935;font-size:0.98rem;min-height:1.2em;text-align:center;"></div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:2px;">
        <button type="button" id="add-user-cancel" style="flex:1 1 0;padding:7px 0;border-radius:8px;font-weight:600;border:none;background:#f3f6fa;color:#222;">Cancel</button>
        <button type="submit" id="add-user-ok" style="flex:1 1 0;padding:7px 0;border-radius:8px;font-weight:600;border:none;background:linear-gradient(90deg,#388e3c 60%, #5dd05d 100%);color:#fff;">Add</button>
      </div>
    </form>
  `;
  document.body.appendChild(backdrop);

  function setCancelHandler() {
    const cancelBtn = document.getElementById('add-user-cancel');
    if (cancelBtn) cancelBtn.onclick = () => {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };
  }

  function renderStage(mode, prevEmail = '', prevFamily = '', prevFamilySelect = '') {
    const stageDiv = document.getElementById('add-user-stage');

    if (mode === 'existing') {
      // Admin: show dropdown; Non-admin: fixed, disabled input with hidden value
      const existingUi = admin
        ? `
          <input id="add-user-email" type="email" placeholder="New user email"
            style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;margin-bottom:7px;" autocomplete="off"/>
          <select id="add-user-family-select" class="family-dropdown"
            style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;">
            <option value="">Select family</option>
            ${familiesForUi.map(fam => `<option value="${fam}" class="family-option">${fam}</option>`).join('')}
          </select>
        `
        : `
          <input id="add-user-email" type="email" placeholder="New user email"
            style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;margin-bottom:7px;" autocomplete="off"/>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label style="font-size:.95rem;color:#475569;">Family</label>
            <input id="fixed-family-display" type="text" value="${USER_FAMILY || ''}" disabled
              style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f1f5f9;color:#111827;outline:none;width:100%;box-sizing:border-box;"/>
            <input id="fixed-family-value" type="hidden" value="${USER_FAMILY || ''}"/>
          </div>
        `;

      stageDiv.innerHTML = existingUi;
    } else {
      // Only admin can see "new family" mode (radio hidden for others)
      stageDiv.innerHTML = `
        <input id="add-user-email" type="email" placeholder="New user email"
          style="font-size:1.01rem;padding:7px 8px;border:1.2px solid #c7d1e6;border-radius:7px;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;margin-bottom:7px;" autocomplete="off"/>
        <input id="add-user-family" type="text" placeholder="New family name"
          style="font-size:1.01rem;padding:7px 8px;border:1.2px solid #c7d1e6;border-radius:7px;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;" autocomplete="off"/>
      `;
    }

    // Restore previous values or preselect current family
    const emailInput = document.getElementById('add-user-email');
    if (emailInput) emailInput.value = prevEmail || '';

    if (mode === 'existing' && admin) {
      const famSelect = document.getElementById('add-user-family-select');
      if (famSelect) {
        const want = prevFamilySelect || (familiesForUi.includes(USER_FAMILY) ? USER_FAMILY : '');
        famSelect.value = want;
      }
    } else if (mode === 'new' && admin) {
      const famInput = document.getElementById('add-user-family');
      if (famInput) famInput.value = prevFamily || '';
    }

    setCancelHandler();

    // Validation
    const errorDiv = document.getElementById('add-user-error');
    function validate() {
      const em = (document.getElementById('add-user-email')?.value || '').trim().toLowerCase();
      let fam = '';
      if (mode === 'existing') {
        if (admin) {
          fam = document.getElementById('add-user-family-select')?.value || '';
        } else {
          fam = document.getElementById('fixed-family-value')?.value || USER_FAMILY || '';
        }
      } else {
        fam = (document.getElementById('add-user-family')?.value || '').trim();
      }

      let ok = true, msg = '';
      if (!em) { ok = false; msg = 'Please enter an email address.'; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { ok = false; msg = 'Please enter a valid email address.'; }
      if (!fam) { ok = false; if (!msg) msg = (mode === 'existing' ? 'Please select a family.' : 'Please enter a family name.'); }

      errorDiv.textContent = msg;
      const okBtn = document.getElementById('add-user-ok');
      if (okBtn) { okBtn.disabled = !ok; okBtn.style.opacity = ok ? '' : '0.6'; okBtn.style.cursor = ok ? '' : 'not-allowed'; }
    }
    document.getElementById('add-user-email')?.addEventListener('input', validate);
    document.getElementById('add-user-family-select')?.addEventListener('change', validate);
    document.getElementById('add-user-family')?.addEventListener('input', validate);
    setTimeout(validate, 0);
  }

  // Initial mode: admin → existing if any families; non-admin → existing only
  let mode = 'existing';
  renderStage(mode);
  document.querySelectorAll('input[name="add-user-mode"]').forEach(r => { r.checked = (r.value === mode); });

  // Radio change re-renders stage (non-admin cannot see "new" option anyway)
  document.querySelectorAll('input[name="add-user-mode"]').forEach(radio => {
    radio.addEventListener('change', function () {
      mode = this.value;
      const prevEmail = document.getElementById('add-user-email')?.value || '';
      const prevFamilyInput = document.getElementById('add-user-family')?.value || '';
      const prevFamilySelect = document.getElementById('add-user-family-select')?.value || '';
      renderStage(mode, prevEmail, prevFamilyInput, prevFamilySelect);
    });
  });

  setCancelHandler();

  // Submit handler (uses your existing /authorisedUsers write flow)
  const form = document.getElementById('add-user-form');
  form.onsubmit = function (e) {
    e.preventDefault();
    const email = (document.getElementById('add-user-email')?.value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    let familyId = '';
    if (mode === 'existing') {
      if (admin) {
        const fam = document.getElementById('add-user-family-select')?.value || '';
        if (!fam) return;
        familyId = sanitizeFamilyId(fam);
      } else {
        const fam = document.getElementById('fixed-family-value')?.value || USER_FAMILY || '';
        if (!fam) return;
        familyId = sanitizeFamilyId(fam);
      }
    } else {
      // New family path — admin only
      const fam = (document.getElementById('add-user-family')?.value || '').trim();
      if (!fam) return;
      familyId = sanitizeFamilyId(fam);
    }

    // From here you can keep your existing confirmation + /authorisedUsers write logic.
    // authorisedUids/{uid} will be auto-created on first sign-in in handleUserLogin.
    // (No changes needed to that part of your code.)
    window.SLDBG?.log('addUser.submit', { email, familyId, mode, admin });
  };
}



// --- Initialize UI state on load ---
showLogin();  // default to login until auth resolves

// --- LocalStorage Caching for Fast Load ---
function saveCache() {
  try {
    const cache = {
      groceryData,
      tableNames,
      tableOrder: typeof tableOrder !== 'undefined' ? tableOrder : [],
      categories
    };
    localStorage.setItem('swiftListCache', JSON.stringify(cache));
  } catch (e) { /* ignore */ }
}

function loadCache() {
  try {
    const cache = JSON.parse(localStorage.getItem('swiftListCache'));
    if (cache && typeof cache === 'object') {
      groceryData = cache.groceryData || {};
      tableNames = cache.tableNames || {};
      tableOrder = cache.tableOrder || Object.keys(groceryData);
      categories = cache.categories || Object.keys(groceryData);
      renderAllTables();
    }
  } catch (e) { /* ignore */ }
}

// --- On page load, render from cache immediately (without forcing main UI visible) ---
loadCache();

// Utility to show/hide sync toast notification
/* ========== Modern Sync UX (drop-in replacement for setSyncIndicator) ========== */
(function ensureSyncUxCSS() {
  if (document.getElementById('sync-ux-css')) return;
  const style = document.createElement('style');
  style.id = 'sync-ux-css';
  style.textContent = `
    .sync-ux {
      position: fixed;
      right: 16px;
      top: 18px;
      z-index: 5000;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: #0f172a;
      color: #e5e7eb;
      box-shadow: 0 10px 30px rgba(2, 6, 23, 0.35);
      border: 1px solid rgba(148,163,184,.2);
      transform: translateY(-12px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    }
    .sync-ux[data-visible="true"] {
      opacity: 1;
      transform: translateY(0);
    }
    .sync-ux-icon {
      width: 20px; height: 20px; display: grid; place-items: center;
    }
    .sync-ux-icon svg { width: 20px; height: 20px; display: none; }
    .sync-ux[data-state="syncing"] .icon-cloud { display: block; }
    .sync-ux[data-state="saved"]   .icon-check { display: block; }
    .sync-ux[data-state="error"]   .icon-error { display: block; }

    .sync-ux-text { font-weight: 600; font-size: .92rem; letter-spacing: .2px; }

    /* Progress bar shown while syncing */
    .sync-ux-bar { position: relative; overflow: hidden; width: 120px; height: 4px; border-radius: 999px; background: #1f2937; }
    .sync-ux-bar > span {
      position: absolute; inset: 0; width: 40%;
      background: linear-gradient(90deg, #38bdf8, #0ea5e9);
      border-radius: inherit;
      transform: translateX(-100%);
      animation: sync-slide 1.6s ease-in-out infinite;
      box-shadow: 0 0 10px rgba(14,165,233,.3);
    }
    .sync-ux[data-state="saved"] .sync-ux-bar,
    .sync-ux[data-state="error"] .sync-ux-bar { display: none; }

    @keyframes sync-slide {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(140%); }
      100% { transform: translateX(240%); }
    }

    /* Color themes per state */
    .sync-ux[data-state="syncing"] {
      background: #0b1220;
      border-color: rgba(56, 189, 248, 0.25);
    }
    .sync-ux[data-state="saved"] {
      background: #052e1a;
      border-color: rgba(34,197,94,.35);
      color: #d1fae5;
    }
    .sync-ux[data-state="error"] {
      background: #2a0b0b;
      border-color: rgba(239,68,68,.35);
      color: #fee2e2;
    }

    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .sync-ux, .sync-ux * { animation: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(style);
})();

const SyncUX = (() => {
  let el, txt, bar, visible = false, state = 'syncing';
  let showTimer = null, hideTimer = null, minVisibleTimer = null;
  let lastShownAt = 0;

  function create() {
    if (el) return el;

    // Remove old toast if it exists
    const legacy = document.getElementById('sync-toast');
    if (legacy) legacy.remove();

    el = document.createElement('div');
    el.id = 'sync-ux';
    el.className = 'sync-ux';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.dataset.state = 'syncing';
    el.dataset.visible = 'false';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('icon-cloud');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.innerHTML = `
      <path d="M6 19h11a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 7a5 5 0 0 0-.92 9.95" fill="#93c5fd" stroke="#93c5fd" stroke-width="1.2" opacity=".92"></path>
    `;

    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    check.classList.add('icon-check');
    check.setAttribute('viewBox', '0 0 24 24');
    check.innerHTML = `
      <path d="M20 6L9 17l-5-5" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
    `;

    const error = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    error.classList.add('icon-error');
    error.setAttribute('viewBox', '0 0 24 24');
    error.innerHTML = `
      <path d="M12 9v4M12 17h.01M10.29 3.86l-8.48 14.7A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.72-3.44l-8.48-14.7a2 2 0 0 0-3.42 0z"
        fill="none" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    `;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'sync-ux-icon';
    iconWrap.appendChild(icon);
    iconWrap.appendChild(check);
    iconWrap.appendChild(error);

    txt = document.createElement('div');
    txt.className = 'sync-ux-text';
    txt.textContent = 'Syncing with cloud…';

    bar = document.createElement('div');
    bar.className = 'sync-ux-bar';
    const barInner = document.createElement('span');
    bar.appendChild(barInner);

    el.appendChild(iconWrap);
    el.appendChild(txt);
    el.appendChild(bar);
    document.body.appendChild(el);
    return el;
  }

  function showSyncing() {
    create();
    clearTimeouts();
    state = 'syncing';
    el.dataset.state = 'syncing';
    txt.textContent = 'Syncing with cloud…';

    // delay showing slightly to avoid flicker on very fast operations
    showTimer = setTimeout(() => {
      visible = true;
      el.dataset.visible = 'true';
      lastShownAt = Date.now();
      // minimum visible time to avoid flicker when finishing quickly
      minVisibleTimer = setTimeout(() => {}, 600);
    }, 120);
  }

  function showSaved() {
    create();
    clearTimeouts();
    state = 'saved';
    el.dataset.state = 'saved';
    txt.textContent = 'All changes saved';

    const doHide = () => {
      visible = false;
      el.dataset.visible = 'false';
    };

    // If it was just shown, wait to respect min visible time
    const elapsed = Date.now() - lastShownAt;
    const wait = Math.max(0, 600 - elapsed);
    hideTimer = setTimeout(() => {
      visible = true;
      el.dataset.visible = 'true';
      setTimeout(doHide, 1200);
    }, wait);
  }

  function showError(message) {
    create();
    clearTimeouts();
    state = 'error';
    el.dataset.state = 'error';
    txt.textContent = message || 'Failed to sync';
    visible = true;
    el.dataset.visible = 'true';
    hideTimer = setTimeout(() => {
      visible = false;
      el.dataset.visible = 'false';
    }, 2000);
  }

  function clearTimeouts() {
    [showTimer, hideTimer, minVisibleTimer].forEach(t => t && clearTimeout(t));
    showTimer = hideTimer = minVisibleTimer = null;
  }

  // public API
  return {
    syncing(on) { on ? showSyncing() : showSaved(); },
    error(msg) { showError(msg); }
  };
})();

/* Backwards-compatible wrapper: keep using setSyncIndicator(true/false) anywhere in the code */
function setSyncIndicator(visible) {
  try {
    if (visible) SyncUX.syncing(true);
    else SyncUX.syncing(false);
  } catch (_) { /* no-op */ }
}

/* Optional: when you catch a DB error somewhere, you can call:
     SyncUX.error('Sync failed');  // will show a red pill briefly
*/


// --- Reset Individual Table ---
  function resetTable(cat) {
    // Confirm reset action with YES/NO
    showModal(
      `Are you sure you want to reset all counters and uncheck all items in table "${tableNames[cat] || cat}"?`,
      function (confirmed) {
        if (!confirmed) return;

        setSyncIndicator(true);

        // 1. Update all local data instantly (only count and checked)
        const items = groceryData[cat] || {};
        for (const key in items) {
          if (key !== "order") {
            if (typeof items[key].count === 'number') items[key].count = 0;
            items[key].checked = false;
          }
        }
        tempOrders[cat] = [];

        // Instantly update UI for this table
        renderList(cat);
        updateHeaderCount(cat);

        // 2. Update DB in the background
        setTimeout(() => {
          const updates = {};
          for (const key in items) {
            if (key !== "order") {
              updates[`${key}/count`] = 0;
              updates[`${key}/checked`] = false;
            }
          }
          if (Object.keys(updates).length > 0) {
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).update(updates);
          }
          // Clear temp order for this table in DB
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/${cat}_temp_items_orders_check_zeros_btn`).remove();

          setTimeout(() => {
            setSyncIndicator(false);
          }, 500);
        }, 0);
      }
    );
  }
  window.resetTable = resetTable;

  // --- Enable/Disable Move/Delete Modes ---
  function enableMoveDeleteMode() {
    moveDeleteMode = true;
    renderAllTables();
    history.pushState({ moveMode: true }, '', '');
  }
  function enableMoveMode() {
    moveMode = true;
    deleteMode = false;
    moveDeleteMode = true;
    renderAllTables();
    history.pushState({ moveMode: true }, '', '');
  }
  function enableDeleteMode() {
    deleteMode = true;
    moveMode = false;
    moveDeleteMode = true;
    renderAllTables();
    history.pushState({ deleteMode: true }, '', '');
  }
  function disableMoveDeleteMode() {
    moveDeleteMode = false;
    moveMode = false;
    deleteMode = false;
    renderAllTables();
  }

  // --- Handle browser back button to exit move mode and close overlays ---
  window.addEventListener('popstate', function () {
    // Close help modal if open
    const helpModal = document.getElementById('help-modal-backdrop');
    if (helpModal) {
      helpModal.remove();
    }

    // Close context menu if open
    const contextMenu = document.querySelector('.header-context-menu');
    if (contextMenu) {
      contextMenu.remove();
    }

    if (moveDeleteMode || moveMode || deleteMode) {
      disableMoveDeleteMode();
    }
  });

  // --- Fix: Add stringToHeaderColor utility ---
  function stringToHeaderColor(str) {
    // Deterministic color palette for table headers
    const palettes = [
      { bg: "#b8dbc7", fg: "#23472b", lightBg: "#f1f8f4" },
      { bg: "#d7c3e6", fg: "#4b2956", lightBg: "#f8f3fb" },
      { bg: "#c3d4ea", fg: "#23324b", lightBg: "#f3f6fa" },
      { bg: "#cfd8dc", fg: "#263238", lightBg: "#f6f8f9" },
      { bg: "#f3cccc", fg: "#8b1c1c", lightBg: "#fdf5f5" },
      { bg: "#e2d3cb", fg: "#4e342e", lightBg: "#f9f6f4" },
      { bg: "#c3d4ea", fg: "#232c3d", lightBg: "#f3f6fa" },
    ];
    // Pick palette based on hash of string
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const idx = Math.abs(hash) % palettes.length;
    return palettes[idx];
  }

  // --- Utility: sanitize family name for Firebase key ---
  function sanitizeFamilyId(name) {
    return (name || '')
      .trim()
      .toLowerCase()
      .replace(/[\.\#\$\[\]]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\-]/g, ''); // allow a-z, 0-9, _, -
  }

  // --- Help Modal Logic ---
  function showHelpModal() {
    // Remove existing modal if any
    const existingModal = document.getElementById('help-modal-backdrop');
    if (existingModal) existingModal.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'help-modal-backdrop';
    backdrop.innerHTML = `
      <div class="help-modal-content">
        <div class="help-modal-header">
          <h2>Your <span class="brand-accent">SwiftList</span> - Help & Features</h2>
          <button id="help-close-btn">&times;</button>
        </div>
        <div class="help-modal-body">
          <div class="help-section">
            <h3>General Usage</h3>
            <ul>
              <li>
                <span class="help-label">Add New List</span>
                <span class="help-desc">Click the "＋ Add New List & Item" button at the bottom.</span>
              </li>
              <li>
                <span class="help-label">Add Item to List</span>
                <span class="help-desc">Click the "＋ Add Item" button below any list.</span>
              </li>
              <li>
                <span class="help-label">Edit Name</span>
                <span class="help-desc">Double-click on any list title or item name to edit it.</span>
              </li>
              <li>
                <span class="help-label">Collapse/Expand</span>
                <span class="help-desc">Click on a list's header or the arrow on the right to toggle its visibility.</span>
              </li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Voice Commands</h3>
            <ul>
              <li>
                <span class="help-label">Add by Voice</span>
                <span class="help-desc">Long-press the <span class="help-icon-wrap"><i class="fas fa-microphone-alt"></i><i class="fas fa-plus" style="font-size:0.7em;"></i></span> icon on a list header. If the item exists, its count is increased. If not, it's added to the list with a count of 1.</span>
              </li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Advanced Actions (Context Menu)</h3>
            <p style="padding-left:5px; margin-bottom:15px;">Long-press (or right-click) the <i class="fas fa-ellipsis-v"></i> icon on a list header to open the context menu.</p>
            <ul>
              <li>
                <span class="help-label">Highlight Items</span>
                <span class="help-desc">Automatically checks off items with a count of 0 and moves them to the bottom of the list.</span>
              </li>
              <li>
                <span class="help-label">Move Mode</span>
                <span class="help-desc">Enter a mode to reorder items within a list or entire lists on the page by dragging them.</span>
              </li>
              <li>
                <span class="help-label">Delete Mode</span>
                <span class="help-desc">Enter a mode to show delete buttons for items and lists.</span>
              </li>
              <li>
                <span class="help-label">Reset List</span>
                <span class="help-desc">Resets all item counts to 0 and un-checks all items for that specific list.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    // --- Push state for back button dismissal ---
    history.pushState({ helpModal: true }, 'Help Modal');

    const close = () => {
      // If the modal is being closed and the history state is ours, go back.
      if (history.state && history.state.helpModal) {
        history.back();
      }
      backdrop.remove();
    };

    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
    document.getElementById('help-close-btn').onclick = close;
  }

  // Attach listener to help icon
  document.body.addEventListener('click', function (e) {
    if (e.target.id === 'help-icon') {
      showHelpModal();
    }
  });
});

// File a join request so admin can approve access (no-op if already present)
function fileJoinRequestIfNeeded(email, family, uid) {
  try {
    if (!email || !family || !uid) return;
    firebase.database().ref(`/joinRequests/${uid}`).set({
      email: String(email).toLowerCase(),
      family,
      ts: Date.now()
    }).catch(() => {});
  } catch (e) {}
}

// Admin: review and approve join requests (safe: checks current signed-in user)
function showJoinRequestsModal() {
  const u = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
  if (!u || String(u.email).toLowerCase() !== 'sunil.kumar101@gmail.com') return;

  const dbRef = firebase.database().ref('/joinRequests');
  dbRef.once('value').then(snap => {
    const reqs = snap.val() || {};
    const entries = Object.entries(reqs);

    const backdrop = document.createElement('div');
    backdrop.id = 'join-requests-backdrop';
    backdrop.style = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:5000;background:rgba(30,40,60,0.18);display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style = 'background:#fff;border-radius:13px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:18px;min-width:280px;max-width:90vw;width:420px;max-height:80vh;overflow:auto;';
    dialog.innerHTML = `
      <div style="font-weight:800;font-size:1.15rem;margin-bottom:10px;">Pending access requests</div>
      <div id="jr-list"></div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
        <button id="jr-close" style="padding:7px 12px;border-radius:8px;border:none;background:#f3f6fa;font-weight:700;">Close</button>
      </div>
    `;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const list = dialog.querySelector('#jr-list');
    if (!entries.length) {
      list.innerHTML = '<div style="color:#555;">No pending requests.</div>';
    } else {
      entries.forEach(([uid, value]) => {
        const email = value && value.email ? value.email : '';
        const family = value && value.family ? value.family : '';
        const ts = value && value.ts ? value.ts : Date.now();

        const row = document.createElement('div');
        row.style = 'display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:6px 0;';
        const left = document.createElement('div');
        left.innerHTML = `
          <div style="font-weight:700">${email || '(no email)'}</div>
          <div style="font-size:0.95rem;color:#555">UID: ${uid}<br>Family: <b>${family}</b><br><span style="color:#777">${new Date(ts).toLocaleString()}</span></div>
        `;
        const actions = document.createElement('div');
        const approve = document.createElement('button');
        approve.textContent = 'Approve';
        approve.style = 'padding:7px 10px;border:none;border-radius:8px;background:linear-gradient(90deg,#16a34a 0%, #0ea5e9 100%);color:#fff;font-weight:800;cursor:pointer;';
        approve.onclick = async () => {
          try {
            await firebase.database().ref(`/authorisedUids/${uid}`).set({ email: (email || '').toLowerCase(), family });
            await firebase.database().ref(`/joinRequests/${uid}`).remove();
            row.remove();
          } catch (e) {
            alert('Failed to approve: ' + (e && e.message ? e.message : e));
          }
        };
        actions.appendChild(approve);
        row.appendChild(left);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }

    dialog.querySelector('#jr-close').onclick = () => backdrop.remove();
    backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  });
}

// Bind admin modal to right-click on the Add User button
document.getElementById('add-user-btn')?.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showJoinRequestsModal();
});