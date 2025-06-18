// --- AUTH & DOM READY ---
document.addEventListener("DOMContentLoaded", function () {
  // --- Ensure Firebase SDK is loaded ---
  if (typeof firebase === "undefined" || !firebase.app) {
    alert("Firebase SDK not loaded. Please check your internet connection and script includes.");
    return;
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

  // --- Globals for authorized users ---
  let AUTHORISED_USERS = {}; // { userKey: {email, family} }
  let EMAIL_TO_FAMILY = {};  // { email: family }
  let USER_FAMILY = null;
  let USER_EMAIL = null;
  let USER_LIST_KEY = null; // This will be set to the user's family
  let isLoggedIn = false; // Track login state

  // --- Utility: Normalize email for matching ---
  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  // --- Fetch Authorised Users from DB ---
  function fetchAuthorisedUsers(callback) {
    db.ref('/authorisedUsers').once('value')
      .then(snap => {
        const data = snap.val();
        AUTHORISED_USERS = data || {};
        EMAIL_TO_FAMILY = {};
        Object.values(AUTHORISED_USERS).forEach(user => {
          if (user && user.email && user.family) {
            EMAIL_TO_FAMILY[normalizeEmail(user.email)] = user.family;
          }
        });
        if (typeof callback === "function") callback();
      })
      .catch(error => {
        handleFirebaseError(error);
      });
  }

  // --- Show Main Section (before auth check) ---
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

  // --- Subscribe to Family Shopping List ---
  let shoppingListRef = null;
  function subscribeFamilyList(family) {
    if (shoppingListRef) shoppingListRef.off();
    shoppingListRef = db.ref(`/shoppingListsPerFamily/${family}`);
    shoppingListRef.on('value', snap => {
      const data = snap.val() || {};
      // --- Filter out pending deleted tables ---
      groceryData = {};
      tableNames = {};
      categories = [];
      let rawGroceryLists = data.groceryLists || {};
      let rawTableNames = data.tableNames || {};
      let rawTableOrder = Array.isArray(data.tableOrder) ? data.tableOrder : Object.keys(rawGroceryLists);

      Object.keys(rawGroceryLists).forEach(cat => {
        if (!pendingDeletedTables.has(cat)) {
          groceryData[cat] = { ...rawGroceryLists[cat] };
        }
      });
      Object.keys(rawTableNames).forEach(cat => {
        if (!pendingDeletedTables.has(cat)) {
          tableNames[cat] = rawTableNames[cat];
        }
      });
      categories = Object.keys(groceryData);
      tableOrder = rawTableOrder.filter(cat => !pendingDeletedTables.has(cat) && categories.includes(cat));

      renderAllTables();
    }, function(error) {
      if (isLoggedIn) handleFirebaseError(error);
    });
  }

  // --- Google Sign-In Logic ---
  let signInInProgress = false;
  function googleSignIn() {
    if (signInInProgress) return;
    signInInProgress = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    // --- Always prompt for account selection ---
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider)
      .then((result) => {
        signInInProgress = false;
        const user = result.user;
        handleUserLogin(user);
      })
      .catch((error) => {
        signInInProgress = false;
        if (error.code !== "auth/cancelled-popup-request") {
          showModal(`Failed to sign in: ${error.message}`, () => {});
        }
      });
  }
  document.getElementById('google-signin-btn').onclick = googleSignIn;

  // --- Handle User Login ---
  function handleUserLogin(user = null) {
    if (user) {
      USER_EMAIL = normalizeEmail(user.email);
      USER_FAMILY = EMAIL_TO_FAMILY[USER_EMAIL] || null;
      if (!USER_FAMILY) {
        showModal('Access denied. Please use an allowed Google account.', () => {});
        auth.signOut();
        return;
      }
      USER_LIST_KEY = USER_FAMILY;

      // --- Check if family shopping list exists, if not, copy template ---
      db.ref(`/shoppingListsPerFamily/${USER_FAMILY}`).once('value').then(snap => {
        if (!snap.exists()) {
          // Copy template for new family from publicTemplates
          const TEMPLATE_PATH = '/publicTemplates/shoppingListTemplate';
          db.ref(TEMPLATE_PATH).once('value').then(templateSnap => {
            const templateData = templateSnap.val();
            if (templateData) {
              // --- Optionally update tableNames to reflect the new family name ---
              const newTableNames = { ...(templateData.tableNames || {}) };
              // Example: If you want to add the family name as a prefix to each table
              Object.keys(newTableNames).forEach(key => {
                // You can customize this logic as needed
                // Example: newTableNames[key] = `${USER_FAMILY} - ${newTableNames[key]}`;
                // Or just leave as is if you don't want to change
              });
              const newData = {
                ...templateData,
                tableNames: newTableNames
              };
              db.ref(`/shoppingListsPerFamily/${USER_FAMILY}`).set(newData)
                .then(() => {
                  showMain();
                  showLoggedInEmail(user.email);
                  subscribeFamilyList(USER_FAMILY);
                })
                .catch((err) => {
                  showModal('Error creating your family shopping list: ' + err.message, () => {});
                });
            } else {
              // If template missing, just create an empty structure
              db.ref(`/shoppingListsPerFamily/${USER_FAMILY}`).set({
                groceryLists: {},
                tableNames: {},
                tableOrder: []
              }).then(() => {
                showMain();
                showLoggedInEmail(user.email);
                subscribeFamilyList(USER_FAMILY);
              });
            }
          });
        } else {
          // Family already exists, proceed as normal
          showMain();
          showLoggedInEmail(user.email);
          subscribeFamilyList(USER_FAMILY);
        }
      });
    } else {
      showLogin();
    }
  }

  // --- Auth State Change ---
  auth.onAuthStateChanged(user => {
    fetchAuthorisedUsers(() => {
      if (user) {
        handleUserLogin(user);
      } else {
        showLogin();
      }
    });
  });

  // --- Show main section and try to load lists before auth check ---
  showMain();
  fetchAuthorisedUsers(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      USER_EMAIL = normalizeEmail(currentUser.email);
      USER_FAMILY = EMAIL_TO_FAMILY[USER_EMAIL] || null;
      if (USER_FAMILY) {
        USER_LIST_KEY = USER_FAMILY;
        subscribeFamilyList(USER_FAMILY);
      }
    }
  });

  // --- Logout ---
  document.getElementById('logout-btn-top').onclick = function () {
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

  // Always hide modal on load
  document.getElementById('modal-backdrop').style.display = 'none';

  // --- Modal Helpers ---
  function showModal(title, callback) {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.style.display = 'flex';
    const titleEl = document.getElementById('modal-title');
    const btnNo = document.getElementById('modal-btn-no');
    const btnYes = document.getElementById('modal-btn-yes');

    // Info-only or warning modals: show only OK button
    if (
      typeof title === "string" &&
      (
        title.toLowerCase().includes("already exists") ||
        title.toLowerCase().includes("duplicate") ||
        title.toLowerCase().includes("added to family") ||
        title.toLowerCase().includes("failed to add user") ||
        title.toLowerCase().includes("are you sure you want to add user")
      )
    ) {
      titleEl.textContent = title;
      btnNo.style.display = 'none';
      btnYes.textContent = 'OK';
      // Define cleanup inside this scope
      function cleanup() {
        backdrop.classList.remove('active');
        backdrop.style.display = 'none';
        btnNo.onclick = null;
        btnYes.onclick = null;
        btnNo.style.display = '';
        btnYes.textContent = 'Yes';
        btnNo.textContent = 'No';
      }
      btnYes.onclick = () => {
        cleanup();
        if (callback) callback(true);
      };
      btnYes.focus();
      backdrop.classList.add('active');
      return;
    }

    // ...existing code for other modal types...
    // ...existing code...
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
    showInputModal('Add new item:', function(name) {
      if (!name) return;
      const trimmedName = name.trim().replace(/\s+/g, ' ');
      if (!trimmedName) return;

      // 1. Get current items
      const items = groceryData[cat] || {};
      const existingKeys = Object.keys(items)
        .filter(key => key !== 'order' && items[key] && typeof items[key] === 'object' && typeof items[key].name === 'string');
      const existingNames = existingKeys
        .map(key => items[key].name.trim().replace(/\s+/g, ' ').toLowerCase());
      if (existingNames.includes(trimmedName.toLowerCase())) {
        showModal(`Item "${trimmedName}" already exists in this table.`, () => {});
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
      renderList(cat);

      // 3. Add to DB in background (write to shoppingListsPerFamily, not userLists)
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${nextKey}`).set(item);
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
    });
  }
  window.addItem = addItem;

  // --- Globals ---
  let moveDeleteMode = false; // Ensure this is declared only once
  let originalKeyOrder = {};
  let groceryData = {};
  let tableNames = {};
  let categories = [];
  let updateCounterDebounce = {}; // { cat: timeoutId }

  // --- Track pending deletes to prevent UI re-appearance ---
  let pendingDeletedTables = new Set();
  let pendingDeletedItems = {}; // { cat: Set([key, ...]) }

  // --- Utility: Professional, readable header color from table name ---
  function stringToHeaderColor(str) {
    // Map some common table names to professional colors, fallback to blue
    const name = (str || '').toLowerCase();
    if (name.includes('veggie'))      return { bg: "#388e3c", fg: "#fff" };      // Green
    if (name.includes('indian'))      return { bg: "#8e24aa", fg: "#fff" };      // Purple
    if (name.includes('kmart') || name.includes('bigw') || name.includes('target'))
                                      return { bg: "#0288d1", fg: "#fff" };      // Blue
    if (name.includes('bunnings'))    return { bg: "#455a64", fg: "#fff" };      // Slate
    if (name.includes('office'))      return { bg: "#c62828", fg: "#fff" };      // Red
    if (name.includes('test'))        return { bg: "#6d4c41", fg: "#fff" };      // Brown
    // Add more mappings as needed
    return { bg: "#1976d2", fg: "#fff" }; // Default: strong blue
  }

  // --- Render Grocery Tables ---
  function renderAllTables() {
    const area = document.getElementById('tables-area');
    if (area.sortableInstance) {
      area.sortableInstance.destroy();
      area.sortableInstance = null;
    }
    while (area.firstChild) {
      area.removeChild(area.firstChild);
    }

    const order = Array.isArray(tableOrder) && tableOrder.length ? tableOrder : categories;
    order.forEach((cat, idx) => {
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

      header.innerHTML = `
        <span class="header-title" data-cat="${cat}">${headerName}</span>
        <span class="header-count" id="${cat}-count"></span>
        ${
          moveDeleteMode
            ? `
          <button class="table-delete-btn" onclick="deleteTable('${cat}')">
            <span class="table-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete table"></i>
            </span>
          </button>
          <span class="table-move-handle" title="Move table">
            <i class="fas fa-up-down-left-right" style="font-size:22px;color:#666;"></i>
          </span>
        `
            : ''
        }
        <span class="collapse-arrow">&#9654;</span>
      `;
      header.addEventListener('click', function (e) {
        if (
          e.target.classList.contains('header-title') ||
          e.target.closest('.header-title')
        ) return;
        toggleCollapse(cat);
      });
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

      // No need to set addBtn.style.display here, CSS will handle it
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
          // Write to shoppingListsPerFamily, not userLists
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).set(newName);
        }
        input.onblur = finishEdit;
        input.onkeydown = function (ev) {
          if (ev.key === 'Enter') { input.blur(); }
          if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
        };
      });
    });

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

  // --- Add New Table ---
  document.getElementById('add-table-btn-main').onclick = function () {
    if (!isLoggedIn) return;
    // Use custom modal for new table name
    showInputModal('New Store Name:', function(storeName) {
      if (!storeName) return;
      const trimmedStoreName = storeName.trim().replace(/\s+/g, ' ');
      if (!trimmedStoreName) return;
      const catKey = trimmedStoreName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      // Add new table to DB (shoppingListsPerFamily)
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}`).set({ order: [] });
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${catKey}`).set(trimmedStoreName);
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
      showInputModal('First item name:', function(itemName) {
        if (!itemName) return;
        const trimmedItemName = itemName.trim().replace(/\s+/g, ' ');
        if (!trimmedItemName) return;
        const nextKey = `item1`;
        const item = { name: trimmedItemName, count: 0, checked: false };
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}/${nextKey}`).set(item);
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${catKey}/order`).set([nextKey]);
      });
    });
  };

  // --- Collapse/Expand Tables ---
  function toggleCollapse(cat) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    let arrow = container ? container.querySelector('.collapse-arrow') : null;
    if (!arrow) arrow = document.getElementById(`${cat}-arrow`);
    // No need to set addBtn.style.display here, CSS will handle it
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

  // --- Render List ---
  function renderList(cat, forceCheckZerosSort = false) {
    // --- Skip rendering if table is pending deleted ---
    if (pendingDeletedTables.has(cat)) return;

    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = '';

    const items = groceryData[cat] || {};
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

    // --- Filter out pending deleted items ---
    const pendingSet = pendingDeletedItems[cat] || new Set();
    const validKeys = keys.filter(k => items[k] && typeof items[k].name === 'string' && !pendingSet.has(k));
    if (
      Array.isArray(items.order) &&
      (items.order.length !== validKeys.length ||
        items.order.some(k => !validKeys.includes(k)) ||
        validKeys.some(k => !items.order.includes(k)))
    ) {
      groceryData[cat].order = validKeys;
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(validKeys);
    }

    let displayOrder = keys.filter(k => !pendingSet.has(k));
    let doTempSort = forceCheckZerosSort || (window._checkZerosSortFlags && window._checkZerosSortFlags[cat]);
    if (doTempSort) {
      const toBuy = [];
      const zero = [];
      displayOrder.forEach(key => {
        const item = items[key];
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
        if ((item.count || 0) > 0) {
          toBuy.push(key);
        } else {
          zero.push(key);
        }
      });
      displayOrder = toBuy.concat(zero);
    }

    displayOrder.forEach(key => {
      const item = items[key];
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;

      const li = document.createElement('li');
      li.dataset.key = key;
      // Remove all inline style assignments for appearance
      // Use CSS classes for checked, to-buy, zero-count
      li.className = '';
      if (item.checked) {
        li.classList.add('checked');
      } else if (item.count > 0) {
        li.classList.add('to-buy');
      } else {
        li.classList.add('zero-count');
      }

      li.innerHTML = `
        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecked('${cat}', '${key}', this.checked)">
        <div class="name" title="Alt+Click to edit item name" data-cat="${cat}" data-key="${key}">${item.name}</div>
        ${moveDeleteMode ? `
          <button class="item-delete-btn" onclick="deleteItem('${cat}', '${key}')">
            <span class="item-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete item"></i>
            </span>
          </button>
          <span class="item-move-handle" title="Move item">
            <i class="fas fa-up-down-left-right" style="font-size:18px;color:#666;"></i>
          </span>
        ` : `
          <div class="counter">
            <button onclick="updateCount('${cat}', '${key}', -1)">-</button>
            <span class="count">${item.count || 0}</span>
            <button onclick="updateCount('${cat}', '${key}', 1)">+</button>
          </div>
        `}
      `;
      ul.appendChild(li);

      // --- Detect Hindi (Devanagari) and set lang/class for font ---
      const nameDiv = li.querySelector('.name');
      if (nameDiv) {
        if (/[\u0900-\u097F]/.test(item.name)) {
          nameDiv.setAttribute('lang', 'hi');
          nameDiv.classList.add('hindi-text');
        } else {
          nameDiv.removeAttribute('lang');
          nameDiv.classList.remove('hindi-text');
        }
      }
    });

    // --- Editable Item Name: Double-click to edit ---
    ul.querySelectorAll('.name').forEach(div => {
      div.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const cat = this.getAttribute('data-cat');
        const key = this.getAttribute('data-key');
        const oldName = groceryData[cat][key].name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'edit-item-input';
        // Remove all inline style assignments; use CSS only
        this.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
          let newName = input.value.trim();
          if (!newName) newName = oldName;
          groceryData[cat][key].name = newName;
          renderList(cat);
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}/name`).set(newName);
          // --- After editing, update Hindi font if needed ---
          setTimeout(() => {
            const ul = document.getElementById(cat);
            if (ul) {
              ul.querySelectorAll('.name').forEach(nameDiv => {
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
          if (ev.key === 'Enter') { input.blur(); }
          if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
        };
      });
    });

    if (moveDeleteMode) {
      if (!ul.sortableInstance) {
        ul.sortableInstance = Sortable.create(ul, {
          animation: 180,
          handle: '.item-move-handle',
          draggable: 'li',
          ghostClass: 'dragging',
          onEnd: function () {
            const newOrder = [];
            ul.querySelectorAll('li').forEach(li => {
              if (li.dataset.key) newOrder.push(li.dataset.key);
            });
            groceryData[cat].order = newOrder;
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
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
    updateHeaderCount(cat); // Update header count after rendering list
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

  // --- Update Count ---
  // Make updateCount globally accessible for inline onclick
  function updateCount(cat, key, delta) {
    const item = groceryData[cat]?.[key];
    if (!item || item.checked) return;

    let current = (item && typeof item.count === "number") ? item.count : 0;
    let newCount = current + delta;
    if (newCount < 0) newCount = 0;

    // Update local data instantly
    groceryData[cat][key].count = newCount;

    // --- Clear the sort flag if user manually changes a count ---
    if (window._checkZerosSortFlags && window._checkZerosSortFlags[cat]) {
      delete window._checkZerosSortFlags[cat];
    }

    renderList(cat);

    // --- Batch update all counters in this table after a short delay ---
    if (updateCounterDebounce[cat]) clearTimeout(updateCounterDebounce[cat]);
    updateCounterDebounce[cat] = setTimeout(() => {
      const updates = {};
      Object.keys(groceryData[cat] || {}).forEach(k => {
        if (k !== "order" && groceryData[cat][k] && typeof groceryData[cat][k].count === "number") {
          updates[`${k}/count`] = groceryData[cat][k].count;
        }
      });
      if (Object.keys(updates).length > 0) {
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).update(updates);
      }
      delete updateCounterDebounce[cat];
    }, 400);

    // No need to call updateHeaderCount(cat) here, as renderList already does it
  }
  window.updateCount = updateCount;

  // --- Delete Item ---
  function deleteItem(cat, key) {
    showModal('Delete this item?', function(yes) {
      if (!yes) return;

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

      function handleUndo(e) {
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
        undoBtn.addEventListener('touchend', function(e) {
          e.preventDefault();
          handleUndo();
        }, { passive: false });
        undoBtn.focus(); // Ensure button is focused for accessibility
      }

      undoTimeout = setTimeout(() => {
        if (!undone) {
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
          const cleanOrder = Array.isArray(groceryData[cat].order)
            ? groceryData[cat].order.filter(k => groceryData[cat][k])
            : [];
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(cleanOrder);
          if (undoToast.parentNode) document.body.removeChild(undoToast);
          // --- Remove from pending deletes after DB update ---
          if (pendingDeletedItems[cat]) pendingDeletedItems[cat].delete(key);
          subscribeAllLists();
        }
      }, 8000);
    });
  }
  window.deleteItem = deleteItem;

  // --- Delete Table ---
  function deleteTable(cat) {
    // Get table name and item count for confirmation
    const displayName = tableNames[cat] || cat;
    const itemsObj = groceryData[cat] || {};
    const itemKeys = Object.keys(itemsObj).filter(k => k !== "order" && itemsObj[k] && typeof itemsObj[k].name === "string");
    const itemCount = itemKeys.length;

    // Ask for confirmation before deleting, show table name and item count (no <b> tags)
    showModal(
      `Delete table "${displayName}" with ${itemCount} item${itemCount === 1 ? '' : 's'}?`,
      function(yes) {
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
        let undoTimeout = setTimeout(() => {
          if (!undone) {
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).remove();
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
              let orderArr = snap.val() || [];
              orderArr = orderArr.filter(k => k !== cat);
              db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(orderArr);
            });
            if (undoToast.parentNode) document.body.removeChild(undoToast);
            // --- Remove from pending deletes after DB update ---
            pendingDeletedTables.delete(cat);
          }
        }, 8000);

        const undoBtn = undoToast.querySelector('.undo-btn');
        if (undoBtn) {
          undoBtn.onclick = () => {
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
          };
          undoBtn.focus();
        }
      }
    );
  }
  window.deleteTable = deleteTable;

  // --- Reset All Button ---
  document.getElementById('reset-all').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;

      // Change button icon to a spinning refresh to indicate action
      const resetBtn = document.getElementById('reset-all');
      resetBtn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> <span style="margin-left: 6px;">Reset</span>';

      // 1. Update all local data instantly
      categories.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.keys(items).forEach(key => {
          if (key !== "order") {
            groceryData[cat][key].count = 0;
            groceryData[cat][key].checked = false;
          }
        });
        renderList(cat); // Instantly update UI for each table
      });

      // 2. Update DB in the background (batch)
      setTimeout(() => {
        categories.forEach(cat => {
          const items = groceryData[cat] || {};
          Object.keys(items).forEach(key => {
            if (key !== "order") {
              db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: 0, checked: false });
            }
          });
        });

        // Reset the button icon after completion
        setTimeout(() => {
          resetBtn.innerHTML = '<i class="fas fa-rotate-left"></i> <span style="margin-left: 6px;">Reset</span>';
        }, 500); // small delay for visual feedback
      }, 0);
    });
  };


  // --- Move/Delete Toggle Button ---
  document.getElementById('move-delete-toggle').onclick = function () {
moveDeleteMode = !moveDeleteMode;

  if (moveDeleteMode) {
    this.innerHTML = `
      <i class="fas fa-up-down-left-right" style="margin-right: 6px;" title="Move items"></i>
      <i class="fas fa-trash" title="Delete items"></i>
      <span style="margin-left: 6px;">Edit..</span>
    `;
    this.classList.add('editing-mode');
  } else {
    this.innerHTML = `
      <i class="fas fa-up-down-left-right" style="margin-right: 6px;" title="Move items"></i>
      <i class="fas fa-trash" title="Delete items"></i>
    `;
    this.classList.remove('editing-mode');
  }

  renderAllTables();
};


  // --- Collapse All Tables Button ---
  document.getElementById('collapse-all-btn')?.addEventListener('click', function () {
    // Always get the latest list of containers from the DOM
    document.querySelectorAll('.container').forEach(container => {
      const cat = container.id.replace('-container', '');
      localStorage.setItem('col-' + cat, 'true');
      setCollapsed(cat, true);
    });
  });

  // --- Check Zeros Button ---
  document.getElementById('check-zeros-btn').onclick = function () {
    if (!window._checkZerosSortFlags) window._checkZerosSortFlags = {};
    // 1. Prepare updates for all items with count == 0 and not checked
    const updatesByCat = {};
    categories.forEach(cat => {
      const items = groceryData[cat] || {};
      let changed = false;
      Object.keys(items).forEach(key => {
        if (key !== "order") {
          const item = items[key];
          if (item && (item.count || 0) === 0 && !item.checked) {
            // Update local data
            groceryData[cat][key].checked = true;
            changed = true;
            // Prepare DB update
            if (!updatesByCat[cat]) updatesByCat[cat] = {};
            updatesByCat[cat][`${key}/checked`] = true;
          }
        }
      });
      if (changed) {
        window._checkZerosSortFlags[cat] = true;
        renderList(cat, true);
      }
    });

    // 2. Update DB in the background (batch, non-blocking, async)
    // --- FIX: Only update DB for changed items, and do NOT call renderList again after DB update ---
    setTimeout(() => {
      Object.keys(updatesByCat).forEach(cat => {
        const updates = updatesByCat[cat];
        if (Object.keys(updates).length > 0) {
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).update(updates);
        }
      });
    }, 0);
  };

  // --- Error Handling ---
  function handleFirebaseError(error) {
    if (!isLoggedIn) return; // Prevent popups after logout
    console.error("Firebase error:", error);
    const errorMsg = error && error.message ? error.message : "Unknown error occurred.";
    showModal(`Error: ${errorMsg}`, null); // Display error in a modal
  }

  // --- Add User Floating Button Logic ---

  // Show/hide button based on login state
  function setAddUserButtonVisible(visible) {
    const btn = document.getElementById('add-user-btn');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
  }

  // Update showMain/showLogin to toggle button
  function showMain() {
    isLoggedIn = true;
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
    setAddUserButtonVisible(true);
  }
  function showLogin() {
    isLoggedIn = false;
    document.getElementById('main-section').style.display = 'none';
    document.getElementById('login-bg').style.display = '';
    setLogoutButtonVisible(false);
    showLoggedInEmail('');
    setAddUserButtonVisible(false);
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
    document.getElementById('add-user-email').onkeydown = function(e) {
      if (e.key === 'Enter') tryAddUser();
      if (e.key === 'Escape') document.getElementById('add-user-cancel').click();
    };
    document.getElementById('add-user-family').onkeydown = function(e) {
      if (e.key === 'Enter') tryAddUser();
      if (e.key === 'Escape') document.getElementById('add-user-cancel').click();
    };
  }

  // Add User Button click handler
  document.getElementById('add-user-btn').onclick = function () {
    function tryAddUserModal(prevData) {
      showAddUserModal(function (data) {
        if (!data) return;
        // Fetch current authorisedUsers to check for duplicates
        firebase.database().ref('/authorisedUsers').once('value').then(snap => {
          const users = snap.val() || {};
          const emails = Object.values(users).map(u => (u && u.email ? u.email.trim().toLowerCase() : ''));
          const families = Object.values(users).map(u => (u && u.family ? u.family.trim().toLowerCase() : ''));
          const emailExists = emails.includes(data.email.trim().toLowerCase());
          const familyExists = families.includes(data.family.trim().toLowerCase());
          if (emailExists && familyExists) {
            showModal(
              `Both the email "${data.email}" and family "${data.family}" already exist. Please provide unique values.`,
              () => { tryAddUserModal(data); }
            );
            return;
          }
          if (emailExists) {
            showModal(
              `User email "${data.email}" already exists. Please provide a unique email.`,
              () => { tryAddUserModal(data); }
            );
            return;
          }
          if (familyExists) {
            showModal(
              `Family "${data.family}" already exists. Please provide a unique family name.`,
              () => { tryAddUserModal(data); }
            );
            return;
          }
          // Confirm before adding user (OK only)
          showModal(
            `Are you sure you want to add user "${data.email}" to family "${data.family}"?`,
            function (yes) {
              if (!yes) return;
              // Find max userN
              let maxN = 0;
              Object.keys(users).forEach(key => {
                const m = key.match(/^user(\d+)$/);
                if (m) {
                  const n = parseInt(m[1], 10);
                  if (n > maxN) maxN = n;
                }
              });
              const nextKey = 'user' + (maxN + 1);
              // Add to DB
              firebase.database().ref('/authorisedUsers/' + nextKey).set({
                email: data.email,
                family: data.family
              }).then(() => {
                showModal(
                  `User "${data.email}" added to family "${data.family}".`,
                  () => {}
                );
              }).catch(err => {
                showModal('Failed to add user: ' + err.message, () => {});
              });
            }
          );
        });
      }, prevData);
    }

    tryAddUserModal();
  };

  // --- Always show the login screen on initial load ---
  showLogin();

}); // <-- Make sure this closes the DOMContentLoaded handler
// (No more code after this)
