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

    // Add upward arrow indicator if showing upward
    if (showUpward) {
      menu.classList.add('upward');
      menu.style.bottom = (window.innerHeight - y) + 'px';
      
      // Add downward arrow at bottom of menu
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
      
      // Add upward arrow at top of menu for normal positioning
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

    // Add Highlight items to buy option FIRST
    const markZeros = document.createElement('div');
    markZeros.innerHTML = '<i class="fas fa-check" style="margin-right:8px;color:#1976d2;"></i> Highlight items to buy';
    markZeros.style.padding = '10px 18px';
    markZeros.style.cursor = 'pointer';
    markZeros.style.fontWeight = '600';
    markZeros.style.color = '#1976d2';
    markZeros.onmouseenter = () => markZeros.style.background = '#e3f2fd';
    markZeros.onmouseleave = () => markZeros.style.background = '';
    markZeros.onclick = function() {
      menu.remove();
      markZerosInTable(cat);
    };
    menu.appendChild(markZeros);

    // Add divider
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#eee';
    divider.style.margin = '8px 0';
    menu.appendChild(divider);

    // Add Move Items option
    const moveItems = document.createElement('div');
    moveItems.innerHTML = '<i class="fas fa-up-down-left-right" style="margin-right:8px;color:#1976d2;"></i> Move Items/List';
    moveItems.style.padding = '10px 18px';
    moveItems.style.cursor = 'pointer';
    moveItems.style.fontWeight = '600';
    moveItems.style.color = '#1976d2';
    moveItems.onmouseenter = () => moveItems.style.background = '#e3f2fd';
    moveItems.onmouseleave = () => moveItems.style.background = '';
    moveItems.onclick = function() {
      menu.remove();
      enableMoveMode();
    };
    menu.appendChild(moveItems);

    // Add Delete Items option
    const deleteItems = document.createElement('div');
    deleteItems.innerHTML = '<i class="fas fa-trash" style="margin-right:8px;color:#1976d2;"></i> Delete Items/List';
    deleteItems.style.padding = '10px 18px';
    deleteItems.style.cursor = 'pointer';
    deleteItems.style.fontWeight = '600';
    deleteItems.style.color = '#1976d2';
    deleteItems.onmouseenter = () => deleteItems.style.background = '#e3f2fd';
    deleteItems.onmouseleave = () => deleteItems.style.background = '';
    deleteItems.onclick = function() {
      menu.remove();
      enableDeleteMode();
    };
    menu.appendChild(deleteItems);

    // Add Reset Items option
    const resetItems = document.createElement('div');
    resetItems.innerHTML = '<i class="fas fa-rotate-left" style="margin-right:8px;color:#1976d2;"></i> Reset List';
    resetItems.style.padding = '10px 18px';
    resetItems.style.cursor = 'pointer';
    resetItems.style.fontWeight = '600';
    resetItems.style.color = '#1976d2';
    resetItems.onmouseenter = () => resetItems.style.background = '#e3f2fd';
    resetItems.onmouseleave = () => resetItems.style.background = '';
    resetItems.onclick = function() {
      menu.remove();
      resetTable(cat); // <-- FIX: Call resetTable(cat) instead of resetAllItems()
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
                groceryData[cat].order.push(targetKey);
      
      // --- FIX: If a temporary order is active, add the new item to it ---
      if (tempOrders[cat] && tempOrders[cat].length > 0) {
        // Add the new item to the beginning of the temporary order
        tempOrders[cat].unshift(targetKey);
        // Save the updated temporary order to Firebase
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

  document.getElementById('reset-all').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;

      // Change button icon to a spinning refresh to indicate action
      const resetBtn = document.getElementById('reset-all');
      resetBtn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> <span style="margin-left: 6px;">Reset All</span>';

      // 1. Update all local data instantly (only count and checked, do NOT touch order or remove items)
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

      // 2. Update DB in the background (only count and checked, do NOT touch order or remove items)
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
                  showModal(`<div style="color: #4CAF50; font-weight: bold;">Success!</div>User "${email}" added to family "${fam}".`);
                }).catch(err => {
                  const errorDiv = document.getElementById('add-user-error');
                  if(errorDiv) errorDiv.textContent = 'Failed to add user: ' + err.message;
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
                  showModal(`<div style="color: #4CAF50; font-weight: bold;">Success!</div>User "${email}" added to new family "${fam}".`);
                }).catch(err => {
                  const errorDiv = document.getElementById('add-user-error');
                  if(errorDiv) errorDiv.textContent = 'Failed to add user: ' + err.message;
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

  // --- Remove old sync indicator logic
  // (function addSyncIndicator() { ... })();

// Utility to show/hide sync toast notification
function setSyncIndicator(visible) {
  let toast = document.getElementById('sync-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    toast.style.display = 'none'; // Initially hidden
    toast.innerHTML = `
      <div class="sync-spinner">
        <div class="cloud-lightning-container">
          <svg class="cloud-with-lightning" width="28" height="20" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg">
            <!-- Main cloud shape -->
            <path class="cloud-base" d="M22 8C22 5.5 20 3.5 17.5 3.5C16.8 3.5 16.2 3.7 15.7 4C14.8 2.3 13 1 11 1C8.2 1 6 3.2 6 6C6 6.2 6 6.4 6.1 6.5C5.7 6.4 5.4 6.3 5 6.3C3.3 6.3 2 7.6 2 9.3C2 10.8 3.1 12 4.5 12.2H21.5C23.4 12.2 25 10.6 25 8.7C25 8.2 24.9 7.8 24.7 7.4C23.6 7.7 22.8 7.9 22 8Z" 
                  fill="#fff" 
                  stroke="#fff" 
                  stroke-width="1" 
                  opacity="0.9"/>
            
            <!-- Lightning outline that will animate -->
            <path class="lightning-outline" d="M22 8C22 5.5 20 3.5 17.5 3.5C16.8 3.5 16.2 3.7 15.7 4C14.8 2.3 13 1 11 1C8.2 1 6 3.2 6 6C6 6.2 6 6.4 6.1 6.5C5.7 6.4 5.4 6.3 5 6.3C3.3 6.3 2 7.6 2 9.3C2 10.8 3.1 12 4.5 12.2H21.5C23.4 12.2 25 10.6 25 8.7C25 8.2 24.9 7.8 24.7 7.4C23.6 7.7 22.8 7.9 22 8Z" 
                  fill="transparent" 
                  stroke="#4fc3f7" 
                  stroke-width="2.5" 
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  pathLength="100"/>
            
            <!-- Electric spark effects -->
            <g class="spark-effects">
              <circle class="spark spark-1" cx="8" cy="5" r="1" fill="#4fc3f7" opacity="0"/>
              <circle class="spark spark-2" cx="15" cy="4" r="1" fill="#4fc3f7" opacity="0"/>
              <circle class="spark spark-3" cx="20" cy="7" r="1" fill="#4fc3f7" opacity="0"/>
              <circle class="spark spark-4" cx="12" cy="11" r="1" fill="#4fc3f7" opacity="0"/>
            </g>
          </svg>
        </div>
      </div>
      <span class="sync-text">Syncing with cloud...</span>
    `;
    document.body.appendChild(toast);

    // Add CSS for lightning animation
    if (!document.getElementById('sync-indicator-progress-css')) {
      const style = document.createElement('style');
      style.id = 'sync-indicator-progress-css';
      style.innerHTML = `
        /* Prevent inherited animations */
        .sync-spinner,
        .cloud-base,
        #sync-cloud-icon,
        .fa-cloud,
        .fa-spin {
          animation: none !important;
          transform: none !important;
        }
        
        .cloud-lightning-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 24px;
          margin-right: 7px;
        }
        
        .cloud-with-lightning {
          position: relative;
          z-index: 3;
        }
        
        /* Lightning outline progress animation */
        .lightning-outline {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: lightning-progress 1.5s ease-in-out infinite !important;
          filter: drop-shadow(0 0 3px #4fc3f7);
        }
        
        @keyframes lightning-progress {
          0% {
            stroke-dashoffset: 100;
            stroke: #4fc3f7;
            filter: drop-shadow(0 0 3px #4fc3f7);
          }
          25% {
            stroke-dashoffset: 75;
            stroke: #29b6f6;
            filter: drop-shadow(0 0 5px #29b6f6);
          }
          50% {
            stroke-dashoffset: 50;
            stroke: #03a9f4;
            filter: drop-shadow(0 0 8px #03a9f4);
          }
          75% {
            stroke-dashoffset: 25;
            stroke: #0288d1;
            filter: drop-shadow(0 0 5px #0288d1);
          }
          100% {
            stroke-dashoffset: 0;
            stroke: #01579b;
            filter: drop-shadow(0 0 3px #01579b);
          }
        }
        
        /* Electric spark animations */
        .spark {
          animation: spark-flash 2s ease-in-out infinite !important;
        }
        
        .spark-1 { animation-delay: 0.2s !important; }
        .spark-2 { animation-delay: 0.6s !important; }
        .spark-3 { animation-delay: 1.0s !important; }
        .spark-4 { animation-delay: 1.4s !important; }
        
        @keyframes spark-flash {
          0%, 90%, 100% {
            opacity: 0;
            transform: scale(1);
          }
          5%, 15% {
            opacity: 1;
            transform: scale(1.5);
          }
          10% {
            opacity: 0.7;
            transform: scale(1.2);
          }
        }
        
        /* Webkit fallbacks */
        @-webkit-keyframes lightning-progress {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        
        @-webkit-keyframes spark-flash {
          0%, 90%, 100% { opacity: 0; }
          5%, 15% { opacity: 1; }
        }
        
        .lightning-outline {
          -webkit-animation: lightning-progress 1.5s ease-in-out infinite !important;
        }
        
        .spark {
          -webkit-animation: spark-flash 2s ease-in-out infinite !important;
        }
        
        /* Cloud subtle glow effect */
        .cloud-base {
          filter: drop-shadow(0 0 4px rgba(255,255,255,0.3));
        }
        
        /* Override FontAwesome interference */
        .sync-toast .fa-spin,
        .sync-toast .fa-pulse,
        .sync-toast [class*="fa-"] {
          animation: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  if (visible) {
    toast.style.display = 'flex';
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.top = '55px';
    }, 10);
  } else {
    toast.style.opacity = '0';
    toast.style.top = '40px';
    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 300);
  }
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

  // --- Enable Move/Delete Mode ---
  function enableMoveDeleteMode() {
    moveDeleteMode = true;
    renderAllTables();
    // Add history entry for back button functionality
    history.pushState({ moveMode: true }, '', '');
  }

  // --- Enable Move Mode ---
  function enableMoveMode() {
    moveMode = true;
    deleteMode = false;
    moveDeleteMode = true; // Keep for compatibility
    renderAllTables();
    // Add history entry for back button functionality
    history.pushState({ moveMode: true }, '', '');
  }

  // --- Enable Delete Mode ---
  function enableDeleteMode() {
    deleteMode = true;
    moveMode = false;
    moveDeleteMode = true; // Keep for compatibility
    renderAllTables();
    // Add history entry for back button functionality
    history.pushState({ deleteMode: true }, '', '');
  }

  // --- Disable Move/Delete Mode ---
  function disableMoveDeleteMode() {
    moveDeleteMode = false;
    moveMode = false;
    deleteMode = false;
    renderAllTables();
  }

  // --- Reset All Items ---
  function resetAllItems() {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;

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
      }, 0);
    });
  }

  // --- Handle browser back button to exit move mode ---
  window.addEventListener('popstate', function(event) {
    // --- Close help modal if it's open ---
    const helpModal = document.getElementById('help-modal-backdrop');
    if (helpModal) {
      helpModal.remove();
    }

    // --- Close context menu if it's open ---
    const contextMenu = document.querySelector('.header-context-menu');
    if (contextMenu) {
        contextMenu.remove();
    }
    
    if (moveDeleteMode || moveMode || deleteMode) {
      // Exit move/delete mode when back button is pressed
      disableMoveDeleteMode();
      // Prevent default back navigation
      event.preventDefault();
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
  document.body.addEventListener('click', function(e) {
    if (e.target.id === 'help-icon') {
      showHelpModal();
    }
  });
});
  // --- END OF DOMContentLoaded ---
