// --- AUTH & DOM READY ---
document.addEventListener("DOMContentLoaded", function () {
  // --- Allowed Users & Avatars ---
  const ALLOWED_USERS = [
    "sunil.kumar101@gmail.com",
    "manju4sun@gmail.com",
    "yashvi.k.australia@gmail.com",
    "rupesh.chand.ggn@gmail.com"
  ];
  const FAMILY_EMAILS = [
    "sunil.kumar101@gmail.com",
    "manju4sun@gmail.com",
    "yashvi.k.australia@gmail.com"
  ];
  const USER_AVATARS = {
    "sunil.kumar101@gmail.com": "https://www.gravatar.com/avatar/9c6e6f2c4eae64c1e11c6f9d952a8a33?d=identicon",
    "manju4sun@gmail.com": "https://www.gravatar.com/avatar/6fa6e4ea6e7a5c3f4aec7f4bba50f1a4?d=identicon",
    "yashvi.k.australia@gmail.com": "https://www.gravatar.com/avatar/cfe5c6e9c1e7a9b7ed7b3e1b3d5f2c2d?d=identicon",
    "rupesh.chand.ggn@gmail.com": "https://www.gravatar.com/avatar/cfe5c6e9c1e7a9b7ed7b3e1b3d5f2c2d?d=identicon"
  };

  let selectedEmail = null;
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

  // --- DB Key Utilities ---
  function emailToKey(email) {
    return email.replace(/\./g, '_dot_').replace(/@/g, '_at_');
  }
  function getUserListKey(user) {
    if (FAMILY_EMAILS.includes(user.email)) {
      return "family";
    }
    return emailToKey(user.email);
  }

  // --- Auth Logic ---
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
        // No need to call showMain/subscribeAllLists here; handled in onAuthStateChanged
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
    if (mdbtn) mdbtn.style.display = visible ? "" : "none";
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
  window.groceryData = groceryData;
  let listeners = [];
  let moveDeleteMode = false;
  let deletedRowBackup = null;
  let deletedRowTimer = null;
  let originalKeyOrder = {};
  let originalOrderBackup = {};

  // --- Main UI ---
  function showMain() {
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
  }

  // --- Date & Time ---
  function updateDateTime() {
    const now = new Date();
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    let formatted = now.toLocaleString('en-AU', options).replace(',', '').replace(',', '');
    formatted = formatted.replace(/(\d{4})/, '$1 ·');
    document.getElementById('datetime').textContent = formatted;
  }
  setInterval(updateDateTime, 1000);
  updateDateTime();

  // --- Subscribe to User's Lists ---
  let USER_LIST_KEY = null;
  function subscribeAllLists() {
    listeners.forEach(fn => { try { fn(); } catch (e) { } });
    listeners = [];
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists`).on('value', snap => {
      const data = snap.val() || {};
      groceryData = data;
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

  // --- Modal Helpers ---
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

  // --- Render Grocery Tables ---
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

      // --- Editable Table Header Title ---
      const headerTitle = document.createElement('span');
      headerTitle.className = 'header-title';
      headerTitle.innerHTML = (CATEGORY_ICONS[cat] ? CATEGORY_ICONS[cat] + " " : "") + CATEGORY_NAMES[cat];
      headerTitle.style.cursor = "pointer";
      headerTitle.ondblclick = function (e) {
        e.stopPropagation();
        editTableHeaderInline(cat, headerTitle);
      };

      // --- Collapse on header background click only ---
      header.onclick = function (e) {
        // Only collapse if click is NOT on headerTitle or any icon/button
        if (
          e.target === header ||
          e.target.classList.contains('header') ||
          e.target.classList.contains('header-count') ||
          e.target.classList.contains('collapse-arrow')
        ) {
          toggleCollapse(cat);
        }
      };

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
      addBtn.className = 'add-table-btn';
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
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
    setTimeout(renderAllTables, 300);
  }
  function toggleCollapse(cat) {
    const ul = document.getElementById(cat);
    const addBtn = document.querySelector(`#${cat}-container .add-table-btn`);
    const container = document.getElementById(cat + '-container');
    let collapsed = ul.style.display !== 'none';
    setCollapsed(cat, collapsed);
    localStorage.setItem('col-' + cat, collapsed ? 'true' : '');
  }
  function setCollapsed(cat, collapsed) {
    const ul = document.getElementById(cat);
    const addBtn = document.querySelector(`#${cat}-container .add-table-btn`);
    const container = document.getElementById(cat + '-container');
    if (!ul || !addBtn || !container) return;
    ul.style.display = collapsed ? 'none' : '';
    addBtn.style.display = collapsed ? 'none' : '';
    container.classList.toggle('collapsed', collapsed);
  }

  // --- Render List ---
  function renderList(cat) {
    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = '';
    let items = groceryData[cat] || {};
    let keys = [];

    if (moveDeleteMode && originalKeyOrder[cat]) {
      keys = originalKeyOrder[cat].slice();
    } else if (Array.isArray(items.order)) {
      keys = items.order.filter(key => typeof items[key] === 'object');
      const extra = Object.keys(items).filter(k => k !== "order" && !items.order.includes(k));
      keys = keys.concat(extra);
    } else {
      keys = Object.keys(items).filter(k => k !== "order");
    }

    // Clear in-memory order when not in move/delete mode (so UI always matches DB order)
    if (!moveDeleteMode) delete originalKeyOrder[cat];

    keys.forEach((key) => {
      const item = items[key];
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
      const li = document.createElement('li');
      li.dataset.key = key;
      li.style.position = 'relative';
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.paddingLeft = '0';
      li.style.paddingRight = '0';
      li.style.paddingTop = '7px';
      li.style.paddingBottom = '7px';
      li.style.fontSize = '1.08rem';

      // Checked: gray background and strikethrough, else highlight if count > 0
      if (item.checked) {
        li.style.background = '#f1f1f1';
        li.style.color = '#444';
      } else if (item.count > 0) {
        li.style.background = '#FFF8D6';
        li.style.color = '#b26a00';
      } else {
        li.style.background = '#fff';
        li.style.color = '';
      }

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!item.checked;
      cb.onchange = () => toggleChecked(cat, key, cb.checked);
      cb.style.margin = '0 1px 0 9px';
      cb.style.flex = '0 0 auto';
      cb.style.width = '20px';
      cb.style.height = '20px';
      li.appendChild(cb);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;
      name.style.flex = '1 1 auto';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      name.style.margin = '0 2px';
      name.style.textDecoration = item.checked ? 'line-through' : 'none';
      name.style.opacity = item.checked ? '0.77' : '1';

      // Always allow double click to edit item name (use prompt)
      name.ondblclick = function (e) {
        e.stopPropagation();
        editNameInline(cat, key, name, item);
      };

      li.appendChild(name);

      if (!moveDeleteMode) {
        const cnt = document.createElement('div');
        cnt.className = 'counter';
        cnt.style.display = 'inline-flex';
        cnt.style.alignItems = 'center';
        cnt.style.gap = '2px';
        cnt.style.background = 'none';
        cnt.style.boxShadow = 'none';
        cnt.style.border = 'none';
        cnt.style.marginLeft = 'auto';
        cnt.style.marginRight = '0';
        cnt.style.position = 'static';

        // If checked, cross out the entire counter (plus, minus, count)
        const counterTextDecoration = item.checked ? 'line-through' : 'none';
        const counterOpacity = item.checked ? '0.77' : '1';

        const minus = document.createElement('button');
        minus.textContent = '-';
        minus.style.fontSize = '0.95em';
        minus.style.width = '1.4em';
        minus.style.height = '1.4em';
        minus.style.lineHeight = '1.2em';
        minus.style.padding = '0';
        minus.style.background = 'none';
        minus.style.border = '1px solid #222';
        minus.style.borderRadius = '4px';
        minus.style.margin = '0 2px 0 0';
        minus.style.cursor = 'pointer';
        minus.style.color = '#222';
        minus.style.textDecoration = counterTextDecoration;
        minus.style.opacity = counterOpacity;
        minus.onclick = (e) => {
          e.stopPropagation();
          updateCount(cat, key, -1);
        };

        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = item.count || 0;
        count.style.display = 'inline-block';
        count.style.minWidth = '1.2em';
        count.style.textAlign = 'center';
        count.style.fontSize = '1em';
        count.style.margin = '0 2px';
        count.style.background = 'none';
        count.style.boxShadow = 'none';
        count.style.border = 'none';
        count.style.textDecoration = counterTextDecoration;
        count.style.opacity = counterOpacity;

        const plus = document.createElement('button');
        plus.textContent = '+';
        plus.style.fontSize = '0.95em';
        plus.style.width = '1.4em';
        plus.style.height = '1.4em';
        plus.style.lineHeight = '1.2em';
        plus.style.padding = '0';
        plus.style.background = 'none';
        plus.style.border = '1px solid #222';
        plus.style.borderRadius = '4px';
        plus.style.margin = '0 0 0 2px';
        plus.style.cursor = 'pointer';
        plus.style.color = '#222';
        plus.style.textDecoration = counterTextDecoration;
        plus.style.opacity = counterOpacity;
        plus.onclick = (e) => {
          e.stopPropagation();
          updateCount(cat, key, +1);
        };

        cnt.appendChild(minus);
        cnt.appendChild(count);
        cnt.appendChild(plus);
        li.appendChild(cnt);
      } else {
        // Trash icon (bigger for touch)
        const trash = document.createElement('button');
        trash.className = 'trash-icon';
        trash.title = 'Delete (with undo)';
        trash.style.width = '38px';
        trash.style.height = '38px';
        trash.style.display = 'flex';
        trash.style.alignItems = 'center';
        trash.style.justifyContent = 'center';
        trash.style.background = 'none';
        trash.style.border = 'none';
        trash.style.marginLeft = '4px';
        trash.style.cursor = 'pointer';
        trash.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28" width="28" height="28">
            <path stroke="#e53935" stroke-width="2.2" d="M6 8h16M12 12v7m4-7v7M6 8l1.2 13a2.2 2.2 0 0 0 2.2 2h8.4a2.2 2.2 0 0 0 2.2-2L22 8m-10-3h4a2 2 0 0 1 2 2v0H10v0a2 2 0 0 1 2-2z"/>
          </svg>`;
        trash.onclick = () => {
          let idx = keys.indexOf(key);
          let backupItem = { ...item };
          deletedRowBackup = { cat, key, item: backupItem, idx };
          li.style.display = 'none';
          deletedRowTimer = setTimeout(() => {
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
            deletedRowBackup = null;
            deletedRowTimer = null;
          }, 3000);
          showUndoToast(
            'Item deleted.',
            () => {
              if (deletedRowTimer) clearTimeout(deletedRowTimer);
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).set(backupItem);
              deletedRowBackup = null;
              deletedRowTimer = null;
              renderList(cat);
            },
            () => { }
          );
        };
        li.appendChild(trash);

        // Move icon (bigger for touch)
        const move = document.createElement('button');
        move.className = 'move-icon';
        move.title = 'Drag to reorder';
        move.style.width = '38px';
        move.style.height = '38px';
        move.style.display = 'flex';
        move.style.alignItems = 'center';
        move.style.justifyContent = 'center';
        move.style.background = 'none';
        move.style.border = 'none';
        move.style.marginLeft = '4px';
        move.style.cursor = 'grab';
        move.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
            <rect width="28" height="28" fill="none"/>
            <rect x="7" y="9" width="14" height="2.8" rx="1.2" fill="#666"/>
            <rect x="7" y="13" width="14" height="2.8" rx="1.2" fill="#666"/>
            <rect x="7" y="17" width="14" height="2.8" rx="1.2" fill="#666"/>
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
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
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
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
    setTimeout(() => renderList(cat), 300);
  }

  function repairAllOrders() {
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists`).once('value').then(snap => {
      const lists = snap.val() || {};
      Object.keys(lists).forEach(cat => {
        const items = lists[cat];
        if (!items) return;
        let itemKeys = Object.keys(items).filter(k => k !== 'order');
        let order = Array.isArray(items.order) ? items.order.filter(k => itemKeys.includes(k)) : [];
        itemKeys.forEach(k => { if (!order.includes(k)) order.push(k); });
        if (!Array.isArray(items.order) || order.length !== itemKeys.length ||
            JSON.stringify(order) !== JSON.stringify(items.order)) {
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(order);
        }
      });
    });
  }

  function addItem(cat) {
    showInputModal('Enter new item name:', 'e.g. Carrots', function(name) {
      if (!name) return;
      const itemsRef = db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`);
      itemsRef.once('value').then(snap => {
        const items = snap.val() || {};
        let maxIdx = 0;
        Object.keys(items).forEach(key => {
          const match = key.match(/^item(\d+)$/);
          if (match) {
            maxIdx = Math.max(maxIdx, parseInt(match[1], 10));
          }
        });
        const newKey = `item${maxIdx + 1}`;
        const newItem = { name: name, count: 0, checked: false, createdAt: Date.now() };
        itemsRef.child(newKey).set(newItem).then(() => {
          const orderRef = db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`);
          orderRef.once('value').then(orderSnap => {
            let order = orderSnap.val();
            if (!Array.isArray(order)) {
              itemsRef.once('value').then(snap2 => {
                const allKeys = Object.keys(snap2.val()).filter(k => k !== "order");
                orderRef.set(allKeys);
              });
            } else {
              order.push(newKey);
              orderRef.set(order);
            }
          });
        });
      });
    });
  }

  function fixOrderByCreatedAt(cat, updateLocal = false) {
    const items = groceryData[cat];
    if (!items) return;
    let arr = [];
    Object.entries(items).forEach(([k, v]) => {
      if (k !== "order" && v && typeof v === "object" && typeof v.createdAt === "number") {
        arr.push({ key: k, createdAt: v.createdAt });
      }
    });
    arr.sort((a, b) => a.createdAt - b.createdAt);
    const newOrder = arr.map(x => x.key);

    const dbOrder = Array.isArray(items.order) ? items.order.filter(k => newOrder.includes(k)) : [];
    if (JSON.stringify(dbOrder) !== JSON.stringify(newOrder)) {
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
      if (updateLocal) {
        groceryData[cat].order = newOrder;
        renderList(cat);
      }
    } else if (updateLocal && JSON.stringify(groceryData[cat].order) !== JSON.stringify(newOrder)) {
      groceryData[cat].order = newOrder;
      renderList(cat);
    }
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
          items = { item1: { name: itemName.trim(), count: 0, checked: false, createdAt: Date.now() } };
        }
        CATEGORY_NAMES[catKey] = tname;
        CATEGORY_ICONS[catKey] = '';
        const idx = CATEGORIES.length;
        CATEGORY_HEADER_CLASSES[catKey] = getHeaderClass(catKey, idx);

        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}`).set(items).then(() => {
          if (itemName && itemName.trim()) {
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}/order`).set(["item1"]);
          }
        });
      });
    });
  }
  document.getElementById('add-table-btn-main').onclick = addNewTablePrompt;

  function updateCount(cat, key, delta) {
    const item = groceryData[cat][key];
    if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
    let v = (item.count || 0) + delta;
    v = Math.max(0, Math.min(50, v));
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: v });
  }
  function toggleChecked(cat, key, val) {
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked: !!val });
  }
  function editTableHeaderInline(cat, headerTitleEl) {
    if (headerTitleEl.classList.contains('editing')) return;
    const prev = CATEGORY_NAMES[cat];
    // Use prompt for editing (always works)
    const newValue = prompt('Edit table name:', prev);
    if (newValue === null) return; // Cancelled
    const trimmed = newValue.trim();
    if (trimmed && trimmed !== prev) {
      CATEGORY_NAMES[cat] = trimmed;
      renderAllTables();
    }
  }

  // --- Inline Edit Item Name ---
  function editNameInline(cat, key, nameDiv, oldItem) {
    // Use prompt for editing (always works)
    const prevName = oldItem.name;
    const newValue = prompt('Edit item name:', prevName);
    if (newValue === null) return; // Cancelled
    const trimmed = newValue.trim();
    if (!trimmed) {
      // Don't allow empty name, keep previous
      return;
    }
    if (trimmed !== prevName) {
      // Update in DB
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ name: trimmed });
      // Update UI immediately for better feedback
      nameDiv.textContent = trimmed;
    }
  }

  document.getElementById('static-reset-btn').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;

      // Only update items, do NOT remove any tables
      CATEGORIES.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.entries(items).forEach(([key, item]) => {
          // Only update items, skip "order" property
          if (key !== "order") {
            // Use setTimeout to batch updates and avoid UI freeze
            setTimeout(() => {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: 0, checked: false });
            }, 0);
          }
        });

        // Restore original order if backup exists
        if (originalOrderBackup[cat]) {
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(originalOrderBackup[cat]);
          delete originalOrderBackup[cat];
        }
        // Restore markZerosOrderBackup if used
        if (typeof markZerosOrderBackup !== "undefined" && markZerosOrderBackup[cat]) {
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(markZerosOrderBackup[cat]);
          delete markZerosOrderBackup[cat];
        }
      });

      // Delay renderAllTables to allow batched updates to process
      setTimeout(() => {
        renderAllTables();
      }, 100);
    });
  };

  document.getElementById('check-zeros-btn').onclick = function () {
    showModal("Do you want to check all 'zero' items (highlight items to buy)?", function (yes) {
      if (!yes) return;

      CATEGORIES.forEach(cat => {
        const items = groceryData[cat] || {};
        const keys = Object.keys(items).filter(k => k !== "order");

        if (!originalOrderBackup[cat] && Array.isArray(items.order)) {
          originalOrderBackup[cat] = items.order.slice();
        }

        const aboveZero = [];
        const zero = [];

        keys.forEach(key => {
          const item = items[key];
          if (!item) return;
          if ((item.count || 0) > 0) {
            aboveZero.push(key);
          } else {
            zero.push(key);
            // Use setTimeout to batch updates and avoid UI freeze
            setTimeout(() => {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked: true });
            }, 0);
          }
        });

        const newOrder = aboveZero.concat(zero);
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
      });

      // Delay renderAllTables to allow batched updates to process
      setTimeout(() => {
        renderAllTables();
      }, 100);
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

  document.getElementById('move-delete-toggle').onclick = function () {
    moveDeleteMode = !moveDeleteMode;
    this.textContent = moveDeleteMode ? 'Done' : 'Move or Delete';
    renderAllTables();
  };

  // Auth State
  auth.onAuthStateChanged(user => {
    if (user && (!ALLOWED_USERS.length || ALLOWED_USERS.includes(user.email))) {
      USER_LIST_KEY = getUserListKey(user);
      showMain();
      showLoggedInEmail(user.email);
      repairAllOrders();
      subscribeAllLists();
    } else {
      document.getElementById('main-section').style.display = 'none';
      document.getElementById('login-bg').style.display = '';
      setLogoutButtonVisible(false);
      showLoggedInEmail('');
    }
  });

  document.getElementById('collapse-all-btn').onclick = function() {
    CATEGORIES.forEach(function(cat) {
      setCollapsed(cat, true);
      localStorage.setItem('col-' + cat, 'true');
    });
  };

  function showLoggedInEmail(email) {
    const label = document.getElementById('user-email-label');
    if (label) {
      label.textContent = email;
      label.style.display = email ? '' : 'none';
    }
  }
});

