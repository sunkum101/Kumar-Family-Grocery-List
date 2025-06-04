// --- AUTH & DOM READY ---
document.addEventListener("DOMContentLoaded", function () {
  // --- Allowed Users & Avatars ---
  const ALLOWED_USERS = [
    "sunil.kumar101@gmail.com",
    "manju4sun@gmail.com",
    "yashvi.k.australia@gmail.com"
  ];
  const USER_AVATARS = {
    "sunil.kumar101@gmail.com": "https://www.gravatar.com/avatar/9c6e6f2c4eae64c1e11c6f9d952a8a33?d=identicon",
    "manju4sun@gmail.com": "https://www.gravatar.com/avatar/6fa6e4ea6e7a5c3f4aec7f4bba50f1a4?d=identicon",
    "yashvi.k.australia@gmail.com": "https://www.gravatar.com/avatar/cfe5c6e9c1e7a9b7ed7b3e1b3d5f2c2d?d=identicon"
  };

  let moveDeleteMode = false;
  let deletedRowBackup = null;
  let deletedRowTimer = null;

  // --- Render Allowed Users List ---
  function renderAllowedList() {
    const ul = document.getElementById('allowed-list');
    ul.innerHTML = '';
    ALLOWED_USERS.forEach(email => {
      const li = document.createElement('li');
      li.className = 'allowed-item';
      li.tabIndex = 0;
      li.setAttribute('data-email', email);

      let avatarUrl = USER_AVATARS[email];
      let avatar;
      if (avatarUrl) {
        avatar = document.createElement('img');
        avatar.src = avatarUrl;
        avatar.className = 'allowed-avatar';
        avatar.alt = email;
      } else {
        avatar = document.createElement('div');
        avatar.className = 'allowed-avatar';
        avatar.textContent = email.split('@')[0][0].toUpperCase();
      }
      li.appendChild(avatar);

      const emailSpan = document.createElement('span');
      emailSpan.textContent = email;
      li.appendChild(emailSpan);

      li.onclick = () => selectAllowedEmail(email, li);
      li.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") selectAllowedEmail(email, li);
      };
      ul.appendChild(li);
    });
  }
  let selectedEmail = null;
  function selectAllowedEmail(email, li) {
    selectedEmail = email;
    document.querySelectorAll('.allowed-item').forEach(e => {
      e.classList.remove('selected');
    });
    li.classList.add('selected');
    document.getElementById('google-btn-text').textContent = `Sign in as ${email.split('@')[0]}`;
    document.getElementById('google-signin-btn').style.display = "";
    setTimeout(() => { document.getElementById('google-signin-btn').focus(); }, 80);
  }

  // --- Firebase Setup ---
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
  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  function googleSignIn() {
    if (!selectedEmail) {
      document.getElementById('login-error').textContent = "Please select your email address above.";
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ login_hint: selectedEmail });
    auth.signInWithPopup(provider)
      .then((result) => {
        const user = result.user;
        if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(user.email)) {
          auth.signOut();
          document.getElementById('login-error').textContent = 'Access denied. Please use an allowed Google account.';
          return;
        }
        showMain();
        subscribeAllLists();
      })
      .catch((err) => {
        document.getElementById('login-error').textContent = err.message;
      });
  }
  document.getElementById('google-signin-btn').onclick = googleSignIn;
  renderAllowedList();

  // --- Logout Logic ---
  function clearAllCookies() {
    const cookies = document.cookie.split("; ");
    for (let c of cookies) {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substring(0, eqPos) : c;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    }
  }
  function logout() {
    listeners?.forEach(fn => { try { fn(); } catch (e) { } });
    listeners = [];
    auth.signOut().finally(() => {
      clearAllCookies();
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    });
  }
  document.getElementById('logout-btn-top').onclick = function () {
    showModal("Are you sure you want to logout?", function (yes) {
      if (yes) logout();
    });
  };

  function setLogoutButtonVisible(visible) {
    var btn = document.getElementById('logout-btn-top');
    if (btn) btn.style.display = visible ? '' : 'none';
    var mdbtn = document.getElementById('move-delete-toggle');
    if (mdbtn) mdbtn.style.display = visible ? "block" : "none";
  }

  // --- Grocery Logic ---
  let CATEGORIES = [
    'veggies',
    'grocery',
    'indian',
    'kmart_bigw_target',
    'pharmacy',
    'others'
  ];
  let CATEGORY_NAMES = {
    veggies: 'Veggies',
    grocery: 'Grocery',
    indian: 'India Store',
    kmart_bigw_target: 'Kmart/Big W/Target',
    pharmacy: 'Pharmacy',
    others: 'Others'
  };
  let CATEGORY_ICONS = {
    veggies: '🥦',
    grocery: '🛒',
    indian: '<img src="https://upload.wikimedia.org/wikipedia/en/4/41/Flag_of_India.svg" alt="India" style="height:1.3em;vertical-align:middle;margin-right:4px;">',
    kmart_bigw_target: '',
    pharmacy: '',
    others: ''
  };
  let CATEGORY_HEADER_CLASSES = {
    veggies: 'veggies-header',
    grocery: 'grocery-header',
    indian: 'indian-header',
    kmart_bigw_target: 'kmart_bigw_target-header',
    pharmacy: 'pharmacy-header',
    others: 'others-header'
  };
  const TABLE_COLOR_CLASSES = [
    "veggies-header", "grocery-header", "indian-header",
    "kmart_bigw_target-header", "pharmacy-header", "others-header", "default-header"
  ];
  function getHeaderClass(catKey, idx) {
    if (CATEGORY_HEADER_CLASSES[catKey]) return CATEGORY_HEADER_CLASSES[catKey];
    if (typeof idx === "number") {
      const paletteIdx = idx % TABLE_COLOR_CLASSES.length;
      return TABLE_COLOR_CLASSES[paletteIdx];
    }
    return "default-header";
  }

  let groceryData = {};
  let listeners = [];
  let checkZerosActive = false;
  let originalKeyOrder = {};

  // --- Main UI ---
  function showMain() {
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
  }

  function updateDateTime() {
    const now = new Date();
    document.getElementById('datetime').textContent =
      now.toLocaleString('en-AU', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
  setInterval(updateDateTime, 1000);
  updateDateTime();

  function subscribeAllLists() {
    listeners.forEach(fn => { try { fn(); } catch (e) { } });
    listeners = [];
    db.ref(`/groceryLists`).on('value', snap => {
      const data = snap.val() || {};
      groceryData = data;
      Object.entries(data).forEach(([cat, items]) => {
        originalKeyOrder[cat] = Object.keys(items || {});
      });
      let allKeys = Object.keys(data);
      let ordered = [];
      CATEGORIES.forEach(cat => { if (allKeys.includes(cat)) ordered.push(cat); });
      allKeys.forEach(cat => {
        if (!ordered.includes(cat)) ordered.push(cat);
      });
      CATEGORIES = ordered;
      renderAllTables();
    });
  }

  function showModal(title, callback) {
    const backdrop = document.getElementById('modal-backdrop');
    const titleEl = document.getElementById('modal-title');
    const btnNo = document.getElementById('modal-btn-no');
    const btnYes = document.getElementById('modal-btn-yes');
    titleEl.textContent = title;
    backdrop.classList.add('active');
    btnNo.focus();
    function cleanup() {
      backdrop.classList.remove('active');
      btnNo.onclick = null;
      btnYes.onclick = null;
    }
    btnNo.onclick = () => { cleanup(); callback(false); };
    btnYes.onclick = () => { cleanup(); callback(true); };
  }

  function showInputModal(title, placeholder, callback) {
    const backdrop = document.getElementById('input-modal-backdrop');
    const titleEl = document.getElementById('input-modal-title');
    const input = document.getElementById('input-modal-input');
    const btnCancel = document.getElementById('input-modal-btn-cancel');
    const btnOK = document.getElementById('input-modal-btn-ok');

    titleEl.textContent = title;
    input.value = '';
    input.placeholder = placeholder || '';
    backdrop.classList.add('active');
    setTimeout(() => { input.focus(); }, 50);

    function cleanup() {
      backdrop.classList.remove('active');
      btnCancel.onclick = null;
      btnOK.onclick = null;
      input.onkeydown = null;
    }

    btnCancel.onclick = () => { cleanup(); callback(false); };
    btnOK.onclick = () => {
      cleanup();
      callback(input.value.trim());
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") { btnOK.click(); }
      if (e.key === "Escape") { btnCancel.click(); }
    };
  }

  function showUndoToast(msg, onUndo, onExpire) {
    let toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = msg + '<button id="undo-btn">UNDO</button>';
    document.body.appendChild(toast);
    document.getElementById('undo-btn').onclick = function () {
      document.body.removeChild(toast);
      if (onUndo) onUndo();
    };
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
        if (onExpire) onExpire();
      }
    }, 3000);
  }

  function renderAllTables() {
    const area = document.getElementById('tables-area');
    area.innerHTML = '';
    CATEGORIES.forEach((cat, idx) => {
      if (!CATEGORY_NAMES[cat]) CATEGORY_NAMES[cat] = cat.charAt(0).toUpperCase() + cat.slice(1);
      if (!CATEGORY_ICONS[cat]) CATEGORY_ICONS[cat] = '';
      const container = document.createElement('div');
      container.className = 'container';
      container.id = `${cat}-container`;
      const headerClass = getHeaderClass(cat, idx);
      const header = document.createElement('div');
      header.className = 'header ' + headerClass;
      header.id = `${cat}-header`;
      header.onclick = () => toggleCollapse(cat);
      let headerPressTimer = null;
      header.addEventListener('touchstart', e => {
        headerPressTimer = setTimeout(() => {
          showModal(`Delete "${CATEGORY_NAMES[cat]}" and all its items?`, (yes) => {
            if (yes) deleteTable(cat);
          });
        }, 2000);
      });
      header.addEventListener('touchend', e => { clearTimeout(headerPressTimer); });
      header.addEventListener('touchmove', e => { clearTimeout(headerPressTimer); });
      header.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        headerPressTimer = setTimeout(() => {
          showModal(`Delete "${CATEGORY_NAMES[cat]}" and all its items?`, (yes) => {
            if (yes) deleteTable(cat);
          });
        }, 2000);
      });
      header.addEventListener('mouseup', e => { clearTimeout(headerPressTimer); });
      header.addEventListener('mouseleave', e => { clearTimeout(headerPressTimer); });

      const headerTitle = document.createElement('span');
      headerTitle.className = 'header-title';
      headerTitle.innerHTML = (CATEGORY_ICONS[cat] ? CATEGORY_ICONS[cat] + " " : "") + CATEGORY_NAMES[cat];

      const headerCount = document.createElement('span');
      headerCount.className = 'header-count';
      headerCount.id = `${cat}-count`;

      const headerArrow = document.createElement('span');
      headerArrow.className = 'collapse-arrow';
      headerArrow.id = `${cat}-arrow`;
      headerArrow.innerHTML = "&#9654;";

      header.appendChild(headerTitle);
      header.appendChild(headerCount);
      header.appendChild(headerArrow);

      container.appendChild(header);

      const ul = document.createElement('ul');
      ul.id = cat;
      container.appendChild(ul);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-table-btn'; // Now matches your CSS!
      addBtn.textContent = '＋';
      addBtn.onclick = (e)=>{
        e.stopPropagation();
        addItem(cat);
      };
      container.appendChild(addBtn);

      area.appendChild(container);

      if (localStorage.getItem('col-' + cat) === 'true') setCollapsed(cat, true);

      renderList(cat);
      updateHeaderCount(cat);
    });
  }
  function deleteTable(cat) {
    db.ref(`/groceryLists/${cat}`).remove();
    setTimeout(renderAllTables, 300);
  }
  function toggleCollapse(cat) {
    const ul = document.getElementById(cat);
    const addBtn = document.querySelector(`#${cat}-container .add-btn`);
    const container = document.getElementById(cat + '-container');
    let collapsed = ul.style.display !== 'none';
    setCollapsed(cat, collapsed);
    localStorage.setItem('col-' + cat, collapsed ? 'true' : '');
  }
  function setCollapsed(cat, collapsed) {
    const ul = document.getElementById(cat);
    const addBtn = document.querySelector(`#${cat}-container .add-btn`);
    const container = document.getElementById(cat + '-container');
    if (!ul || !addBtn || !container) return;
    ul.style.display = collapsed ? 'none' : '';
    addBtn.style.display = collapsed ? 'none' : '';
    container.classList.toggle('collapsed', collapsed);
  }

  function renderList(cat) {
    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = '';
    let items = groceryData[cat] || {};
    let keys = [];
    if (originalKeyOrder[cat]) {
      keys = originalKeyOrder[cat].slice();
    } else {
      keys = Object.keys(items);
    }

    if (checkZerosActive && originalKeyOrder[cat]) {
      const origOrder = originalKeyOrder[cat].slice();
      keys.sort((a, b) => {
        const ia = items[a]?.count > 0 ? 0 : 1;
        const ib = items[b]?.count > 0 ? 0 : 1;
        if (ia !== ib) return ia - ib;
        return origOrder.indexOf(a) - origOrder.indexOf(b);
      });
    } else if (originalKeyOrder[cat]) {
      keys = originalKeyOrder[cat].slice();
    }

    keys.forEach((key) => {
      const item = items[key];
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
      const li = document.createElement('li');
      li.dataset.key = key;
      if (item.checked) li.classList.add('checked');
      if (item.count > 0) li.classList.add('has-count');
      li.style.position = 'relative';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!item.checked;
      cb.onchange = () => toggleChecked(cat, key, cb.checked);
      li.appendChild(cb);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;
      name.ondblclick = (e) => {
        e.stopPropagation();
        editNameInline(cat, key, name, item);
      };
      li.appendChild(name);

      if (!moveDeleteMode) {
        const cnt = document.createElement('div');
        cnt.className = 'counter';
        const minus = document.createElement('button');
        minus.textContent = '-';
        minus.onclick = (e) => {
          e.stopPropagation();
          updateCount(cat, key, -1);
        };
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = item.count || 0;
        const plus = document.createElement('button');
        plus.textContent = '+';
        plus.onclick = (e) => {
          e.stopPropagation();
          updateCount(cat, key, +1);
        };
        cnt.appendChild(minus);
        cnt.appendChild(count);
        cnt.appendChild(plus);
        li.appendChild(cnt);
      } else {
        const trash = document.createElement('button');
        trash.className = 'trash-icon';
        trash.title = 'Delete (with undo)';
        trash.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="#e53935" stroke-width="2" d="M5 7h14M10 11v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12m-9-2h4a2 2 0 0 1 2 2v0H7v0a2 2 0 0 1 2-2z"/>
          </svg>`;
        trash.onclick = () => {
          let idx = keys.indexOf(key);
          let backupItem = { ...item };
          deletedRowBackup = { cat, key, item: backupItem, idx };
          li.style.display = 'none';
          deletedRowTimer = setTimeout(() => {
            db.ref(`/groceryLists/${cat}/${key}`).remove();
            deletedRowBackup = null;
            deletedRowTimer = null;
          }, 3000);
          showUndoToast(
            'Item deleted.',
            () => {
              if (deletedRowTimer) clearTimeout(deletedRowTimer);
              db.ref(`/groceryLists/${cat}/${key}`).set(backupItem);
              deletedRowBackup = null;
              deletedRowTimer = null;
              renderList(cat);
            },
            () => { }
          );
        };
        li.appendChild(trash);

        const move = document.createElement('button');
        move.className = 'move-icon';
        move.title = 'Drag to reorder';
        move.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" fill="none"/>
            <rect x="5" y="7" width="14" height="2" rx="1" fill="#666"/>
            <rect x="5" y="11" width="14" height="2" rx="1" fill="#666"/>
            <rect x="5" y="15" width="14" height="2" rx="1" fill="#666"/>
          </svg>`;
        li.appendChild(move);
      }
      ul.appendChild(li);
    });

    // Enable SortableJS drag-and-drop only in move/delete mode
    if (moveDeleteMode) {
      if (!ul.sortableInstance) {
        ul.sortableInstance = Sortable.create(ul, {
          animation: 180,
          handle: '.move-icon',
          ghostClass: 'dragging',
          onEnd: function (evt) {
            let newOrder = [];
            ul.querySelectorAll('li').forEach(li => {
              if (li.dataset.key) newOrder.push(li.dataset.key);
            });
            originalKeyOrder[cat] = newOrder;
            renderList(cat);
          }
        });
      }
    } else {
      if (ul.sortableInstance) {
        ul.sortableInstance.destroy();
        ul.sortableInstance = null;
      }
    }
  }

  function deleteRow(cat, key) {
    db.ref(`/groceryLists/${cat}/${key}`).remove();
    setTimeout(() => renderList(cat), 300);
  }

  function addItem(cat) {
    showInputModal('Enter new item name:', 'e.g. Carrots', function (name) {
      if (!name) return;
      db.ref(`/groceryLists/${cat}`).push({ name: name, count: 0, checked: false });
      // The Firebase listener will pick up the change and update the UI.
    });
  }
  function addNewTablePrompt() {
    showInputModal('Enter table name (e.g. Pharmacy):', 'e.g. Pharmacy', function (tname) {
      if (!tname) return;
      tname = tname.trim();
      let catKey = tname.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!catKey) catKey = 'custom_' + Date.now();
      if (CATEGORIES.includes(catKey)) {
        alert('Table already exists!');
        return;
      }
      let items = {};
      showInputModal('Add an item to this table now? (Optional)', 'First item name', function (itemName) {
        if (itemName && itemName.trim()) {
          items = { [db.ref().push().key]: { name: itemName.trim(), count: 0, checked: false } };
        }
        CATEGORY_NAMES[catKey] = tname;
        CATEGORY_ICONS[catKey] = '';
        const idx = CATEGORIES.length;
        CATEGORY_HEADER_CLASSES[catKey] = getHeaderClass(catKey, idx);
        db.ref(`/groceryLists/${catKey}`).set(items);
      });
    });
  }

  function updateCount(cat, key, delta) {
    const item = groceryData[cat][key];
    if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
    let v = (item.count || 0) + delta;
    v = Math.max(0, Math.min(50, v));
    db.ref(`/groceryLists/${cat}/${key}`).update({ count: v });
  }
  function toggleChecked(cat, key, val) {
    db.ref(`/groceryLists/${cat}/${key}`).update({ checked: !!val });
  }
  function editNameInline(cat, key, nameDiv, oldItem) {
    if (nameDiv.classList.contains('editing')) return;
    const prevName = oldItem.name;
    nameDiv.classList.add('editing');
    nameDiv.setAttribute('contenteditable', 'true');
    nameDiv.setAttribute('spellcheck', 'false');
    nameDiv.style.userSelect = "text";
    nameDiv.focus();
    // Set caret at end:
    if (window.getSelection && document.createRange) {
      const range = document.createRange();
      range.selectNodeContents(nameDiv);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    let finished = false;
    function finishEdit() {
      if (finished) return;
      finished = true;
      nameDiv.classList.remove('editing');
      nameDiv.removeAttribute('contenteditable');
      nameDiv.style.userSelect = "";
      const newValue = nameDiv.textContent.trim();
      if (!newValue) {
        db.ref(`/groceryLists/${cat}/${key}`).update({ name: prevName });
        nameDiv.textContent = prevName;
      } else if (newValue !== prevName) {
        db.ref(`/groceryLists/${cat}/${key}`).update({ name: newValue });
      }
    }
    nameDiv.onkeydown = function (e) {
      if (e.key === "Enter") { e.preventDefault(); finishEdit(); }
      if (e.key === "Escape") { nameDiv.textContent = prevName; finishEdit(); }
    };
    nameDiv.onblur = finishEdit;
  }

  document.getElementById('static-reset-btn').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;
      checkZerosActive = false;
      CATEGORIES.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.entries(items).forEach(([key, item]) => {
          db.ref(`/groceryLists/${cat}/${key}`).update({ count: 0, checked: false });
        });
      });
      setTimeout(() => {
        renderAllTables();
      }, 350);
    });
  };

  document.getElementById('check-zeros-btn').onclick = function () {
    showModal("Do you want to check all 'zero' items (highlight items to buy)?", function (yes) {
      if (!yes) return;
      checkZerosActive = true;
      CATEGORIES.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.entries(items).forEach(([key, item]) => {
          if (item.count == 0 && !item.checked) {
            db.ref(`/groceryLists/${cat}/${key}`).update({ checked: true });
          }
        });
      });
      setTimeout(() => {
        renderAllTables();
      }, 350);
    });
  };

  function updateHeaderCount(cat) {
    const items = groceryData[cat] || {};
    const count = Object.values(items).filter(x => x && typeof x === "object" && !x.checked && x.count > 0).length;
    const el = document.getElementById(cat + '-count');
    if (!el) return;
    if (count > 0) {
      el.textContent = count;
      el.className = 'header-count';
    } else {
      el.innerHTML = '<span class="header-check">&#10003;</span>';
      el.className = '';
    }
  }

  // --- Move/Delete Toggle Button ---
  document.getElementById('move-delete-toggle').onclick = function () {
    moveDeleteMode = !moveDeleteMode;
    this.textContent = moveDeleteMode ? 'Done' : 'Move or Delete';
    renderAllTables();
  };

  // --- Auth State ---
  auth.onAuthStateChanged(user => {
    if (user && (!ALLOWED_USERS.length || ALLOWED_USERS.includes(user.email))) {
      showMain();
      subscribeAllLists();
    } else {
      document.getElementById('main-section').style.display = 'none';
      document.getElementById('login-bg').style.display = '';
      setLogoutButtonVisible(false);
    }
  });

}); // END DOMContentLoaded