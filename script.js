// --- AUTH & DOM READY ---
document.addEventListener("DOMContentLoaded", function () {
  // --- Ensure Firebase SDK is loaded ---
  if (typeof firebase === "undefined" || !firebase.app) {
    alert("Firebase SDK not loaded. Please check your internet connection and script includes.");
    document.getElementById('allowed-list').innerHTML = '<li style="color:#e53935;text-align:center;">Firebase SDK not loaded. Check your internet connection and script includes.</li>';
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

  // --- Authorised Emails & Family Groups ---
  let AUTHORISED_EMAILS = {}; // { email: familyKey }
  let FAMILY_EMAILS = {};     // { familyKey: [email, ...] }
  let USER_AVATARS = {};      // { email: avatarUrl }
  let selectedEmail = null;
  let selectedFamilyKey = null;

  // --- Define setLogoutButtonVisible ---
  function setLogoutButtonVisible(visible) {
    const logoutBtn = document.getElementById('logout-btn-top');
    if (logoutBtn) {
      logoutBtn.style.display = visible ? '' : 'none';
    }
  }

  // --- Fetch Authorised Emails from DB ---
  function fetchAuthorisedEmails(callback) {
    db.ref('/authorisedEmails').once('value')
      .then(snap => {
        const data = snap.val();
        console.log("Fetched /authorisedEmails from Firebase:", data);
        AUTHORISED_EMAILS = {};
        FAMILY_EMAILS = {};
        USER_AVATARS = {};
        if (!data) {
          console.error("No data found at /authorisedEmails. Check Firebase DB path and rules.");
          return;
        }
        Object.keys(data).forEach(familyKey => {
          FAMILY_EMAILS[familyKey] = [];
          Object.keys(data[familyKey] || {}).forEach(emailKey => {
            // Normalize both the key and the value for robust matching
            const email = emailKey.replace(/_dot_/g, '.').replace(/_at_/g, '@').trim().toLowerCase();
            AUTHORISED_EMAILS[email] = familyKey;
            FAMILY_EMAILS[familyKey].push(email);
            if (data[familyKey][emailKey]?.avatar) {
              USER_AVATARS[email] = data[familyKey][emailKey].avatar;
            }
          });
        });
        // DEBUG: Print all keys for troubleshooting
        console.log("Processed AUTHORISED_EMAILS:", AUTHORISED_EMAILS);
        if (typeof callback === "function") callback();
      })
      .catch(error => {
        handleFirebaseError(error); // Improved error handling
      });
  }

  // --- Ensure email normalization is consistent ---
  function emailToKey(email) {
    return email.replace(/\./g, '_dot_').replace(/@/g, '_at_');
  }

  // --- DB Key Utilities ---
  function getUserListKey(user) {
    // Always normalize email for lookup
    const email = user.email.trim().toLowerCase();
    return AUTHORISED_EMAILS[email] || AUTHORISED_EMAILS[emailToKey(email)];
  }

  // --- Google Sign-In Logic ---
  let signInInProgress = false;
  function googleSignIn() {
    if (signInInProgress) return; // Prevent multiple popups
    signInInProgress = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
      .then((result) => {
        signInInProgress = false;
        const user = result.user;
        handleUserLogin(user);
      })
      .catch((error) => {
        signInInProgress = false;
        // Only show error if not cancelled-popup-request
        if (error.code !== "auth/cancelled-popup-request") {
          console.error("Error during Google Sign-In:", error);
          showModal(`Failed to sign in: ${error.message}`, () => {});
        }
      });
  }

  document.getElementById('google-signin-btn').onclick = googleSignIn;

  // --- Subscribe to All Lists ---
  function subscribeAllLists() {
    if (!USER_LIST_KEY) {
      console.error("USER_LIST_KEY is not set. Cannot subscribe to lists.");
      return;
    }
    // Use .on instead of .once to get real-time updates
    db.ref(`/userLists/${USER_LIST_KEY}`).on('value', snap => {
      const data = snap.val() || {};
      groceryData = data.groceryLists || {};
      tableNames = data.tableNames || {};
      categories = Object.keys(groceryData);
      tableOrder = Array.isArray(data.tableOrder) ? data.tableOrder.filter(k => categories.includes(k)) : categories.slice();
      renderAllTables(); // Render tables immediately
    }, handleFirebaseError);
  }

  // --- Auth State Change ---
  auth.onAuthStateChanged(user => {
    if (user) {
      showMain();
      showLoggedInEmail(user.email);
      fetchAuthorisedEmails(() => {
        if (auth.currentUser && auth.currentUser.email === user.email) {
          // Always use lowercase/trimmed for lookup
          const signedInEmail = user.email.trim().toLowerCase();
          const normalizedEmail = emailToKey(signedInEmail).toLowerCase();
          // Try both plain and normalized
          let familyKey = AUTHORISED_EMAILS[signedInEmail];
          if (!familyKey) familyKey = AUTHORISED_EMAILS[normalizedEmail];
          // DEBUG: Show all info for troubleshooting
          console.log("Signed-in email:", signedInEmail);
          console.log("Normalized email:", normalizedEmail);
          console.log("AUTHORISED_EMAILS keys:", Object.keys(AUTHORISED_EMAILS));
          console.log("familyKey found:", familyKey);
          if (!familyKey) {
            // Show all info in modal for debugging
            showModal(
              'Access denied. Please use an allowed Google account.<br>' +
              '<small style="color:#888;">Email: ' + user.email + '</small><br>' +
              '<small>Normalized: ' + normalizedEmail + '</small><br>' +
              '<small>Allowed: ' + Object.keys(AUTHORISED_EMAILS).join(', ') + '</small>',
              () => {}
            );
            auth.signOut();
            return;
          }
          USER_LIST_KEY = familyKey;
          db.ref(`/userLists/${USER_LIST_KEY}`).once('value')
            .then(() => {
              subscribeAllLists();
            })
            .catch((error) => {
              if (error && error.code === "PERMISSION_DENIED") {
                showModal('You do not have permission to access this family list. Please contact admin.', () => {});
                auth.signOut();
              } else {
                handleFirebaseError(error);
              }
            });
        }
      });
    } else {
      showLogin();
    }
  });

  // --- Handle User Login ---
  function handleUserLogin(user) {
    // Always normalize email for lookup
    const email = user.email.trim().toLowerCase();
    const normalizedEmail = emailToKey(email).toLowerCase();
    const familyKey = AUTHORISED_EMAILS[email] || AUTHORISED_EMAILS[normalizedEmail];
    if (!familyKey) {
      showModal('Access denied. Please use an allowed Google account.', () => {});
      auth.signOut();
      return;
    }
    USER_LIST_KEY = familyKey;
    db.ref(`/userLists/${USER_LIST_KEY}`).once('value')
      .then(() => {
        subscribeAllLists();
      })
      .catch((error) => {
        if (error && error.code === "PERMISSION_DENIED") {
          showModal('You do not have permission to access this family list. Please contact admin (Sunil).', () => {});
          auth.signOut();
        } else {
          handleFirebaseError(error);
        }
      });
  }

  // --- Ensure proper handling of user authentication ---
  function showLogin() {
    document.getElementById('main-section').style.display = 'none';
    document.getElementById('login-bg').style.display = '';
    setLogoutButtonVisible(false);
    showLoggedInEmail('');
  }

  function showMain() {
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
  }

  // --- Define showLoggedInEmail ---
  function showLoggedInEmail(email) {
    const emailLabel = document.getElementById('user-email-label');
    if (emailLabel) {
      emailLabel.textContent = email || '';
      emailLabel.style.display = email ? '' : 'none';
    }
  }

  // --- Logout ---
  document.getElementById('logout-btn-top').onclick = function () {
    auth.signOut().then(() => {
      // Hide main section and show login, but do NOT call showLogin() here
      // Wait for onAuthStateChanged to handle UI update
      // Optionally, show a toast or message if you want
    }).catch((error) => {
      // Optionally, ignore error if user is already signed out
      console.warn("Logout warning:", error);
    });
  };

  // --- Modal Helpers ---
  function showModal(title, callback) {
    const backdrop = document.getElementById('modal-backdrop');
    const titleEl = document.getElementById('modal-title');
    const btnNo = document.getElementById('modal-btn-no');
    const btnYes = document.getElementById('modal-btn-yes');
    titleEl.textContent = title;
    // Change button text for info-only modals
    if (title && (title.includes('already exists') || title.includes('duplicate'))) {
      btnNo.style.display = 'none';
      btnYes.textContent = 'OK';
      btnYes.onclick = () => {
        cleanup();
        if (callback) callback();
      };
      btnYes.focus();
    } else {
      btnNo.style.display = '';
      btnYes.textContent = 'Confirm';
      btnNo.textContent = 'Cancel'; // Update button text for clarity
      btnNo.onclick = () => { cleanup(); callback(false); };
      btnYes.onclick = () => { cleanup(); callback(true); };
      btnNo.focus();
    }
    backdrop.classList.add('active');
    function cleanup() {
      backdrop.classList.remove('active');
      btnNo.onclick = null;
      btnYes.onclick = null;
      btnNo.style.display = '';
      btnYes.textContent = 'Confirm';
      btnNo.textContent = 'Cancel';
    }
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
    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span class="undo-message">${msg}</span>
      <button class="undo-btn">UNDO</button>
    `;
    document.body.appendChild(toast);

    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.onclick = function () {
      document.body.removeChild(toast);
      if (onUndo) onUndo();
    };

    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
        if (onExpire) onExpire();
      }
    }, 8000); // Timeout set to 8 seconds
  }

  // --- AddItem function: must be inside DOMContentLoaded after showInputModal ---
  function addItem(cat) {
    showInputModal('Add new item:', 'Enter item name', function (name) {
      if (!name) return;
      // Trim leading/trailing spaces and collapse multiple spaces
      const trimmedName = name.trim().replace(/\s+/g, ' ');
      if (!trimmedName) return;
      // Update UI and local data instantly
      if (!groceryData[cat]) groceryData[cat] = {};
      const items = groceryData[cat];
      // Only use keys that are actual items (not 'order' or undefined/null)
      const existingKeys = Object.keys(items)
        .filter(key => key !== 'order' && items[key] && typeof items[key] === 'object' && typeof items[key].name === 'string');
      const existingNames = existingKeys
        .map(key => items[key].name.trim().replace(/\s+/g, ' ').toLowerCase());
      if (existingNames.includes(trimmedName.toLowerCase())) {
        showModal(`Item "${trimmedName}" already exists in this table.`, () => {});
        return;
      }
      // Find next available item key (handle both item1, item2, ... and -item1, -item2, ...)
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
      groceryData[cat][nextKey] = item;
      // Ensure order array exists and is clean
      if (!Array.isArray(groceryData[cat].order)) groceryData[cat].order = [];
      // Remove any undefined/null/invalid keys from order
      groceryData[cat].order = groceryData[cat].order.filter(
        k => typeof k === "string" && groceryData[cat][k] && typeof groceryData[cat][k] === 'object' && typeof groceryData[cat][k].name === 'string'
      );
      groceryData[cat].order.push(nextKey);
      renderList(cat);

      // Update DB in background
      setTimeout(() => {
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${nextKey}`).set(item);
        // Clean order before saving to DB
        const cleanOrder = groceryData[cat].order.filter(
          k => typeof k === "string" && groceryData[cat][k] && typeof groceryData[cat][k] === 'object' && typeof groceryData[cat][k].name === 'string'
        );
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(cleanOrder);
      }, 0);
    });
  }

  // --- Globals ---
  let moveDeleteMode = false; // Ensure this is declared only once
  let originalKeyOrder = {};
  let groceryData = {};
  let tableNames = {};
  let categories = [];
  let USER_LIST_KEY = null;
  let updateTimeouts = {}; // Store timeouts for delayed database updates

  // --- Make these available globally ---
  window.groceryData = groceryData;
  window.tableNames = tableNames;
  window.categories = categories;

  // --- Get Header Class Based on Table Name ---
  function getHeaderClass(catKey) {
    const colorMap = {
      veggies: "veggies-header",
      grocery: "grocery-header",
      indian: "indian-header",
      kmart_bigw_target: "kmart_bigw_target-header",
      pharmacy: "pharmacy-header",
      others: "others-header",
      mobr: "mobr-header", // Add mobr table header class
    };
    return colorMap[catKey] || "default-header"; // Default header for unknown categories
  }

  // --- Add New Table ---
  document.getElementById('add-table-btn-main').onclick = function () {
    showInputModal('New Store Name:', '', function (storeName) {
      if (!storeName) return;
      // Trim leading/trailing spaces and collapse multiple spaces
      const trimmedStoreName = storeName.trim().replace(/\s+/g, ' ');
      if (!trimmedStoreName) return;
      const catKey = trimmedStoreName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}`).set({ order: [] })
        .catch(handleFirebaseError);
      db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${catKey}`).set(trimmedStoreName)
        .catch(handleFirebaseError);
      db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).once('value')
        .then(snap => {
          let order = snap.val() || [];
          if (!order.includes(catKey)) {
            order.push(catKey);
            db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(order)
              .catch(handleFirebaseError);
          }
        })
        .catch(handleFirebaseError);

      // Ensure the new table is uncollapsed
      localStorage.setItem('col-' + catKey, 'false');

      showInputModal('First item name:', '', function (itemName) {
        if (!itemName) return;
        const trimmedItemName = itemName.trim().replace(/\s+/g, ' ');
        if (!trimmedItemName) return;
        const nextKey = `item1`;
        const item = { name: trimmedItemName, count: 0, checked: false };
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}/${nextKey}`).set(item)
          .catch(handleFirebaseError);
      });
    });
  };

  // --- Collapse/Expand Tables ---
  function toggleCollapse(cat) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    // Use container to find the arrow, fallback to document if not found
    let arrow = null;
    if (container) {
      arrow = container.querySelector('.collapse-arrow');
    }
    if (!arrow) {
      arrow = document.getElementById(`${cat}-arrow`);
    }
    const addBtn = container ? container.querySelector('.add-table-btn') : null;
    // Defensive: Only proceed if all required elements exist
    if (!container || !ul || !arrow) return;
    const collapsed = container.classList.toggle('collapsed');
    if (collapsed) {
      ul.style.display = 'none';
      arrow.classList.add('collapsed');
      localStorage.setItem('col-' + cat, 'true');
      if (addBtn) addBtn.style.display = 'none';
    } else {
      ul.style.display = '';
      arrow.classList.remove('collapsed');
      localStorage.setItem('col-' + cat, 'false');
      if (addBtn) addBtn.style.display = ''; // Ensure button is visible when expanded
    }
  }

  // --- Set Collapsed State ---
  function setCollapsed(cat, collapsed) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    const arrow = container.querySelector('.collapse-arrow');
    const addBtn = container ? container.querySelector('.add-table-btn') : null;
    if (!container || !ul || !arrow) return;
    if (collapsed) {
      container.classList.add('collapsed');
      ul.style.display = 'none';
      arrow.classList.add('collapsed');
      if (addBtn) addBtn.style.display = 'none';
    } else {
      container.classList.remove('collapsed');
      ul.style.display = '';
      arrow.classList.remove('collapsed');
      if (addBtn) addBtn.style.display = ''; // Ensure button is visible when expanded
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

  // --- Render Grocery Tables ---
  function renderAllTables() {
    const area = document.getElementById('tables-area');
    area.innerHTML = ''; // Clear existing content

    const order = Array.isArray(tableOrder) && tableOrder.length ? tableOrder : categories;
    order.forEach((cat, idx) => {
      const container = document.createElement('div');
      container.className = 'container';
      container.id = `${cat}-container`;

      const header = document.createElement('div');
      header.className = `header ${getHeaderClass(cat)}`;
      header.innerHTML = `
        <span class="header-title" data-cat="${cat}">${tableNames[cat] || cat}</span>
        <span class="header-count" id="${cat}-count"></span>
        ${
          moveDeleteMode
            ? `
          <button class="table-delete-btn" onclick="deleteTable('${cat}')">
            <span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28" width="18" height="18">
                <path stroke="#e53935" stroke-width="2.2" d="M6 8h16M12 12v7m4-7v7M6 8l1.2 13a2.2 2.2 0 0 0 2.2 2h8.4a2.2 2.2 0 0 0 2.2-2L22 8m-10-3h4a2 2 0 0 1 2 2v0H10v0a2 2 0 0 1 2-2z"/>
              </svg>
            </span>
          </button>
          <span class="table-move-handle" title="Drag to reorder table">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22">
              <g>
                <path d="M16 7v18" stroke="#666" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M10 13l6-6 6 6" stroke="#666" stroke-width="2.2" stroke-linecap="round" fill="none"/>
                <path d="M10 19l6 6 6-6" stroke="#666" stroke-width="2.2" stroke-linecap="round" fill="none"/>
              </g>
            </svg>
          </span>
        `
            : ''
        }
        <span class="collapse-arrow">&#9654;</span>
      `;
      // Only collapse/expand if not double-clicking the title
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

      if (localStorage.getItem('col-' + cat) === 'true') setCollapsed(cat, true);

      renderList(cat);
      updateHeaderCount(cat); // Update header count after rendering list
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
        input.style.fontSize = '1.05rem';
        input.style.fontWeight = '700';
        input.style.borderRadius = '6px';
        input.style.padding = '2px 7px';
        input.style.margin = '0 2px';
        input.style.width = '80%';
        this.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
          let newName = input.value.trim();
          if (!newName) newName = oldName;
          tableNames[cat] = newName;
          renderAllTables();
          db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).set(newName);
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
            db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(newOrder);
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

  // --- Render List ---
  // Accepts optional forceCheckZerosSort param for temporary UI sorting
  function renderList(cat, forceCheckZerosSort = false) {
    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = ''; // Clear existing content

    const items = groceryData[cat] || {};
    // --- FIX: Merge order array with all valid keys in the object ---
    let keys = Array.isArray(items.order) ? [...items.order] : [];
    // Add any missing keys that are valid items but not in order
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

    // --- Optional: Heal the order array in DB if needed ---
    // Only do this if order is missing keys or has extra/invalid keys
    const validKeys = keys.filter(k => items[k] && typeof items[k].name === 'string');
    if (
      Array.isArray(items.order) &&
      (items.order.length !== validKeys.length ||
        items.order.some(k => !validKeys.includes(k)) ||
        validKeys.some(k => !items.order.includes(k)))
    ) {
      groceryData[cat].order = validKeys;
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(validKeys);
    }

    // UI-only sort: items with count > 0 (to buy) at top, count == 0 at bottom, preserving original order within groups
    let displayOrder = keys;
    let doTempSort = forceCheckZerosSort || (window._checkZerosSortFlags && window._checkZerosSortFlags[cat]);
    if (doTempSort) {
      const toBuy = [];
      const zero = [];
      keys.forEach(key => {
        const item = items[key];
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
        if ((item.count || 0) > 0) {
          toBuy.push(key);
        } else {
          zero.push(key);
        }
      });
      displayOrder = toBuy.concat(zero);
      // --- Do NOT clear the flag here! ---
      // The sort flag will persist until user manually changes the list.
    }

    displayOrder.forEach(key => {
      const item = items[key];
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;

      const li = document.createElement('li');
      li.dataset.key = key;
      li.style.background = item.checked ? '#f1f1f1' : item.count > 0 ? '#FFF8D6' : '#fff';
      li.style.color = item.checked ? '#444' : item.count > 0 ? '#b26a00' : '';
      li.style.opacity = item.checked ? '0.77' : '';
      li.style.textDecoration = item.checked ? 'line-through' : '';

      li.innerHTML = `
        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecked('${cat}', '${key}', this.checked)">
        <div class="name" title="Alt+Click to edit item name" data-cat="${cat}" data-key="${key}">${item.name}</div>
        ${moveDeleteMode ? `
          <button class="item-delete-btn" onclick="deleteItem('${cat}', '${key}')">
            <span style="background:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28" width="18" height="18">
                <path stroke="#e53935" stroke-width="2.2" d="M6 8h16M12 12v7m4-7v7M6 8l1.2 13a2.2 2.2 0 0 0 2.2 2h8.4a2.2 2.2 0 0 0 2.2-2L22 8m-10-3h4a2 2 0 0 1 2 2v0H10v0a2 2 0 0 1 2-2z"/>
            </svg>
            </span>
          </button>
          <span class="item-move-handle" style="margin-left:8px; display:inline-flex; align-items:center; cursor:grab;">
            <!-- Double arrow up/down SVG -->
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M10 3L6 7h8l-4-4zM10 17l4-4H6l4 4z" fill="#666"/>
            </svg>
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
        input.style.fontSize = '1.1rem';
        input.style.fontWeight = '700';
        input.style.borderRadius = '6px';
        input.style.padding = '2px 7px';
        input.style.margin = '0 2px';
        input.style.width = '90%';
        this.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
          let newName = input.value.trim();
          if (!newName) newName = oldName;
          groceryData[cat][key].name = newName;
          renderList(cat);
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}/name`).set(newName);
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
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
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
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked });
    }, 0);

    updateHeaderCount(cat);
  }

  // --- Update Count ---
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

    // Debounced DB update (but UI is already updated)
    if (updateTimeouts[key]) clearTimeout(updateTimeouts[key]);
    updateTimeouts[key] = setTimeout(() => {
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: newCount });
      delete updateTimeouts[key];
    }, 1000);

    // No need to call updateHeaderCount(cat) here, as renderList already does it
  }

  // --- Delete Item ---
  // Make deleteItem globally accessible for inline onclick
  function deleteItem(cat, key) {
    const backupItem = groceryData[cat][key];
    const backupOrder = Array.isArray(groceryData[cat].order) ? [...groceryData[cat].order] : [];
    delete groceryData[cat][key];
    if (Array.isArray(groceryData[cat].order)) {
      groceryData[cat].order = groceryData[cat].order.filter(k => k !== key);
    }
    renderList(cat);

    // Show undo toast for 5 seconds
    const undoToast = document.createElement('div');
    undoToast.className = 'undo-toast';
    undoToast.innerHTML = `
      <span class="undo-message">Item "${backupItem.name}" deleted.</span>
      <button class="undo-btn">UNDO</button>
    `;
    document.body.appendChild(undoToast);

    let undoTimeout = setTimeout(() => {
      // After 5 seconds, delete from DB
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).remove();
      // Clean order array before saving to DB to avoid undefined keys
      const cleanOrder = Array.isArray(groceryData[cat].order)
        ? groceryData[cat].order.filter(k => groceryData[cat][k])
        : [];
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(cleanOrder);
      document.body.removeChild(undoToast);
    }, 5000);

    undoToast.querySelector('.undo-btn').onclick = () => {
      clearTimeout(undoTimeout);
      groceryData[cat][key] = backupItem;
      groceryData[cat].order = backupOrder;
      renderList(cat);
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).set(backupItem);
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(backupOrder);
      document.body.removeChild(undoToast);
    };
  }
  window.deleteItem = deleteItem;

  // --- Delete Table ---
  // Make deleteTable globally accessible for inline onclick
  function deleteTable(cat) {
    const displayName = tableNames[cat] || cat;
    const backupTable = {
      groceryLists: groceryData[cat],
      tableName: tableNames[cat],
      tableOrder: Array.isArray(tableOrder) ? [...tableOrder] : []
    };

    // Immediately hide table from UI (remove from local data and re-render)
    delete groceryData[cat];
    tableOrder = tableOrder.filter(k => k !== cat);
    renderAllTables();

    // Show undo toast for 5 seconds (like item delete)
    const undoToast = document.createElement('div');
    undoToast.className = 'undo-toast';
    undoToast.innerHTML = `
      <span class="undo-message">Table "${displayName}" deleted.</span>
      <button class="undo-btn">UNDO</button>
    `;
    document.body.appendChild(undoToast);

    let undoTimeout = setTimeout(() => {
      // After 5 seconds, delete from DB
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
      db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).remove();
      db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
        let orderArr = snap.val() || [];
        orderArr = orderArr.filter(k => k !== cat);
        db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(orderArr);
      });
      document.body.removeChild(undoToast);
    }, 5000);

    undoToast.querySelector('.undo-btn').onclick = () => {
      clearTimeout(undoTimeout);
      // Restore in local data and UI
      groceryData[cat] = backupTable.groceryLists;
      tableNames[cat] = backupTable.tableName;
      tableOrder = backupTable.tableOrder;
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`).set(backupTable.groceryLists);
      db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).set(backupTable.tableName);
      db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(backupTable.tableOrder);
      renderAllTables();
      document.body.removeChild(undoToast);
    };
  }
  window.deleteTable = deleteTable;

  // --- Reset All Button ---
  document.getElementById('static-reset-btn').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;
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
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: 0, checked: false });
            }
          });
        });
      }, 0);
    });
  };

  // --- Move/Delete Toggle Button ---
  document.getElementById('move-delete-toggle').onclick = function () {
    moveDeleteMode = !moveDeleteMode;
    this.textContent = moveDeleteMode ? 'Done' : 'Move or Delete';
    // Add a console log for debugging
    console.log('Move/Delete mode toggled:', moveDeleteMode);
    renderAllTables();
  };

  // --- Collapse All Tables Button ---
  document.getElementById('collapse-all-btn')?.addEventListener('click', function () {
    categories.forEach(cat => {
      localStorage.setItem('col-' + cat, 'true');
      setCollapsed(cat, true);
    });
  });

  // --- Check Zeros Button ---
  document.getElementById('check-zeros-btn').onclick = function () {
    if (!window._checkZerosSortFlags) window._checkZerosSortFlags = {};
    // 1. Update all local data instantly: check all items with count == 0
    categories.forEach(cat => {
      const items = groceryData[cat] || {};
      let changed = false;
      Object.keys(items).forEach(key => {
        if (key !== "order") {
          const item = items[key];
          if (item && (item.count || 0) === 0 && !item.checked) {
            groceryData[cat][key].checked = true;
            changed = true;
          }
        }
      });
      window._checkZerosSortFlags[cat] = true;
      // Always render to apply sort and checked state
      // (forceCheckZerosSort ensures the UI sort is applied)
      renderList(cat, true);
    });
    // 2. Update DB in the background (batch)
    setTimeout(() => {
      categories.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.keys(items).forEach(key => {
          if (key !== "order") {
            const item = items[key];
            // Always update checked for count==0 items (even if already checked)
            if (item && (item.count || 0) === 0) {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked: true });
            }
          }
        });
      });
    }, 0);
  };

  // --- Error Handling ---
  function handleFirebaseError(error) {
    console.error("Firebase error:", error);
    const errorMsg = error && error.message ? error.message : "Unknown error occurred.";
    showModal(`Error: ${errorMsg}`, null); // Display error in a modal
  }

  // Make toggleChecked and updateCount globally accessible
  window.toggleChecked = toggleChecked;
  window.updateCount = updateCount;

  // Add this at the end of your DOMContentLoaded handler:
  const style = document.createElement('style');
  style.innerHTML = `
    .item-move-handle {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      cursor: grab;
      background: #f5f5f5;
      border: 2px solid #888;
      border-radius: 6px;
      width: 32px;
      height: 32px;
      min-width: 32px;
      min-height: 32px;
      margin-left: 8px;
      box-sizing: border-box;
      transition: border-color 0.2s, background 0.2s;
    }
    .item-move-handle svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: #444;
      stroke: #444;
    }
    .item-move-handle:active, .item-move-handle:focus {
      border-color: #1976d2;
      background: #e3f2fd;
    }
    .counter {
      display: flex;
      align-items: center;
      background: #f6f6f6;
      border-radius: 16px;
      padding: 1px 2px;
      min-width: 54px;
      justify-content: flex-end;
      margin-left: auto;
      margin-right: 0;
      gap: 2px;
    }
    .counter button {
      width: 20px;
      height: 20px;
      min-width: 20px;
      min-height: 20px;
      border-radius: 4px;
      border: 1.5px solid #90caf9;
      background: #90caf9;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 700;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      transition: background 0.2s, border-color 0.2s;
      touch-action: manipulation;
    }
    .counter button:active {
      background: #42a5f5;
      border-color: #1976d2;
    }
    .counter .count {
      font-size: 0.98rem;
      font-weight: 500;
      margin: 0 2px;
      min-width: 14px;
      text-align: center;
      color: #222;
    }
    li {
      display: flex;
      align-items: center;
      padding: 8px 6px 8px 6px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 1rem;
      min-height: 44px;
      background: #fff;
      transition: background 0.2s;
      word-break: break-word;
    }
    .name {
      flex: 1 1 auto;
      margin: 0 6px 0 8px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Responsive for mobile */
    @media (max-width: 600px) {
      .item-move-handle {
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        border-radius: 5px;
      }
      .item-move-handle svg {
        width: 15px;
        height: 15px;
      }
      .counter {
        min-width: 44px;
        padding: 1px 1px;
        gap: 1px;
      }
      .counter button {
        width: 18px;
        height: 18px;
        min-width: 18px;
        min-height: 18px;
        font-size: 0.9rem;
        border-radius: 3px;
      }
      .counter .count {
        font-size: 0.95rem;
        margin: 0 1px;
      }
      li {
        font-size: 0.98rem;
        min-height: 40px;
        padding: 7px 4px;
      }
      .name {
        margin: 0 4px 0 6px;
      }
    }
  `;
  document.head.appendChild(style);
}); 
