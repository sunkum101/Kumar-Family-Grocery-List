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
    setSyncIndicator(true); // Show sync indicator when fetching users
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
        setSyncIndicator(false); // Hide after users loaded
        if (typeof callback === "function") callback();
      })
      .catch(error => {
        setSyncIndicator(false); // Hide on error
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
    setSyncIndicator(true);
    if (shoppingListRef) shoppingListRef.off();
    shoppingListRef = db.ref(`/shoppingListsPerFamily/${family}`);
    shoppingListRef.on('value', snap => {
      const data = snap.val() || {};
      groceryData = {};
      tableNames = {};
      categories = [];

      // --- Collect all unique table keys from groceryLists, tableNames, and tableOrder ---
      const rawGroceryLists = data.groceryLists || {};
      const rawTableNames = data.tableNames || {};
      const rawTableOrder = Array.isArray(data.tableOrder) ? data.tableOrder : [];
      const allKeysSet = new Set([
        ...Object.keys(rawGroceryLists),
        ...Object.keys(rawTableNames),
        ...rawTableOrder
      ]);
      const allKeys = Array.from(allKeysSet);

      // --- Always display all tables present in any of the three DB locations ---
      allKeys.forEach(cat => {
        if (rawGroceryLists[cat]) groceryData[cat] = { ...rawGroceryLists[cat] };
        if (rawTableNames[cat]) tableNames[cat] = rawTableNames[cat];
      });
      categories = allKeys;

      // --- Table order: use DB order, but append any missing keys at the end ---
      let order = Array.isArray(rawTableOrder) ? [...rawTableOrder] : [];
      allKeys.forEach(cat => {
        if (!order.includes(cat)) order.push(cat);
      });
      tableOrder = order;

      renderAllTables();
      saveCache();
      setSyncIndicator(false);
    }, function(error) {
      setSyncIndicator(false);
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

   // --- Collapse All Tables Button ---
  document.getElementById('collapse-all-btn')?.addEventListener('click', function () {
    // Always get the latest list of containers from the DOM
    document.querySelectorAll('.container').forEach(container => {
      const cat = container.id.replace('-container', '');
      localStorage.setItem('col-' + cat, 'true');
      setCollapsed(cat, true);
    });
  });

  
  // --- Handle User Login ---
  function handleUserLogin(user = null) {
    if (user) {
      USER_EMAIL = normalizeEmail(user.email);
      USER_FAMILY = EMAIL_TO_FAMILY[USER_EMAIL] || null;
      if (!USER_FAMILY) {
        showModal('Access denied. Please use an authorized Google account. If you are a new user, please contact Sunil to get your Google account set up.', () => {});
        showLogin(); // <-- Immediately show login screen
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
        showMain();
        showLoggedInEmail(user.email);
        handleUserLogin(user);
      } else {
        showLogin(); // Only show login if not authenticated
      }
    });
  });

  // --- Show main section and try to load lists before auth check ---
  // (No need to call showMain() here, already showing main-section by default)
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

      // Styled OK button (bold, green, like success modal)
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
      saveCache(); // Save after local update

      // 3. Add to DB in background (write to shoppingListsPerFamily, not userLists)
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${nextKey}`).set(item);
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
    });
  }
  window.addItem = addItem;

  // --- Globals ---
  let moveDeleteMode = false;
  let originalKeyOrder = {};
  let groceryData = {};
  let tableNames = {};
  let categories = [];
  let updateCounterDebounce = {};
  let tempOrders = {}; // { cat: [key, ...] }

  // --- Fix: Add these globals for deleted tables/items ---
  let pendingDeletedTables = new Set();
  let pendingDeletedItems = {}; // { cat: Set([key, ...]) }

  // --- Utility: Get order for rendering (temp if exists, else original) ---
  function getRenderOrder(cat, items) {
    if (tempOrders[cat] && tempOrders[cat].length) {
      // Only include keys that still exist in items
      return tempOrders[cat].filter(k => items[k]);
    }
    // Fallback to original order
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

      // Calculate count for header
      const items = groceryData[cat] || {};
      const count = Object.values(items)
        .filter(item => item && typeof item === "object" && item.count > 0 && !item.checked)
        .length;

      header.innerHTML = `
        <span class="header-count" id="${cat}-count">${count}</span>
        <span class="header-title" data-cat="${cat}">${headerName}</span>
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
          <button class="table-reset-btn" onclick="resetTable('${cat}')">
            <span class="table-reset-svg-wrap">
              <i class="fas fa-rotate-left" style="font-size:22px;color:#ff6b35;" title="Reset table"></i>
            </span>
          </button>
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

      // --- Add context menu for right-click and long-press ---
      let longPressTimer = null;
      
      // Right-click context menu
      header.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showHeaderContextMenu(cat, header, e.clientX, e.clientY);
      });

      // Long-press for touch devices
      header.addEventListener('touchstart', function(e) {
        longPressTimer = setTimeout(() => {
          const touch = e.touches[0];
          showHeaderContextMenu(cat, header, touch.clientX, touch.clientY);
        }, 800); // 800ms for long press
      });

      header.addEventListener('touchend', function(e) {
        clearTimeout(longPressTimer);
      });

      header.addEventListener('touchmove', function(e) {
        clearTimeout(longPressTimer);
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

  // --- Show custom context menu for table header ---
  function showHeaderContextMenu(cat, headerEl, x, y) {
    // Remove any existing menu
    document.querySelectorAll('.header-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'header-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.zIndex = 6001;
    menu.style.background = '#fff';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 2px 12px rgba(30,40,60,0.18)';
    menu.style.padding = '8px 0';
    menu.style.minWidth = '180px';
    menu.style.fontSize = '1.05rem';

    // Add Move Table option
    const moveTable = document.createElement('div');
    moveTable.innerHTML = '<i class="fas fa-up-down-left-right" style="margin-right:8px;color:#f59e42;"></i>Move Table';
    moveTable.style.padding = '8px 18px';
    moveTable.style.cursor = 'pointer';
    moveTable.style.fontWeight = '600';
    moveTable.onmouseenter = () => moveTable.style.background = '#e3f2fd';
    moveTable.onmouseleave = () => moveTable.style.background = '';
    moveTable.onclick = function() {
      menu.remove();
      // Enable move/delete mode (same as orange button)
      if (!moveDeleteMode) {
        document.getElementById('move-delete-toggle').click();
      }
    };
    menu.appendChild(moveTable);

    // Add Delete Table option  
    const deleteTable = document.createElement('div');
    deleteTable.innerHTML = '<i class="fas fa-trash" style="margin-right:8px;color:#e53935;"></i>Delete Table';
    deleteTable.style.padding = '8px 18px';
    deleteTable.style.cursor = 'pointer';
    deleteTable.style.fontWeight = '600';
    deleteTable.onmouseenter = () => deleteTable.style.background = '#e3f2fd';
    deleteTable.onmouseleave = () => deleteTable.style.background = '';
    deleteTable.onclick = function() {
      menu.remove();
      window.deleteTable(cat);
    };
    menu.appendChild(deleteTable);

    // Add Reset Table option
    const resetTable = document.createElement('div');
    resetTable.innerHTML = '<i class="fas fa-rotate-left" style="margin-right:8px;color:#ff6b35;"></i>Reset Table';
    resetTable.style.padding = '8px 18px';
    resetTable.style.cursor = 'pointer';
    resetTable.style.fontWeight = '600';
    resetTable.onmouseenter = () => resetTable.style.background = '#e3f2fd';
    resetTable.onmouseleave = () => resetTable.style.background = '';
    resetTable.onclick = function() {
      menu.remove();
      window.resetTable(cat);
    };
    menu.appendChild(resetTable);

    // Add separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.background = '#e3e7ee';
    separator.style.margin = '4px 0';
    menu.appendChild(separator);

    // Add Mark Zeros option
    const markZeros = document.createElement('div');
    markZeros.innerHTML = '<i class="fas fa-check" style="margin-right:8px;color:#22c55e;"></i>Mark Zeros';
    markZeros.style.padding = '8px 18px';
    markZeros.style.cursor = 'pointer';
    markZeros.style.fontWeight = '600';
    markZeros.onmouseenter = () => markZeros.style.background = '#e3f2fd';
    markZeros.onmouseleave = () => markZeros.style.background = '';
    markZeros.onclick = function() {
      menu.remove();
      markZerosInTable(cat);
    };
    menu.appendChild(markZeros);

    document.body.appendChild(menu);

    // --- Auto-adjust menu position to avoid overflow ---
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      let newLeft = x, newTop = y;
      const padding = 8;
      if (rect.right > window.innerWidth) {
        newLeft = Math.max(window.innerWidth - rect.width - padding, 0);
        menu.style.left = newLeft + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        newTop = Math.max(window.innerHeight - rect.height - padding, 0);
        menu.style.top = newTop + 'px';
      }
    }, 0);

    // Remove menu on click elsewhere
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
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
    // Move zeros to bottom
    const keys = Object.keys(items).filter(k => k !== 'order' && items[k] && typeof items[k].name === 'string');
    const toBuy = [];
    const zero = [];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const item = items[key];
      if (!item) continue;
      if ((item.count || 0) > 0) toBuy.push(key);
      else zero.push(key);
    }
    const newOrder = toBuy.concat(zero);
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

  // --- Render List (override displayOrder logic) ---
  function renderList(cat) {
    if (pendingDeletedTables.has(cat)) return;
    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = '';
    const items = groceryData[cat] || {};
    let keys = getRenderOrder(cat, items);

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

  // --- Fix: Always destroy and re-create Sortable instance on every render ---
  if (ul.sortableInstance) {
    ul.sortableInstance.destroy();
    ul.sortableInstance = null;
  }
  if (moveDeleteMode) {
    ul.sortableInstance = Sortable.create(ul, {
      animation: 200,
      handle: '.item-move-handle',
      draggable: 'li',
      ghostClass: 'dragging',
      chosenClass: 'item-moving',
      onStart() {
        ul.querySelectorAll('.item-squeeze').forEach(el => el.classList.remove('item-squeeze'));
      },
      onEnd() {
        ul.querySelectorAll('.item-squeeze').forEach(el => el.classList.remove('item-squeeze'));
        const newOrder = Array.from(ul.querySelectorAll('li'))
          .map(li => li.dataset.key)
          .filter(Boolean);
        groceryData[cat].order = newOrder;
        db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`)
          .set(newOrder)
          .then(() => renderList(cat));
      },
      onChange(evt) {
        ul.querySelectorAll('.item-squeeze').forEach(el => el.classList.remove('item-squeeze'));
        const movedTo = ul.querySelectorAll('li')[evt.newIndex];
        movedTo?.classList.add('item-squeeze');
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
    const itemName = groceryData[cat]?.[key]?.name || '';
    showModal(`Delete this item${itemName ? ` "<b>${itemName}</b>"` : ''}?`, function(yes) {
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
          // Remove from order array in DB
          db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).once('value').then(snap => {
            let order = snap.val() || [];
            order = order.filter(k => k !== key);
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(order);
          });
          if (undoToast.parentNode) document.body.removeChild(undoToast);
          // --- Remove from pending deletes after DB update ---
          if (pendingDeletedItems[cat]) pendingDeletedItems[cat].delete(key);
          // Remove this line to fix the error:
          // subscribeAllLists();
          // Instead, just re-render the UI if needed (optional)
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
        let undoTimeout;

        function handleUndo(e) {
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
            if (undone) return;
            undone = true;
            clearTimeout(undoTimeout);
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}`).set(backupTable.groceryLists);
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableNames/${cat}`).set(backupTable.tableName);
            db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/tableOrder`).set(backupTable.tableOrder);
            renderAllTables();
            if (undoToast.parentNode) document.body.removeChild(undoToast);
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
            // Remove this line to fix the error:
            // subscribeAllLists();
            // Instead, just re-render the UI if needed (optional)
          }
        }, 8000);
      }
    );
  }
  window.deleteTable = deleteTable;

  // --- Move/Delete/Reset Toggle Button ---
  document.getElementById('move-delete-toggle').onclick = function (e) {
    // Remove reset logic from here: reset icon is now just an icon, not clickable
    moveDeleteMode = !moveDeleteMode;
    const resetAllBtn = document.getElementById('reset-all');
    
    if (moveDeleteMode) {
      this.innerHTML = `
        <i class="fas fa-up-down-left-right" style="margin-right: 6px;" title="Move items"></i>
        <i class="fas fa-trash" style="margin-right: 6px;" title="Delete items"></i>
        <span class="reset-circle-icon" title="Reset all">
          <i class="fas fa-rotate-left"></i>
        </span>
      `;
      this.classList.add('editing-mode');
      // Show the Reset All button when in editing mode
      if (resetAllBtn) resetAllBtn.style.display = '';
    } else {
      this.innerHTML = `
        <i class="fas fa-up-down-left-right" style="margin-right: 6px;" title="Move items"></i>
        <i class="fas fa-trash" style="margin-right: 6px;" title="Delete items"></i>
        <span class="reset-circle-icon" title="Reset all">
          <i class="fas fa-rotate-left"></i>
        </span>
      `;
      this.classList.remove('editing-mode');
      // Hide the Reset All button when not in editing mode
      if (resetAllBtn) resetAllBtn.style.display = 'none';
    }
    renderAllTables();
  };

  document.getElementById('reset-all').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;

      // Change button icon to a spinning refresh to indicate action
      const resetBtn = document.getElementById('reset-all');
      resetBtn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> <span style="margin-left: 6px;">Reset All</span>';

      // 1. Update all local data instantly (only count and checked, do NOT touch order)
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

      // 2. Update DB in the background (only count and checked, do NOT touch order)
      // (No setTimeout needed for UI, only for DB)
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
          resetBtn.innerHTML = '<i class="fas fa-rotate-left"></i> <span style="margin-left: 6px;">Reset All</span>';
          // No need to call renderAllTables() again, already done above
        }, 500);
      }, 0);
    });
  };

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
        /* Highlight the item being moved: solid light blue fill, no border, smooth transition */
        .item-moving {
          background: #e3f2fd !important;
          color: #01579b !important;
          border: none !important;
          box-shadow: 0 2px 12px 0 #90caf9;
          z-index: 10;
          transition: background 0.28s cubic-bezier(.68,-0.55,.27,1.55), color 0.18s, box-shadow 0.28s;
        }
        /* Squeeze effect for drop location: slightly different blue, dashed border */
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

  // Show/hide button based on login state
  function setAddUserButtonVisible(visible) {
    const btn = document.getElementById('add-user-btn');
    // Only show for sunil.kumar101@gmail.com
    const isSunil = USER_EMAIL === "sunil.kumar101@gmail.com";
    if (btn) btn.style.display = (visible && isSunil) ? 'flex' : 'none';
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

  // --- Add User Button click handler (revamped, improved) ---
  document.getElementById('add-user-btn').onclick = function () {
    firebase.database().ref('/authorisedUsers').once('value').then(snap => {
      const users = snap.val() || {};
      const emails = Object.values(users).map(u => (u && u.email ? u.email.trim().toLowerCase() : ''));
      const families = Object.values(users).map(u => (u && u.family ? u.family.trim() : ''));
      showAddUserTwoStageModal(emails, families);
    });
  };

  // --- Two-stage modal with radio buttons for existing/new family ---
  function showAddUserTwoStageModal(existingEmails, existingFamilies) {
    // Remove any existing modal
    let backdrop = document.getElementById('add-user-modal-backdrop');
    if (backdrop) backdrop.remove();

    backdrop = document.createElement('div');
    backdrop.id = 'add-user-modal-backdrop';
    backdrop.style = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:4001;background:rgba(30,40,60,0.18);display:flex;align-items:center;justify-content:center;';
    backdrop.innerHTML = `
      <form id="add-user-form" style="background:#fff;border-radius:13px;box-shadow:0 3px 14px rgba(0,0,0,0.13);padding:22px 20px 16px 20px;min-width:240px;max-width:90vw;width:340px;display:flex;flex-direction:column;gap:13px;">
        <div style="font-size:1.13rem;font-weight:700;margin-bottom:2px;text-align:center;">Add New User</div>
        <div style="display:flex;flex-direction:column;gap:8px;justify-content:center;margin-bottom:8px;">
          <label style="display:flex;align-items:center;gap:7px;font-size:1.09rem;font-weight:700;color:#1976d2;cursor:pointer;">
            <input type="radio" name="add-user-mode" value="existing" checked style="margin-right:6px;vertical-align:middle;">
            Add this new user to an existing family
          </label>
          <label style="display:flex;align-items:center;gap:7px;font-size:1.09rem;font-weight:700;color:#1976d2;cursor:pointer;">
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

    // --- Cancel handler: always set after every render ---
    function setCancelHandler() {
      const cancelBtn = document.getElementById('add-user-cancel');
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        };
      }
    }

    // --- Render the stage (inputs) and always re-set cancel handler after every render ---
    function renderStage(mode, prevEmail = '', prevFamily = '', prevFamilySelect = '') {
      const stageDiv = document.getElementById('add-user-stage');
      if (mode === 'existing') {
        stageDiv.innerHTML = `
          <input id="add-user-email" type="email" placeholder="New user email" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;margin-bottom:7px;" autocomplete="off"/>
          <select id="add-user-family-select" class="family-dropdown" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;">
            <option value="">Select family</option>
            ${[...new Set(existingFamilies)].map(fam => `<option value="${fam}" class="family-option">${fam}</option>`).join('')}
          </select>
        `;
      } else {
        stageDiv.innerHTML = `
          <input id="add-user-email" type="email" placeholder="New user email" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;margin-bottom:7px;" autocomplete="off"/>
          <input id="add-user-family" type="text" placeholder="New family name" style="font-size:1.01rem;padding:7px 8px;border-radius:7px;border:1.2px solid #c7d1e6;background:#f7fafd;outline:none;width:100%;box-sizing:border-box;" autocomplete="off"/>
        `;
      }
      // Restore values
      const emailInput = document.getElementById('add-user-email');
      let famInput = null, famSelect = null;
      if (mode === 'existing') famSelect = document.getElementById('add-user-family-select');
      if (mode === 'new') famInput = document.getElementById('add-user-family');
      if (emailInput) emailInput.value = prevEmail || '';
      if (famInput) famInput.value = prevFamily || '';
      if (famSelect) famSelect.value = prevFamilySelect || '';
      setCancelHandler();

      // --- Live validation for email and family name duplicacy ---
      const errorDiv = document.getElementById('add-user-error');
      function validate() {
        let emailVal = emailInput ? emailInput.value.trim().toLowerCase() : '';
        let famVal = famInput ? famInput.value.trim() : (famSelect ? famSelect.value : '');
        let valid = true;
        let errorMsg = '';

        if (!emailVal) {
          valid = false;
          errorMsg = 'Please enter an email address.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
          valid = false;
          errorMsg = 'Please enter a valid email address.';
        } else if (existingEmails.includes(emailVal)) {
          valid = false;
          errorMsg = 'This email already exists.';
        }

        if (mode === 'existing') {
          if (!famSelect || !famSelect.value) {
            valid = false;
            if (!errorMsg) errorMsg = 'Please select a family.';
          }
        } else {
          if (!famVal) {
            valid = false;
            if (!errorMsg) errorMsg = 'Please enter a family name.';
          } else if (existingFamilies.map(f => f.toLowerCase()).includes(famVal.toLowerCase())) {
            valid = false;
            errorMsg = 'This family name already exists.';
          }
        }

        errorDiv.textContent = errorMsg;
        const okBtn = document.getElementById('add-user-ok');
        if (okBtn) {
          okBtn.disabled = !valid;
          okBtn.style.opacity = valid ? '' : '0.6';
          okBtn.style.cursor = valid ? '' : 'not-allowed';
        }
      }

      if (emailInput) emailInput.addEventListener('input', validate);
      if (famInput) famInput.addEventListener('input', validate);
      if (famSelect) famSelect.addEventListener('change', validate);
      setTimeout(validate, 0);
    }

    // --- Initial render ---
    let mode = 'existing';
    renderStage(mode);

    // --- Radio logic: re-render stage and re-set cancel handler ---
    document.querySelectorAll('input[name="add-user-mode"]').forEach(radio => {
           radio.addEventListener('change', function () {
        mode = this.value;
        // Save values before switching
        const emailInput = document.getElementById('add-user-email');
        const famInput = document.getElementById('add-user-family');
        const famSelect = document.getElementById('add-user-family-select');
        const prevEmail = emailInput ? emailInput.value : '';
        const prevFamily = famInput ? famInput.value : '';
        const prevFamilySelect = famSelect ? famSelect.value : '';
        renderStage(mode, prevEmail, prevFamily, prevFamilySelect);
      });
    });

    setCancelHandler();

    // --- Confirmation and DB logic (same as before, with padded user keys) ---
    let awaitingConfirmation = false;

    // --- FIX: Get the form element after modal is added to DOM ---
    const form = document.getElementById('add-user-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      const email = (document.getElementById('add-user-email')?.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || existingEmails.includes(email)) return;
      if (mode === 'existing') {
        const fam = document.getElementById('add-user-family-select').value;
        if (!fam) return;
        const familyId = sanitizeFamilyId(fam);
        if (!awaitingConfirmation) {
          awaitingConfirmation = true;
          showModal(
            `Are you sure you want to add user "${email}" to family "${fam}"?`,
            function (yes) {
              awaitingConfirmation = false;
              const modalBackdrop = document.getElementById('modal-backdrop');
              if (modalBackdrop) {
                modalBackdrop.classList.remove('active');
                modalBackdrop.style.display = 'none';
              }
              if (!yes) return;
              firebase.database().ref('/authorisedUsers').once('value').then(snap => {
                const users = snap.val() || {};
                let maxN = 0;
                Object.keys(users).forEach(key => {
                  const m = key.match(/^user(\d+)$/);
                  if (m) {


                    const n = parseInt(m[1], 10);
                    if (n > maxN) maxN = n;
                  }
                });
                const nextKey = 'user' + String(maxN + 1).padStart(4, '0');
                firebase.database().ref('/authorisedUsers/' + nextKey).set({
                  email: email,
                  family: familyId
                }).then(() => {
                  const modal = document.getElementById('add-user-modal-backdrop');
                  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
                  setTimeout(() => {
                    const modalBackdrop = document.getElementById('modal-backdrop');
                    if (modalBackdrop) {
                      modalBackdrop.style.display = 'flex';
                      modalBackdrop.classList.add('active');
                      modalBackdrop.style.zIndex = 5000;
                      document.getElementById('modal-title').innerHTML = `<div style="color: #4CAF50; font-weight: bold;">Success!</div>User "${email}" added to family "${fam}".`;
                      document.getElementById('modal-btn-no').style.display = 'none';
                      document.getElementById('modal-btn-yes').style.display = '';
                      document.getElementById('modal-btn-yes').textContent = 'OK';
                      document.getElementById('modal-btn-yes').onclick = function () {
                        modalBackdrop.classList.remove('active');
                        modalBackdrop.style.display = 'none';
                      };
                      document.getElementById('modal-btn-yes').focus();
                    }
                  }, 200);
                }).catch(err => {
                  errorDiv.textContent = 'Failed to add user: ' + err.message;
                });
              });
           

            }
          );
          return;
        }
      } else {
        const fam = (document.getElementById('add-user-family')?.value || '').trim();
        if (!fam || existingFamilies.map(f => f.toLowerCase()).includes(fam.toLowerCase())) return;
        const familyId = sanitizeFamilyId(fam);
        if (!awaitingConfirmation) {
          awaitingConfirmation = true;
          showModal(
            `Are you sure you want to add user "${email}" to new family "${fam}"?`,
            function (yes) {
              awaitingConfirmation = false;
              const modalBackdrop = document.getElementById('modal-backdrop');
              if (modalBackdrop) {
                modalBackdrop.classList.remove('active');
                modalBackdrop.style.display = 'none';
              }
              if (!yes) return;
              firebase.database().ref('/authorisedUsers').once('value').then(snap => {
                const users = snap.val() || {};
                let maxN = 0;
                Object.keys(users).forEach(key => {
                  const m = key.match(/^user(\d+)$/);
                  if (m) {
                    const n = parseInt(m[1], 10);
                    if (n > maxN) maxN = n;
                  }
                });
                const nextKey = 'user' + String(maxN + 1).padStart(4, '0');
                firebase.database().ref('/authorisedUsers/' + nextKey).set({
                  email: email,
                  family: familyId
                }).then(() => {
                  const modal = document.getElementById('add-user-modal-backdrop');
                  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
                  setTimeout(() => {
                    const modalBackdrop = document.getElementById('modal-backdrop');
                    if (modalBackdrop) {
                      modalBackdrop.style.display = 'flex';
                      modalBackdrop.classList.add('active');
                      modalBackdrop.style.zIndex = 5000;
                      document.getElementById('modal-title').innerHTML = `<div style="color: #4CAF50; font-weight: bold;">Success!</div>User "${email}" added to new family "${fam}".`;
                      document.getElementById('modal-btn-no').style.display = 'none';
                      document.getElementById('modal-btn-yes').style.display = '';
                      document.getElementById('modal-btn-yes').textContent = 'OK';
                      document.getElementById('modal-btn-yes').onclick = function () {
                        modalBackdrop.classList.remove('active');
                        modalBackdrop.style.display = 'none';
                      };
                      document.getElementById('modal-btn-yes').focus();
                    }
                  }, 200);
                }).catch(err => {
                  errorDiv.textContent = 'Failed to add user: ' + err.message;
                });
              });
            }
          );
          return;
        }
      }
    };
  };

  // --- Always show the login screen on initial load ---
  showLogin();

  // --- LocalStorage Caching for Fast Load ---
  function saveCache() {
    try {
      const cache = {
        groceryData,
        tableNames,
        tableOrder: typeof tableOrder !== 'undefined' ? tableOrder : [],
        categories
      };
      localStorage.setItem('groceryListCache', JSON.stringify(cache));
    } catch (e) { /* ignore */ }
  }

  function loadCache() {
    try {
      const cache = JSON.parse(localStorage.getItem('groceryListCache'));
      if (cache && typeof cache === 'object') {
        groceryData = cache.groceryData || {};
        tableNames = cache.tableNames || {};
        tableOrder = cache.tableOrder || Object.keys(groceryData);
        categories = cache.categories || Object.keys(groceryData);
        renderAllTables();
      }
    } catch (e) { /* ignore */ }
  }

  // --- On page load, render from cache immediately ---
  loadCache();

  // --- Show main section by default for instant load ---
  document.getElementById('login-bg').style.display = 'none';
  document.getElementById('main-section').style.display = '';

  // --- If already authenticated, show main UI and email ---
  if (auth.currentUser) {
    showMain();
    showLoggedInEmail(auth.currentUser.email);
  }

  // --- Auth State Change ---
  auth.onAuthStateChanged(user => {
    fetchAuthorisedUsers(() => {
      if (user) {
        showMain();
        showLoggedInEmail(user.email);
        handleUserLogin(user);
      } else {
        showLogin(); // Only show login if not authenticated
      }
    });
  });

  // --- Show main section and try to load lists before auth check ---
  // (No need to call showMain() here, already showing main-section by default)
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

  // Add a sync indicator to the top of main-section if not present
  (function addSyncIndicator() {
    const mainSection = document.getElementById('main-section');
    if (mainSection && !document.getElementById('sync-indicator')) {
      const syncDiv = document.createElement('div');
      syncDiv.id = 'sync-indicator';
      syncDiv.style.display = 'none';
      syncDiv.style.position = 'relative';
      syncDiv.style.width = '100%';
      syncDiv.style.textAlign = 'center';
      syncDiv.style.zIndex = '6000';
      syncDiv.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:1.08rem;font-weight:600;color:#1976d2;animation:sync-flash 1s linear infinite;">
          <i class="fas fa-cloud-upload-alt" style="font-size:1.25em;"></i>
          Syncing with cloud...
        </span>
        <style>@keyframes sync-flash { 0%,100%{opacity:1;} 50%{opacity:0.4;} }</style>
      `;
      mainSection.insertBefore(syncDiv, mainSection.firstChild);
    }
  })();

  // Utility to show/hide sync indicator
  function setSyncIndicator(visible) {
    const el = document.getElementById('sync-indicator');
    if (el) el.style.display = visible ? '' : 'none';
  }

  // --- Reset Individual Table ---
  function resetTable(cat) {
    // Confirm reset action with YES/NO
    showModal(
      `Are you sure you want to reset all counters and uncheck all items in table "${tableNames[cat] || cat}"?`,
      function(confirmed) {
        if (!confirmed) return;

        setSyncIndicator(true);

        // 1. Update all local data instantly (only count and checked, do NOT touch order or remove items)
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

        // 2. Update DB in the background (only count and checked, do NOT touch order or remove items)
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



}); // <-- End DOMContentLoaded

// --- Fix: Add stringToHeaderColor utility ---
function stringToHeaderColor(str) {
  // Deterministic color palette for table headers
  const palettes = [
    { bg: "#b8dbc7", fg: "#23472b" }, 
    { bg: "#d7c3e6", fg: "#4b2956" }, 
    { bg: "#c3d4ea", fg: "#23324b" }, 
    { bg: "#cfd8dc", fg: "#263238" }, 
    { bg: "#f3cccc", fg: "#8b1c1c" }, 
    { bg: "#e2d3cb", fg: "#4e342e" }, 
    { bg: "#c3d4ea", fg: "#232c3d" }, 
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