// --- Inline Edit Table Header ---
function editTableHeaderInline(cat, headerTitleEl) {
  if (headerTitleEl.classList.contains('editing')) return;
  const prev = CATEGORY_NAMES[cat];
  // Use prompt for editing (always works)
  const newValue = prompt('Edit table name:', prev);
  if (newValue === null) return; // Cancelled
  const trimmed = newValue.trim();
  if (trimmed && trimmed !== prev) {
    CATEGORY_NAMES[cat] = trimmed;
    renderAllTables();
  }
}

// --- Render Grocery Tables (patch for double click) ---
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

    // --- Editable Table Header Title ---
    const headerTitle = document.createElement('span');
    headerTitle.className = 'header-title';
    headerTitle.innerHTML = (CATEGORY_ICONS[cat] ? CATEGORY_ICONS[cat] + " " : "") + CATEGORY_NAMES[cat];
    headerTitle.style.cursor = "pointer";
    headerTitle.ondblclick = function (e) {
      e.stopPropagation();
      editTableHeaderInline(cat, headerTitle);
    };

    // --- Collapse on header background click only ---
    header.onclick = function (e) {
      // Only collapse if click is NOT on headerTitle or any icon/button
      if (
        e.target === header ||
        e.target.classList.contains('header') ||
        e.target.classList.contains('header-count') ||
        e.target.classList.contains('collapse-arrow')
      ) {
        toggleCollapse(cat);
      }
    };

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
    addBtn.className = 'add-table-btn';
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

