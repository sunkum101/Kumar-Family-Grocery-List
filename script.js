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
    return str.replace(
      /\w\S*/g,
      function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
      }
    );
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
      // --- If a voice add is in progress, skip this update to prevent duplicates ---
      if (isVoiceAdding) {
        return;
      }
      const data = snap.val() || {};
      groceryData = {};
      tableNames = {};
      categories = [];
      tempOrders = {}; // Clear and reload temp orders on each sync

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

      // --- Load temporary orders from DB ---
      Object.keys(data).forEach(key => {
        if (key.endsWith('_temp_items_orders_check_zeros_btn')) {
          const cat = key.replace('_temp_items_orders_check_zeros_btn', '');
          if (data[key] && Array.isArray(data[key])) {
            tempOrders[cat] = data[key];
          }
        }
      });

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
      const trimmedName = toProperCase(name.trim().replace(/\s+/g, ' '));
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
      highlightAndScrollToItem(cat, nextKey);

      // 3. Add to DB in background (write to shoppingListsPerFamily, not userLists)
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
      header.addEventListener('click', function (e) {
        // This listener should ONLY trigger when the header background is clicked,
        // not its buttons or other child elements.
        if (e.target !== header) {
          return;
        }
        toggleCollapse(cat);
      });

      // --- Add a dedicated click listener for the collapse arrow ---
      const collapseArrow = header.querySelector('.collapse-arrow');
      if (collapseArrow) {
        collapseArrow.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent the header's click listener from firing
          toggleCollapse(cat);
        });
      }

      // --- Add a dedicated click listener for the header title ---
      const headerTitle = header.querySelector('.header-title');
      if (headerTitle) {
        headerTitle.addEventListener('click', function(e) {
          // Do not toggle if a dblclick is in progress for editing
          if (e.detail > 1) return;
          e.stopPropagation();
          toggleCollapse(cat);
        });
      }

      // --- Add burger menu click handler ---
      const burgerMenu = header.querySelector('.header-burger-menu');
      if (burgerMenu) {
        // --- Add context menu for long press/right click on burger menu only ---
        let longPressTimer = null;
        
        burgerMenu.addEventListener('mousedown', function(e) {
          if (e.button !== 0) return; // Only left mouse button
          longPressTimer = setTimeout(() => {
            showHeaderContextMenu(cat, header, e.clientX, e.clientY);
          }, 1000); // 1 second long press
        });
        
        burgerMenu.addEventListener('mouseup', function() {
          clearTimeout(longPressTimer);
        });
        
        burgerMenu.addEventListener('mouseleave', function() {
          clearTimeout(longPressTimer);
        });

        // --- Add right-click context menu on burger menu ---
        burgerMenu.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          showHeaderContextMenu(cat, header, e.clientX, e.clientY);
        });

        // --- Touch events for mobile long press on burger menu ---
        burgerMenu.addEventListener('touchstart', function(e) {
          longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            showHeaderContextMenu(cat, header, touch.clientX, touch.clientY);
          }, 1000);
        });
        
        burgerMenu.addEventListener('touchend', function() {
          clearTimeout(longPressTimer);
        });
        
        burgerMenu.addEventListener('touchmove', function() {
          clearTimeout(longPressTimer);
        });
      }

      // --- VOICE BUTTON: Add direct listeners for long-press (mimics burger menu logic) ---
      const voiceBtn = header.querySelector('.voice-add-btn');
      if (voiceBtn) {
        let voiceLongPressTimer = null;

        const startPress = (e) => {
          // DO NOT preventDefault. The working burger menu does not, and it was breaking this.
          e.stopPropagation(); // Only stop propagation to prevent header collapse.
          
          voiceBtn.classList.add('pressing');
          
          voiceLongPressTimer = setTimeout(() => {
            startVoiceAddItem(cat);
            if (voiceBtn) voiceBtn.classList.remove('pressing');
            voiceLongPressTimer = null;
          }, 500); // 0.5 second press
        };

        const cancelPress = (e) => {
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

        // Touch events - simplified to match the working burger menu
        voiceBtn.addEventListener('touchstart', startPress); // Removed { passive: false }
        voiceBtn.addEventListener('touchend', cancelPress);
        voiceBtn.addEventListener('touchmove', cancelPress); // Cancel on any finger movement
        voiceBtn.addEventListener('touchcancel', cancelPress);

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

  // --- DELEGATED EVENT LISTENER FOR VOICE BUTTON LONG-PRESS ---
  // This is more stable than re-attaching listeners on every render.
  /* (function setupVoiceButtonListener() {
    const area = document.getElementById('tables-area');
    let longPressTimer = null;
    let pressTarget = null;

    const handlePressStart = (e) => {
      const btn = e.target.closest('.voice-add-btn');
      if (!btn) return;

      // Prevent default browser actions (scrolling, context menu) which is CRITICAL for mobile.
      e.preventDefault(); 
      e.stopPropagation();

      pressTarget = btn;
      const cat = btn.dataset.cat;
      if (!cat) return;

      btn.classList.add('pressing');

      // Clear any existing timer
      clearTimeout(longPressTimer);

      longPressTimer = setTimeout(() => {
        startVoiceAddItem(cat);
        // Once action is fired, we can clear the target
        if (pressTarget) {
          pressTarget.classList.remove('pressing');
          pressTarget = null;
        }
        longPressTimer = null; // Mark timer as fired
      }, 500); // 0.5-second long press
    };

    const handlePressEnd = (e) => {
      // If the timer is still running, cancel it.
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Always remove the visual feedback
      if (pressTarget) {
        pressTarget.classList.remove('pressing');
        pressTarget = null;
      }
    };

    // This listener stops the "click" that fires after touchend from bubbling to the header.
    const stopClickPropagation = (e) => {
        const btn = e.target.closest('.voice-add-btn');
        if (btn) {
            e.stopPropagation();
        }
    };

    // MOUSE EVENTS
    area.addEventListener('mousedown', handlePressStart);
    area.addEventListener('mouseup', handlePressEnd);
    area.addEventListener('mouseleave', handlePressEnd, true); // Use capture for mouseleave

    // TOUCH EVENTS
    // { passive: false } is required for e.preventDefault() to work in touch events.
    area.addEventListener('touchstart', handlePressStart, { passive: false });
    area.addEventListener('touchend', handlePressEnd);
    area.addEventListener('touchcancel', handlePressEnd); // Handle cases where the touch is cancelled by the system
    area.addEventListener('touchmove', handlePressEnd); // If finger moves, cancel the long press

    // CLICK EVENT (to prevent header collapse)
    area.addEventListener('click', stopClickPropagation, true); // Use capture to stop it early

  })(); */


  // --- Show custom context menu for table header ---
  function showHeaderContextMenu(cat, headerEl, x, y, showUpward = false) {
    // Remove any existing menu
    document.querySelectorAll('.header-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'header-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.zIndex = 6001;
    menu.style.top = y + 'px';
    menu.style.background = '#fff';
    menu.style.borderRadius = '10px';
    menu.style.boxShadow = '0 2px 12px rgba(30,40,60,0.13)';
    menu.style.padding = '4px 0';
    menu.style.minWidth = '170px';
    menu.style.maxWidth = '210px';
    menu.style.fontSize = '1.01rem';
    menu.style.border = '1px solid #e3e8f0';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '0';

    // Modern single-line menu item style
    function createMenuItem(html, onClick, color = '#1976d2') {
      const item = document.createElement('div');
      item.innerHTML = html;
      item.style.padding = '8px 18px';
      item.style.cursor = 'pointer';
      item.style.fontWeight = '500';
      item.style.color = color;
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.border = 'none';
      item.style.background = 'none';
      item.style.transition = 'background 0.13s';
      item.onmouseenter = () => { item.style.background = '#f3f6fa'; };
      item.onmouseleave = () => { item.style.background = ''; };
      item.onclick = function() {
        menu.remove();
        onClick();
      };
      return item;
    }

    // Add menu items
    menu.appendChild(createMenuItem('<i class="fas fa-check"></i> Highlight items to buy', () => markZerosInTable(cat)));
    menu.appendChild(createMenuItem('<i class="fas fa-up-down-left-right"></i> Move Items/List', enableMoveMode));
    menu.appendChild(createMenuItem('<i class="fas fa-trash"></i> Delete Items/List', enableDeleteMode, '#e53935'));
    menu.appendChild(createMenuItem('<i class="fas fa-rotate-left"></i> Reset List', () => resetTable(cat)));

    document.body.appendChild(menu);

    // --- Push state for back button dismissal ---
    history.pushState({ contextMenu: true }, 'Context Menu');

    // --- Auto-adjust menu position to avoid overflow ---
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      let newLeft = x;
      let newTop = y;
      const padding = 8;
      if (rect.right > window.innerWidth) {
        newLeft = Math.max(window.innerWidth - rect.width - padding, 0);
        menu.style.left = newLeft + 'px';
      }
      if (rect.left < 0) {
        newLeft = padding;
        menu.style.left = newLeft + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        newTop = Math.max(window.innerHeight - rect.height - padding, 0);
        menu.style.top = newTop + 'px';
      }
      if (rect.top < 0) {
        newTop = padding;
        menu.style.top = newTop + 'px';
      }
    }, 0);

    // Remove menu on click elsewhere
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
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
    
    // Move ALL checked items to bottom (both newly checked and manually checked)
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
  document.getElementById('add-table-btn-main').onclick = function () {
    if (!isLoggedIn) return;
    // Use custom modal for new table name
    showInputModal('New List Name:', function(listName) {
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
      showInputModal('First item name:', function(itemName) {
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
        ${moveMode ? `
          <span class="item-move-handle" title="Move item">
            <i class="fas fa-up-down-left-right" style="font-size:18px;color:#666;"></i>
          </span>
        ` : deleteMode ? `
          <button class="item-delete-btn" onclick="deleteItem('${cat}', '${key}')">
            <span class="item-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete item"></i>
            </span>
          </button>
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
  if (moveMode) {
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
    undoToast.style.minWidth = '260px'; // Make toast wider
    undoToast.style.maxWidth = '340px';
    undoToast.innerHTML = `
      <span class="undo-message">
        Item deleted:
        <span style="color:#4fc3f7;font-weight:600;">${backupItem.name}</span>
      </span>
      <button class="undo-btn" type="button" tabindex="0" style="margin-left:12px;">UNDO</button>
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
      showModal("Sorry, your browser doesn't support voice recognition.", () => {});
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

    // --- History API for back button dismissal ---
    const voicePromptState = { voicePromptActive: true };
    history.pushState(voicePromptState, 'Voice Input');

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

    const handlePopState = (event) => {
        cleanup(true); // Pass true to indicate it was triggered by popstate
    };
    window.addEventListener('popstate', handlePopState);


    let final_transcript = '';
    let final_transcript_timer = null;

    document.getElementById('voice-cancel-btn').onclick = () => cleanup(false);

    recognition.onresult = function(event) {
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
      // This gives a 1-second pause after the user finishes speaking.
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

    recognition.onspeechend = function() {
      // Do not cleanup here, onresult with its timer is now responsible.
    };

    recognition.onerror = function(event) {
      // The 'onend' event will fire after an error, so cleanup will happen there.
      // We only need to show the modal message here.
      if (event.error === 'not-allowed') {
        // Check if on insecure origin that is not localhost
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            showModal("<b>Microphone access denied.</b><br><br>For development on a private network, you must enable a browser flag. On Chrome, go to:<br><b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b><br><br>Add your site's address (e.g., http://192.168.1.140:5500) to the list, enable it, and relaunch.", () => {});
        } else {
            showModal("<b>Microphone access denied.</b><br><br>To use voice input, please grant microphone permission for this site. Note: Most browsers require a secure (HTTPS) connection.", () => {});
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showModal(`Voice recognition error: ${event.error}`, () => {});
      }
    };
    
    recognition.onend = function() {
      // Only cleanup if a final result was NOT being processed.
      // This handles cases where the user cancels or there's an error.
      if (!final_transcript) {
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

        // Add a class to trigger the animation. This is more robust than inline styles.
        li.classList.add('item-blink');
        
        // After the animation duration (2 seconds), remove the class
        // to allow the original CSS classes to take effect again.
        setTimeout(() => {
          li.classList.remove('item-blink');
        }, 2000);
      }
    }, 150); // Increased delay slightly to ensure the element is ready.
  }

  function processVoiceResult(cat, itemName) {
    if (!itemName) return;
    const trimmedName = toProperCase(itemName.trim().replace(/\s+/g, ' '));
    if (!trimmedName) return;

    const items = groceryData[cat] || {};
    const existingKeys = Object.keys(items).filter(key => key !== 'order' && items[key] && typeof items[key] === 'object' && typeof items[key].name === 'string');
    
    const searchName = trimmedName.toLowerCase();
    const existingItemKey = existingKeys.find(key => items[key].name.trim().toLowerCase() === searchName);

    let targetKey;

    // --- Set a flag to prevent the 'on' listener from re-rendering and creating duplicates ---
    isVoiceAdding = true;

    if (existingItemKey) {
      // Item exists, increment count
      targetKey = existingItemKey;
      const currentCount = items[targetKey].count || 0;
      groceryData[cat][targetKey].count = currentCount + 1;
      groceryData[cat][targetKey].checked = false; // Uncheck if it was checked
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}`).update({
        count: currentCount + 1,
        checked: false
      });
    } else {
      // Item does not exist, add it with count 1
      let maxNum = 0;
      existingKeys.forEach(key => {
        const match = key.match(/-?item(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if num > maxNum) maxNum = num;
        }
      });
      targetKey = `item${maxNum + 1}`;
      const newItem = { name: trimmedName, count: 1, checked: false };

      if (!groceryData[cat]) groceryData[cat] = {};
      groceryData[cat][targetKey] = newItem;
      if (!Array.isArray(groceryData[cat].order)) groceryData[cat].order = [];
      // --- Add new item to the TOP of the order array ---
      groceryData[cat].order.unshift(targetKey);

      // --- If a temporary order is active, add the new item to the TOP ---
      if (tempOrders[cat] && tempOrders[cat].length > 0) {
        tempOrders[cat].unshift(targetKey);
        saveTempOrder(cat, tempOrders[cat]);
      }

      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}`).set(newItem);
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
    }

    // Re-render and then scroll and blink
    renderList(cat);
    saveCache();
    highlightAndScrollToItem(cat, targetKey);

    // --- Clear the flag after a short delay to allow the next real sync to proceed ---
    setTimeout(() => {
      isVoiceAdding = false;
    }, 1500); // 1.5 seconds should be enough for DB to sync
  }

  // --- Move/Delete/Reset Toggle Button ---
  /* This button is being removed. The functionality is available in the table header context menu.
  document.getElementById('move-delete-toggle').onclick = function (e) {
    // This button is now only for entering/exiting move/delete item mode.
    // The specific mode (move vs delete) is handled by the context menu.
    // We just need to toggle a general "editing" state.
    
    const wasInMoveDeleteMode = moveMode || deleteMode;

    if (wasInMoveDeleteMode) {
      // If we were in any edit mode, exit all of them.
      disableMoveDeleteMode();
    } else {
      // If we were not in an edit mode, enter the default one (e.g., move items).
      // The user can switch to delete via the context menu.
      enableMoveMode();
    }
  };
 */

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
      const trimmedName = toProperCase(name.trim().replace(/\s+/g, ' '));
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
      highlightAndScrollToItem(cat, nextKey);

      // 3. Add to DB in background (write to shoppingListsPerFamily, not userLists)
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
      header.addEventListener('click', function (e) {
        // This listener should ONLY trigger when the header background is clicked,
        // not its buttons or other child elements.
        if (e.target !== header) {
          return;
        }
        toggleCollapse(cat);
      });

      // --- Add a dedicated click listener for the collapse arrow ---
      const collapseArrow = header.querySelector('.collapse-arrow');
      if (collapseArrow) {
        collapseArrow.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent the header's click listener from firing
          toggleCollapse(cat);
        });
      }

      // --- Add a dedicated click listener for the header title ---
      const headerTitle = header.querySelector('.header-title');
      if (headerTitle) {
        headerTitle.addEventListener('click', function(e) {
          // Do not toggle if a dblclick is in progress for editing
          if (e.detail > 1) return;
          e.stopPropagation();
          toggleCollapse(cat);
        });
      }

      // --- Add burger menu click handler ---
      const burgerMenu = header.querySelector('.header-burger-menu');
      if (burgerMenu) {
        // --- Add context menu for long press/right click on burger menu only ---
        let longPressTimer = null;
        
        burgerMenu.addEventListener('mousedown', function(e) {
          if (e.button !== 0) return; // Only left mouse button
          longPressTimer = setTimeout(() => {
            showHeaderContextMenu(cat, header, e.clientX, e.clientY);
          }, 1000); // 1 second long press
        });
        
        burgerMenu.addEventListener('mouseup', function() {
          clearTimeout(longPressTimer);
        });
        
        burgerMenu.addEventListener('mouseleave', function() {
          clearTimeout(longPressTimer);
        });

        // --- Add right-click context menu on burger menu ---
        burgerMenu.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          showHeaderContextMenu(cat, header, e.clientX, e.clientY);
        });

        // --- Touch events for mobile long press on burger menu ---
        burgerMenu.addEventListener('touchstart', function(e) {
          longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            showHeaderContextMenu(cat, header, touch.clientX, touch.clientY);
          }, 1000);
        });
        
        burgerMenu.addEventListener('touchend', function() {
          clearTimeout(longPressTimer);
        });
        
        burgerMenu.addEventListener('touchmove', function() {
          clearTimeout(longPressTimer);
        });
      }

      // --- VOICE BUTTON: Add direct listeners for long-press (mimics burger menu logic) ---
      const voiceBtn = header.querySelector('.voice-add-btn');
      if (voiceBtn) {
        let voiceLongPressTimer = null;

        const startPress = (e) => {
          // DO NOT preventDefault. The working burger menu does not, and it was breaking this.
          e.stopPropagation(); // Only stop propagation to prevent header collapse.
          
          voiceBtn.classList.add('pressing');
          
          voiceLongPressTimer = setTimeout(() => {
            startVoiceAddItem(cat);
            if (voiceBtn) voiceBtn.classList.remove('pressing');
            voiceLongPressTimer = null;
          }, 500); // 0.5 second press
        };

        const cancelPress = (e) => {
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

        // Touch events - simplified to match the working burger menu
        voiceBtn.addEventListener('touchstart', startPress); // Removed { passive: false }
        voiceBtn.addEventListener('touchend', cancelPress);
        voiceBtn.addEventListener('touchmove', cancelPress); // Cancel on any finger movement
        voiceBtn.addEventListener('touchcancel', cancelPress);

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

  // --- DELEGATED EVENT LISTENER FOR VOICE BUTTON LONG-PRESS ---
  // This is more stable than re-attaching listeners on every render.
  /* (function setupVoiceButtonListener() {
    const area = document.getElementById('tables-area');
    let longPressTimer = null;
    let pressTarget = null;

    const handlePressStart = (e) => {
      const btn = e.target.closest('.voice-add-btn');
      if (!btn) return;

      // Prevent default browser actions (scrolling, context menu) which is CRITICAL for mobile.
      e.preventDefault(); 
      e.stopPropagation();

      pressTarget = btn;
      const cat = btn.dataset.cat;
      if (!cat) return;

      btn.classList.add('pressing');

      // Clear any existing timer
      clearTimeout(longPressTimer);

      longPressTimer = setTimeout(() => {
        startVoiceAddItem(cat);
        // Once action is fired, we can clear the target
        if (pressTarget) {
          pressTarget.classList.remove('pressing');
          pressTarget = null;
        }
        longPressTimer = null; // Mark timer as fired
      }, 500); // 0.5-second long press
    };

    const handlePressEnd = (e) => {
      // If the timer is still running, cancel it.
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Always remove the visual feedback
      if (pressTarget) {
        pressTarget.classList.remove('pressing');
        pressTarget = null;
      }
    };

    // This listener stops the "click" that fires after touchend from bubbling to the header.
    const stopClickPropagation = (e) => {
        const btn = e.target.closest('.voice-add-btn');
        if (btn) {
            e.stopPropagation();
        }
    };

    // MOUSE EVENTS
    area.addEventListener('mousedown', handlePressStart);
    area.addEventListener('mouseup', handlePressEnd);
    area.addEventListener('mouseleave', handlePressEnd, true); // Use capture for mouseleave

    // TOUCH EVENTS
    // { passive: false } is required for e.preventDefault() to work in touch events.
    area.addEventListener('touchstart', handlePressStart, { passive: false });
    area.addEventListener('touchend', handlePressEnd);
    area.addEventListener('touchcancel', handlePressEnd); // Handle cases where the touch is cancelled by the system
    area.addEventListener('touchmove', handlePressEnd); // If finger moves, cancel the long press

    // CLICK EVENT (to prevent header collapse)
    area.addEventListener('click', stopClickPropagation, true); // Use capture to stop it early

  })(); */


  // --- Show custom context menu for table header ---
  function showHeaderContextMenu(cat, headerEl, x, y, showUpward = false) {
    // Remove any existing menu
    document.querySelectorAll('.header-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'header-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.zIndex = 6001;
    menu.style.top = y + 'px';
    menu.style.background = '#fff';
    menu.style.borderRadius = '10px';
    menu.style.boxShadow = '0 2px 12px rgba(30,40,60,0.13)';
    menu.style.padding = '4px 0';
    menu.style.minWidth = '170px';
    menu.style.maxWidth = '210px';
    menu.style.fontSize = '1.01rem';
    menu.style.border = '1px solid #e3e8f0';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '0';

    // Modern single-line menu item style
    function createMenuItem(html, onClick, color = '#1976d2') {
      const item = document.createElement('div');
      item.innerHTML = html;
      item.style.padding = '8px 18px';
      item.style.cursor = 'pointer';
      item.style.fontWeight = '500';
      item.style.color = color;
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.border = 'none';
      item.style.background = 'none';
      item.style.transition = 'background 0.13s';
      item.onmouseenter = () => { item.style.background = '#f3f6fa'; };
      item.onmouseleave = () => { item.style.background = ''; };
      item.onclick = function() {
        menu.remove();
        onClick();
      };
      return item;
    }

    // Add menu items
    menu.appendChild(createMenuItem('<i class="fas fa-check"></i> Highlight items to buy', () => markZerosInTable(cat)));
    menu.appendChild(createMenuItem('<i class="fas fa-up-down-left-right"></i> Move Items/List', enableMoveMode));
    menu.appendChild(createMenuItem('<i class="fas fa-trash"></i> Delete Items/List', enableDeleteMode, '#e53935'));
    menu.appendChild(createMenuItem('<i class="fas fa-rotate-left"></i> Reset List', () => resetTable(cat)));

    document.body.appendChild(menu);

    // --- Push state for back button dismissal ---
    history.pushState({ contextMenu: true }, 'Context Menu');

    // --- Auto-adjust menu position to avoid overflow ---
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      let newLeft = x;
      let newTop = y;
      const padding = 8;
      if (rect.right > window.innerWidth) {
        newLeft = Math.max(window.innerWidth - rect.width - padding, 0);
        menu.style.left = newLeft + 'px';
      }
      if (rect.left < 0) {
        newLeft = padding;
        menu.style.left = newLeft + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        newTop = Math.max(window.innerHeight - rect.height - padding, 0);
        menu.style.top = newTop + 'px';
      }
      if (rect.top < 0) {
        newTop = padding;
        menu.style.top = newTop + 'px';
      }
    }, 0);

    // Remove menu on click elsewhere
    setTimeout(() => {
      document.addEventListener('mousedown', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
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
    
    // Move ALL checked items to bottom (both newly checked and manually checked)
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
  document.getElementById('add-table-btn-main').onclick = function () {
    if (!isLoggedIn) return;
    // Use custom modal for new table name
    showInputModal('New List Name:', function(listName) {
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
      showInputModal('First item name:', function(itemName) {
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
        ${moveMode ? `
          <span class="item-move-handle" title="Move item">
            <i class="fas fa-up-down-left-right" style="font-size:18px;color:#666;"></i>
          </span>
        ` : deleteMode ? `
          <button class="item-delete-btn" onclick="deleteItem('${cat}', '${key}')">
            <span class="item-delete-svg-wrap">
              <i class="fas fa-trash" style="font-size:18px;color:#e53935;" title="Delete item"></i>
            </span>
          </button>
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
  if (moveMode) {
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
    undoToast.style.minWidth = '260px'; // Make toast wider
    undoToast.style.maxWidth = '340px';
    undoToast.innerHTML = `
      <span class="undo-message">
        Item deleted:
        <span style="color:#4fc3f7;font-weight:600;">${backupItem.name}</span>
      </span>
      <button class="undo-btn" type="button" tabindex="0" style="margin-left:12px;">UNDO</button>
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
      showModal("Sorry, your browser doesn't support voice recognition.", () => {});
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

    // --- History API for back button dismissal ---
    const voicePromptState = { voicePromptActive: true };
    history.pushState(voicePromptState, 'Voice Input');

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

    const handlePopState = (event) => {
        cleanup(true); // Pass true to indicate it was triggered by popstate
    };
    window.addEventListener('popstate', handlePopState);


    let final_transcript = '';
    let final_transcript_timer = null;

    document.getElementById('voice-cancel-btn').onclick = () => cleanup(false);

    recognition.onresult = function(event) {
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
      // This gives a 1-second pause after the user finishes speaking.
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

    recognition.onspeechend = function() {
      // Do not cleanup here, onresult with its timer is now responsible.
    };

    recognition.onerror = function(event) {
      // The 'onend' event will fire after an error, so cleanup will happen there.
      // We only need to show the modal message here.
      if (event.error === 'not-allowed') {
        // Check if on insecure origin that is not localhost
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            showModal("<b>Microphone access denied.</b><br><br>For development on a private network, you must enable a browser flag. On Chrome, go to:<br><b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b><br><br>Add your site's address (e.g., http://192.168.1.140:5500) to the list, enable it, and relaunch.", () => {});
        } else {
            showModal("<b>Microphone access denied.</b><br><br>To use voice input, please grant microphone permission for this site. Note: Most browsers require a secure (HTTPS) connection.", () => {});
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showModal(`Voice recognition error: ${event.error}`, () => {});
      }
    };
    
    recognition.onend = function() {
      // Only cleanup if a final result was NOT being processed.
      // This handles cases where the user cancels or there's an error.
      if (!final_transcript) {
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

        // Add a class to trigger the animation. This is more robust than inline styles.
        li.classList.add('item-blink');
        
        // After the animation duration (2 seconds), remove the class
        // to allow the original CSS classes to take effect again.
        setTimeout(() => {
          li.classList.remove('item-blink');
        }, 2000);
      }
    }, 150); // Increased delay slightly to ensure the element is ready.
  }

  function processVoiceResult(cat, itemName) {
    if (!itemName) return;
    const trimmedName = toProperCase(itemName.trim().replace(/\s+/g, ' '));
    if (!trimmedName) return;

    const items = groceryData[cat] || {};
    const existingKeys = Object.keys(items).filter(key => key !== 'order' && items[key] && typeof items[key] === 'object' && typeof items[key].name === 'string');
    
    const searchName = trimmedName.toLowerCase();
    const existingItemKey = existingKeys.find(key => items[key].name.trim().toLowerCase() === searchName);

    let targetKey;

    // --- Set a flag to prevent the 'on' listener from re-rendering and creating duplicates ---
    isVoiceAdding = true;

    if (existingItemKey) {
      // Item exists, increment count
      targetKey = existingItemKey;
      const currentCount = items[targetKey].count || 0;
      groceryData[cat][targetKey].count = currentCount + 1;
      groceryData[cat][targetKey].checked = false; // Uncheck if it was checked
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}`).update({
        count: currentCount + 1,
        checked: false
      });
    } else {
      // Item does not exist, add it with count 1
      let maxNum = 0;
      existingKeys.forEach(key => {
        const match = key.match(/-?item(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      targetKey = `item${maxNum + 1}`;
      const newItem = { name: trimmedName, count: 1, checked: false };

      if (!groceryData[cat]) groceryData[cat] = {};
      groceryData[cat][targetKey] = newItem;
      if (!Array.isArray(groceryData[cat].order)) groceryData[cat].order = [];
      // --- Add new item to the TOP of the order array ---
      groceryData[cat].order.unshift(targetKey);

      // --- If a temporary order is active, add the new item to the TOP ---
      if (tempOrders[cat] && tempOrders[cat].length > 0) {
        tempOrders[cat].unshift(targetKey);
        saveTempOrder(cat, tempOrders[cat]);
      }

      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/${targetKey}`).set(newItem);
      db.ref(`/shoppingListsPerFamily/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(groceryData[cat].order);
    }

    // Re-render and then scroll and blink
    renderList(cat);
    saveCache();
    highlightAndScrollToItem(cat, targetKey);

    // --- Clear the flag after a short delay to allow the next real sync to proceed ---
    setTimeout(() => {
      isVoiceAdding = false;
    }, 1500); // 1.5 seconds should be enough for DB to sync
  }
  
