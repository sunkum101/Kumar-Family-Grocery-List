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
          // Show error in UI if data is null
          const ul = document.getElementById('allowed-list');
          if (ul) {
            ul.innerHTML = '';
            const li = document.createElement('li');
            li.textContent = "No data found at /authorisedEmails. Check Firebase DB path and rules.";
            li.style.color = "#e53935";
            li.style.textAlign = "center";
            ul.appendChild(li);
          }
          return;
        }
        Object.keys(data).forEach(familyKey => {
          FAMILY_EMAILS[familyKey] = [];
          Object.keys(data[familyKey] || {}).forEach(emailKey => {
            const email = emailKey.replace(/_dot_/g, '.').replace(/_at_/g, '@');
            AUTHORISED_EMAILS[email] = familyKey;
            FAMILY_EMAILS[familyKey].push(email);
            if (data[familyKey][emailKey] && data[familyKey][emailKey].avatar) {
              USER_AVATARS[email] = data[familyKey][emailKey].avatar;
            }
          });
        });
        console.log("Processed AUTHORISED_EMAILS:", AUTHORISED_EMAILS);
        if (typeof callback === "function") callback();
      })
      .catch(function(error) {
        console.error("Error fetching /authorisedEmails:", error);
        const ul = document.getElementById('allowed-list');
        if (ul) {
          ul.innerHTML = '';
          const li = document.createElement('li');
          li.textContent = "Error fetching allowed emails: " + error.message;
          li.style.color = "#e53935";
          li.style.textAlign = "center";
          ul.appendChild(li);
        }
      });
  }

  // --- On page load, fetch allowed emails and render ---
  fetchAuthorisedEmails(renderAllowedList);

  // --- DB Key Utilities ---
  function emailToKey(email) {
    return email.replace(/\./g, '_dot_').replace(/@/g, '_at_');
  }
  function getUserListKey(user) {
    // Use familyKey if present, else fallback to email
    return AUTHORISED_EMAILS[user.email] || emailToKey(user.email);
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
        if (!AUTHORISED_EMAILS[user.email]) {
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

  // --- Render Allowed List from DB ---
  function renderAllowedList() {
    const ul = document.getElementById('allowed-list');
    ul.innerHTML = '';
    // --- Fix: Show a message if no emails are found ---
    const emails = Object.entries(AUTHORISED_EMAILS);
    if (emails.length === 0) {
      const li = document.createElement('li');
      li.textContent = "No authorised emails found. Please check your database.";
      li.style.color = "#e53935";
      li.style.textAlign = "center";
      ul.appendChild(li);
      document.getElementById('google-signin-btn').style.display = "none";
      return;
    }
    emails.forEach(([email, familyKey]) => {
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

      // --- FIX: define selectAllowedEmail before use ---
      li.onclick = function () {
        selectAllowedEmail(email, familyKey, li);
      };
      li.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") selectAllowedEmail(email, familyKey, li);
      };
      ul.appendChild(li);
    });
  }

  // --- FIX: define selectAllowedEmail function ---
  function selectAllowedEmail(email, familyKey, li) {
    selectedEmail = email;
    selectedFamilyKey = familyKey;
    document.querySelectorAll('.allowed-item').forEach(e => {
      e.classList.remove('selected');
    });
    li.classList.add('selected');
    document.getElementById('google-btn-text').textContent = `Sign in as ${email.split('@')[0]}`;
    document.getElementById('google-signin-btn').style.display = "";
    setTimeout(() => { document.getElementById('google-signin-btn').focus(); }, 80);
  }

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
      btnYes.textContent = 'YES';
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
      btnYes.textContent = 'YES';
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

  // --- AddItem function: must be inside DOMContentLoaded after showInputModal ---
  function addItem(cat) {
    showInputModal('Add new item:', 'Enter item name', function (name) {
      if (!name) return;
      const newKey = db.ref().push().key;
      const item = { name: name, count: 0, checked: false };
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${newKey}`).set(item).then(() => {
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).once('value').then(snap => {
          let order = snap.val() || [];
          order.push(newKey);
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(order);
        });
      });
    });
  }

  // --- Globals for move/delete mode ---
  let moveDeleteMode = false;
  let originalKeyOrder = {};

  // --- Remove all hardcoded category arrays/objects ---
  let groceryData = {};
  let tableNames = {};
  let categories = [];
  let USER_LIST_KEY = null;

  // --- Make these available globally ---
  window.groceryData = groceryData;
  window.tableNames = tableNames;
  window.categories = categories;

  // --- Add this function for header class (optional, fallback to default) ---
  function getHeaderClass(catKey, idx) {
    const colorClasses = [
      "veggies-header", "grocery-header", "indian-header",
      "kmart_bigw_target-header", "pharmacy-header", "others-header", "default-header"
    ];
    if (typeof idx === "number") {
      return colorClasses[idx % colorClasses.length];
    }
    return "default-header";
  }

  // --- Subscribe to All Lists ---
  function subscribeAllLists() {
    if (!USER_LIST_KEY) return;
    db.ref(`/userLists/${USER_LIST_KEY}`).on('value', snap => {
      const data = snap.val() || {};
      groceryData = (data.groceryLists || {});
      tableNames = (data.tableNames || {});
      categories = Object.keys(groceryData);
      // --- Table order support ---
      tableOrder = Array.isArray(data.tableOrder) ? data.tableOrder.filter(k => categories.includes(k)) : categories.slice();
      window.groceryData = groceryData;
      window.tableNames = tableNames;
      window.categories = categories;
      window.tableOrder = tableOrder;
      renderAllTables();
    });
  }
  window.subscribeAllLists = subscribeAllLists;

  // --- Render Grocery Tables ---
  let tableOrder = [];
  let tableSortableInstance = null;

  function renderAllTables() {
    const area = document.getElementById('tables-area');
    area.innerHTML = '';
    const order = Array.isArray(tableOrder) && tableOrder.length ? tableOrder : categories;
    order.forEach((cat, idx) => {
      const displayName = tableNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
      const container = document.createElement('div');
      container.className = 'container';
      container.id = `${cat}-container`;
      container.dataset.cat = cat;

      const headerClass = getHeaderClass(cat, idx);
      const header = document.createElement('div');
      header.className = 'header ' + headerClass;
      header.id = `${cat}-header`;

      const headerTitle = document.createElement('span');
      headerTitle.className = 'header-title';
      headerTitle.innerHTML = displayName;
      headerTitle.style.cursor = "pointer";
      headerTitle.title = "Alt+Click to edit table name";

      // --- Alt+Click to edit table name ---
      headerTitle.addEventListener('click', function (e) {
        if (e.altKey) {
          e.stopPropagation();
          editTableHeaderInline(cat, headerTitle);
        }
      });
      header.addEventListener('click', function (e) {
        if (
          (e.target === header || e.target.classList.contains('header')) &&
          e.altKey
        ) {
          e.stopPropagation();
          editTableHeaderInline(cat, headerTitle);
        }
      });

      header.onclick = function (e) {
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
      headerCount.style.marginRight = "18px"; // <-- Add more space after count

      // --- Table Delete Button in Move/Delete Mode (now after count) ---
      let delBtn = null, moveHandle = null;
      if (moveDeleteMode) {
        // Bin icon with white circle background for visibility
        delBtn = document.createElement('button');
        delBtn.className = 'table-delete-btn';
        delBtn.title = 'Delete this table';
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.cursor = 'pointer';
        delBtn.style.display = 'flex';
        delBtn.style.alignItems = 'center';
        delBtn.style.marginLeft = '10px';
        delBtn.innerHTML =
          `<span style="background:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 28 28" width="18" height="18">
              <path stroke="#e53935" stroke-width="2.2" d="M6 8h16M12 12v7m4-7v7M6 8l1.2 13a2.2 2.2 0 0 0 2.2 2h8.4a2.2 2.2 0 0 0 2.2-2L22 8m-10-3h4a2 2 0 0 1 2 2v0H10v0a2 2 0 0 1 2-2z"/>
            </svg>
          </span>`;
        delBtn.onclick = function (e) {
          e.stopPropagation();
          showModal(`Delete table "${displayName}" and all its items?`, function (yes) {
            if (yes) {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
              db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).remove();
              db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
                let orderArr = snap.val() || [];
                orderArr = orderArr.filter(k => k !== cat);
                db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(orderArr);
              });
            }
          });
        };

        // Move icon: 6 dots, gray, with white circle background
        moveHandle = document.createElement('span');
        moveHandle.className = 'table-move-handle';
        moveHandle.title = 'Drag to reorder table';
        moveHandle.style.marginLeft = '8px';
        moveHandle.style.cursor = 'grab';
        moveHandle.style.display = 'flex';
        moveHandle.style.alignItems = 'center';
        moveHandle.innerHTML =
          `<span style="background:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18">
              <circle cx="9" cy="10" r="1.5" fill="#666"/>
              <circle cx="14" cy="10" r="1.5" fill="#666"/>
              <circle cx="19" cy="10" r="1.5" fill="#666"/>
              <circle cx="9" cy="16" r="1.5" fill="#666"/>
              <circle cx="14" cy="16" r="1.5" fill="#666"/>
              <circle cx="19" cy="16" r="1.5" fill="#666"/>
            </svg>
          </span>`;
        container.setAttribute('data-move-handle', 'true');
      }

      const headerArrow = document.createElement('span');
      headerArrow.className = 'collapse-arrow';
      headerArrow.id = `${cat}-arrow`;
      headerArrow.innerHTML = "&#9654;";

      // --- Compose header: title, count, [bin, move], arrow ---
      header.appendChild(headerTitle);
      header.appendChild(headerCount);
      if (moveDeleteMode) {
        header.appendChild(delBtn);
        header.appendChild(moveHandle);
      }
      header.appendChild(headerArrow);

      // --- REMOVE DUPLICATE: Do NOT append any more bin/move icons here ---
      // (Remove the following block if present)
      /*
      if (moveDeleteMode) {
        const delBtn = document.createElement('button');
        delBtn.className = 'table-delete-btn';
        delBtn.title = 'Delete this table';
        delBtn.style.marginLeft = '10px';
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.cursor = 'pointer';
        delBtn.style.color = '#e53935';
        delBtn.style.fontSize = '1.3em';
        delBtn.innerHTML = '🗑️';
        delBtn.onclick = function (e) {
          e.stopPropagation();
          showModal(`Delete table "${displayName}" and all its items?`, function (yes) {
            if (yes) {
              // Remove from DB
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}`).remove();
              db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).remove();
              // Remove from tableOrder
              db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
                let orderArr = snap.val() || [];
                orderArr = orderArr.filter(k => k !== cat);
                db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(orderArr);
              });
            }
          });
        };
        header.appendChild(delBtn);

        // --- Table Move Handle ---
        const moveHandle = document.createElement('span');
        moveHandle.className = 'table-move-handle';
        moveHandle.title = 'Drag to reorder table';
        moveHandle.style.marginLeft = '10px';
        moveHandle.style.cursor = 'grab';
        moveHandle.innerHTML = '⠿';
        header.appendChild(moveHandle);
        container.setAttribute('data-move-handle', 'true');
      }
      */

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
      // --- Hide addBtn if table is collapsed ---
      if (localStorage.getItem('col-' + cat) === 'true') {
        addBtn.style.display = 'none';
      }
      container.appendChild(addBtn);

      area.appendChild(container);

      if (localStorage.getItem('col-' + cat) === 'true') setCollapsed(cat, true);

      renderList(cat);
      updateHeaderCount(cat);
    });

    // --- Table Drag-and-Drop in Move/Delete Mode ---
    if (moveDeleteMode) {
      if (!tableSortableInstance) {
        tableSortableInstance = Sortable.create(area, {
          animation: 180,
          handle: '.table-move-handle',
          draggable: '.container',
          ghostClass: 'dragging',
          onEnd: function (evt) {
            // Save new table order to DB
            const newOrder = [];
            area.querySelectorAll('.container').forEach(div => {
              if (div.dataset.cat) newOrder.push(div.dataset.cat);
            });
            db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(newOrder);
            tableOrder = newOrder;
            renderAllTables();
          }
        });
      }
    } else {
      if (tableSortableInstance) {
        tableSortableInstance.destroy();
        tableSortableInstance = null;
      }
    }
  }

  // --- Collapsing/Expanding Tables ---
  function setCollapsed(cat, collapsed) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    const arrow = document.getElementById(`${cat}-arrow`);
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
      if (addBtn) addBtn.style.display = '';
    }
  }

  function toggleCollapse(cat) {
    const container = document.getElementById(`${cat}-container`);
    const ul = document.getElementById(cat);
    const arrow = document.getElementById(`${cat}-arrow`);
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

  // --- Add New Table & Item ---
  document.getElementById('add-table-btn-main').onclick = function () {
    showInputModal('New Store Name:', '', function (storeName) { // Updated prompt text
      if (!storeName) return;
      const catKey = storeName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}`).set({ order: [] });
      db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${catKey}`).set(storeName.trim());
      db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).once('value').then(snap => {
        let order = snap.val() || [];
        if (!order.includes(catKey)) {
          order.push(catKey);
          db.ref(`/userLists/${USER_LIST_KEY}/tableOrder`).set(order);
        }
      });
      showInputModal('First item name:', '', function (itemName) {
        if (!itemName) return;
        // --- Find next available -itemN key globally ---
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists`).once('value').then(snap => {
          const allLists = snap.val() || {};
          let maxNum = 0;
          Object.values(allLists).forEach(store => {
            Object.keys(store).forEach(key => {
              const match = key.match(/^-item(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
              }
            });
          });
          const nextKey = `-item${maxNum + 1}`;
          const item = { name: itemName, count: 0, checked: false };
          db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}/${nextKey}`).set(item).then(() => {
            db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}/order`).once('value').then(snap => {
              let order = snap.val() || [];
              order.push(nextKey);
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${catKey}/order`).set(order);
            });
          });
        });
      });
    });
  };

  // --- Render List ---
  function renderList(cat) {
    const ul = document.getElementById(cat);
    if (!ul) return;
    ul.innerHTML = '';
    let items = groceryData[cat] || {};
    let keys = [];

    // Always show all items, even if order is missing or incomplete
    if (Array.isArray(items.order)) {
      // Use order, but add any extra keys not in order
      keys = items.order.filter(key => typeof items[key] === 'object');
      const extra = Object.keys(items).filter(k => k !== "order" && !items.order.includes(k));
      keys = keys.concat(extra);
    } else {
      // No order array, just show all keys except "order"
      keys = Object.keys(items).filter(k => k !== "order");
    }

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
      name.title = "Alt+Click to edit item name";

      // --- Alt+Click to edit item name ---
      name.addEventListener('click', function (e) {
        if (e.altKey) {
          e.stopPropagation();
          editNameInline(cat, key, name, item);
        }
      });

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
        // Always show at least 0 (not falsy)
        count.textContent = typeof item.count === 'number' ? item.count : 0;
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
        plus.style.fontSize = '1em';      // even smaller font
        plus.style.width = '24px';        // smaller width
        plus.style.height = '24px';       // smaller height
        plus.style.lineHeight = '1em';
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

        // Move icon: 6 dots, gray, with white circle background (same as table)
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
          `<span style="background:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18">
              <circle cx="9" cy="10" r="1.5" fill="#666"/>
              <circle cx="14" cy="10" r="1.5" fill="#666"/>
              <circle cx="19" cy="10" r="1.5" fill="#666"/>
              <circle cx="9" cy="16" r="1.5" fill="#666"/>
              <circle cx="14" cy="16" r="1.5" fill="#666"/>
              <circle cx="19" cy="16" r="1.5" fill="#666"/>
            </svg>
          </span>`;
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

  // --- updateCount function ---
  function updateCount(cat, key, delta) {
    const item = groceryData[cat]?.[key];
    let current = (item && typeof item.count === "number") ? item.count : 0;
    let newCount = current + delta;
    if (newCount < 0) newCount = 0;
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: newCount });
  }

  // --- toggleChecked function ---
  function toggleChecked(cat, key, checked) {
    db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked: !!checked });
  }

  document.getElementById('static-reset-btn').onclick = function () {
    showModal("Reset all counters to 0 and uncheck all items in all tables?", function (yes) {
      if (!yes) return;
      categories.forEach(cat => {
        const items = groceryData[cat] || {};
        Object.entries(items).forEach(([key, item]) => {
          if (key !== "order") {
            setTimeout(() => {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ count: 0, checked: false });
            }, 0);
          }
        });
      });
      setTimeout(() => {
        renderAllTables();
      }, 100);
    });
  };

  document.getElementById('check-zeros-btn').onclick = function () {
    showModal("Do you want to check all 'zero' items (highlight items to buy)?", function (yes) {
      if (!yes) return;
      categories.forEach(cat => {
        const items = groceryData[cat] || {};
        const keys = Object.keys(items).filter(k => k !== "order");
        const aboveZero = [];
        const zero = [];
        keys.forEach(key => {
          const item = items[key];
          if (!item) return;
          if ((item.count || 0) > 0) {
            aboveZero.push(key);
          } else {
            zero.push(key);
            setTimeout(() => {
              db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ checked: true });
            }, 0);
          }
        });
        const newOrder = aboveZero.concat(zero);
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
      });
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

  // --- Main UI ---
  function showMain() {
    document.getElementById('login-bg').style.display = 'none';
    document.getElementById('main-section').style.display = '';
    setLogoutButtonVisible(true);
  }
  window.showMain = showMain;

  function setLogoutButtonVisible(visible) {
    var btn = document.getElementById('logout-btn-top');
    if (btn) btn.style.display = visible ? '' : 'none';
    var mdbtn = document.getElementById('move-delete-toggle');
    if (mdbtn) mdbtn.style.display = visible ? "" : "none";
  }
  window.setLogoutButtonVisible = setLogoutButtonVisible;

  // Auth State
  auth.onAuthStateChanged(user => {
    // Hide login page immediately if user is present
    if (user && AUTHORISED_EMAILS[user.email]) {
      document.getElementById('login-bg').style.display = 'none';
      document.getElementById('main-section').style.display = '';
      setLogoutButtonVisible(true);
      USER_LIST_KEY = AUTHORISED_EMAILS[user.email] || emailToKey(user.email);
      db.ref(`/userLists/${USER_LIST_KEY}`).once('value').then(snap => {
        if (!snap.exists()) {
          db.ref(`/userLists/${USER_LIST_KEY}`).set({
            groceryLists: {},
            tableNames: {}
          });
        }
        showLoggedInEmail(user.email);
        repairAllOrders();
        subscribeAllLists();
      });
    } else {
      // Show login page only if not authorized
      document.getElementById('main-section').style.display = 'none';
      document.getElementById('login-bg').style.display = '';
      setLogoutButtonVisible(false);
      showLoggedInEmail('');
      if (user && !AUTHORISED_EMAILS[user.email]) {
        document.getElementById('login-error').textContent = "Your Google account is not authorised for this app.";
        auth.signOut();
      }
    }
  });

  document.getElementById('collapse-all-btn').onclick = function() {
    categories.forEach(function(cat) {
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

  // --- Repair All Orders ---
  function repairAllOrders() {
    const cats = Array.isArray(categories) ? categories : [];
    cats.forEach(cat => {
      const items = groceryData[cat] || {};
      if (!Array.isArray(items.order)) return;
      let newOrder = [];
      let hasChanged = false;
      items.order.forEach(key => {
        if (items[key]) {
          newOrder.push(key);
        } else {
          hasChanged = true;
        }
      });
      if (hasChanged) {
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/order`).set(newOrder);
      }
    });
  }
  window.repairAllOrders = repairAllOrders;

  // --- Inline Edit Table Header ---
  function editTableHeaderInline(cat, headerTitleEl) {
    const prev = tableNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    showInputModal('Edit table name:', prev, function (newValue) {
      if (typeof newValue !== "string") return;
      const trimmed = newValue.trim();
      if (trimmed && trimmed !== prev) {
        db.ref(`/userLists/${USER_LIST_KEY}/tableNames/${cat}`).set(trimmed, function() {
          // tableNames will be updated by subscribeAllLists
        });
      }
    });
    setTimeout(() => {
      const input = document.getElementById('input-modal-input');
      if (input) {
        input.value = prev;
        input.focus();
        input.setSelectionRange(prev.length, prev.length);
      }
    }, 100);
  }

  // --- Inline Edit Item Name ---
  function editNameInline(cat, key, nameDiv, oldItem) {
    const prevName = oldItem.name;
    showInputModal('Edit item name:', prevName, function (newValue) {
      if (typeof newValue !== "string") return;
      const trimmed = newValue.trim();
      if (!trimmed) return;
      if (trimmed !== prevName) {
        db.ref(`/userLists/${USER_LIST_KEY}/groceryLists/${cat}/${key}`).update({ name: trimmed });
        nameDiv.textContent = trimmed;
      }
    });
    setTimeout(() => {
      const input = document.getElementById('input-modal-input');
      if (input) {
        input.value = prevName;
        input.focus();
        input.setSelectionRange(prevName.length, prevName.length);
      }
    }, 1);
  }
});