// --- Render List (patch for double click) ---
function renderList(cat) {
  const ul = document.getElementById(cat);
  if (!ul) return;
  ul.innerHTML = '';
  let items = groceryData[cat] || {};
  let keys = [];

  if (moveDeleteMode && originalKeyOrder[cat]) {
    keys = originalKeyOrder[cat].slice();
  } else if (Array.isArray(items.order)) {
    keys = items.order.filter(key => typeof items[key] === 'object');
    const extra = Object.keys(items).filter(k => k !== "order" && !items.order.includes(k));
    keys = keys.concat(extra);
  } else {
    keys = Object.keys(items).filter(k => k !== "order");
  }

  // Clear in-memory order when not in move/delete mode (so UI always matches DB order)
  if (!moveDeleteMode) delete originalKeyOrder[cat];

  keys.forEach((key) => {
    const item = items[key];
    if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
    const li = document.createElement('li');
    li.dataset.key = key;
    li.style.position = 'relative';
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.paddingLeft = '0';
    li.style.paddingRight = '0';
    li.style.paddingTop = '7px';
    li.style.paddingBottom = '7px';
    li.style.fontSize = '1.08rem';

    // Checked: gray background and strikethrough, else highlight if count > 0
    if (item.checked) {
      li.style.background = '#f1f1f1';
      li.style.color = '#444';
    } else if (item.count > 0) {
      li.style.background = '#FFF8D6';
      li.style.color = '#b26a00';
    } else {
      li.style.background = '#fff';
      li.style.color = '';
    }

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.checked;
    cb.onchange = () => toggleChecked(cat, key, cb.checked);
    cb.style.margin = '0 1px 0 9px';
    cb.style.flex = '0 0 auto';
    cb.style.width = '20px';
    cb.style.height = '20px';
    li.appendChild(cb);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    name.style.flex = '1 1 auto';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';
    name.style.margin = '0 2px';
    name.style.textDecoration = item.checked ? 'line-through' : 'none';
    name.style.opacity = item.checked ? '0.77' : '1';

    // Always allow double click to edit item name (use prompt)
    name.ondblclick = function (e) {
      e.stopPropagation();
      editNameInline(cat, key, name, item);
    };

    li.appendChild(name);

    if (!moveDeleteMode) {
      const cnt = document.createElement('div');
      cnt.className = 'counter';
      cnt.style.display = 'inline-flex';
      cnt.style.alignItems = 'center';
      cnt.style.gap = '2px';
      cnt.style.background = 'none';
      cnt.style.boxShadow = 'none';
      cnt.style.border = 'none';
      cnt.style.marginLeft = 'auto';
      cnt.style.marginRight = '0';
      cnt.style.position = 'static';

      // If checked, cross out the entire counter (plus, minus, count)
      const counterTextDecoration = item.checked ? 'line-through' : 'none';
      const counterOpacity = item.checked ? '0.77' : '1';

      const minus = document.createElement('button');
      minus.textContent = '-';
      minus.style.fontSize = '0.95em';
      minus.style.width = '1.4em';
      minus.style.height = '1.4em';
      minus.style.lineHeight = '1.2em';
      minus.style.padding = '0';
      minus.style.background = 'none';
      minus.style.border = '1px solid #222';
      minus.style.borderRadius = '4px';
      minus.style.margin = '0 2px 0 0';
      minus.style.cursor = 'pointer';
      minus.style.color = '#222';
      minus.style.textDecoration = counterTextDecoration;
      minus.style.opacity = counterOpacity;
      minus.onclick = (e) => {
        e.stopPropagation();
        updateCount(cat, key, -1);
      };

      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = item.count || 0;
      count.style.display = 'inline-block';
      count.style.minWidth = '1.2em';
      count.style.textAlign = 'center';
      count.style.fontSize = '1em';
      count.style.margin = '0 2px';
      count.style.background = 'none';
      count.style.boxShadow = 'none';
      count.style.border = 'none';
      count.style.textDecoration = counterTextDecoration;
      count.style.opacity = counterOpacity;

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.style.fontSize = '0.95em';
      plus.style.width = '1.4em';
      plus.style.height = '1.4em';
      plus.style.lineHeight = '1.2em';
      plus.style.padding = '0';
      plus.style.background = 'none';
      plus.style.border = '1px solid #222';
      plus.style.borderRadius = '4px';
      plus.style.margin = '0 0 0 2px';
      plus.style.cursor = 'pointer';
      plus.style.color = '#222';
      plus.style.textDecoration = counterTextDecoration;
      plus.style.opacity = counterOpacity;
      plus.onclick = (e) => {
        e.stopPropagation();
        updateCount(cat, key, +1);
      };

      cnt.appendChild(minus);
      cnt.appendChild(count);
      cnt.appendChild(plus);
      li.appendChild(cnt);
    } else {
      // Trash icon (bigger for touch)
      const trash = document.createElement('button');
      trash.className = 'trash-icon';
      trash.title = 'Delete (with undo)';
      trash.style.width = '38px';
      trash.style.height = '38px';
      trash.style.display = 'flex';
      trash.style.alignItems = 'center';
      trash.style.justifyContent = 'center';
      trash.style.background = 'none';
      trash.style.border = 'none';
      trash.style.marginLeft = '4px';
      trash.style.cursor = 'pointer';
      trash.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28" width="28" height="28">
          <path stroke="#e53935" stroke-width="2.2" d="M6 8h16M12 12v7m4-7v7M6 8l1.2 13a2.2 2.2 0 0 0 2.2 2h8.4a2.2 2.2 0 0 0 2.2-2L22 8m-10-3h4a2 2 0 0 1 2 2v0H10v0a2 2 0 0 1 2-2z"/>
        </svg>`;
      trash.onclick = () => {
        let idx = keys.indexOf(key);
        let backupItem = { ...item };
        deletedRowBackup = { cat, key, item: backupItem, idx };
        li.style.display = 'none';
        deletedRowTimer = setTimeout(() => {
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
          deletedRowBackup = null;
          deletedRowTimer = null;
        }, 3000);
        showUndoToast(
          'Item deleted.',
          () => {
            if (deletedRowTimer) clearTimeout(deletedRowTimer);
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).set(backupItem);
            deletedRowBackup = null;
            deletedRowTimer = null;
            renderList(cat);
          },
          () => { }
        );
      };
      li.appendChild(trash);

      // Move icon (bigger for touch)
      const move = document.createElement('button');
      move.className = 'move-icon';
      move.title = 'Drag to reorder';
      move.style.width = '38px';
      move.style.height = '38px';
      move.style.display = 'flex';
      move.style.alignItems = 'center';
      move.style.justifyContent = 'center';
      move.style.background = 'none';
      move.style.border = 'none';
      move.style.marginLeft = '4px';
      move.style.cursor = 'grab';
      move.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
          <rect width="28" height="28" fill="none"/>
          <rect x="7" y="9" width="14" height="2.8" rx="1.2" fill="#666"/>
          <rect x="7" y="13" width="14" height="2.8" rx="1.2" fill="#666"/>
          <rect x="7" y="17" width="14" height="2.8" rx="1.2" fill="#666"/>
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
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
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
