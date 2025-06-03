// Allowed Users & Avatars
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

function renderAllowedList() {
  const ul = document.getElementById('allowed-list');
  ul.innerHTML = '';
  ALLOWED_USERS.forEach(email => {
    const li = document.createElement('li');
    li.className = 'allowed-item';
    li.tabIndex = 0;
    li.setAttribute('data-email', email);

    // Avatar (from map or initials)
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

// Firebase Setup
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
  provider.setCustomParameters({login_hint: selectedEmail});
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

// Logout Logic
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
  listeners?.forEach(fn => {try {fn();}catch(e){}});
  listeners = [];
  auth.signOut().finally(() => {
    clearAllCookies();
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  });
}
document.getElementById('logout-btn-top').onclick = function() {
  showModal("Are you sure you want to logout?", function(yes) {
    if (yes) logout();
  });
};
function setLogoutButtonVisible(visible) {
  var btn = document.getElementById('logout-btn-top');
  if (btn) btn.style.display = visible ? '' : 'none';
}

// Grocery Logic
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
  "kmart_bigw_target-header","pharmacy-header", "others-header", "default-header"
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
let isReorderMode = false;
let draggedItem = null;
let draggedTable = null;

// Main UI
function showMain() {
  document.getElementById('login-bg').style.display = 'none';
  document.getElementById('main-section').style.display = '';
  setLogoutButtonVisible(true);
}
function updateDateTime() {
  const now = new Date();
  document.getElementById('datetime').textContent =
    now.toLocaleString('en-AU', {weekday:'long',year:'numeric',month:'short',day:'numeric', hour:'2-digit',minute:'2-digit', second:'2-digit', hour12:true});
}
setInterval(updateDateTime, 1000);
updateDateTime();

function subscribeAllLists() {
  listeners.forEach(fn => {try {fn();}catch(e){}});
  listeners = [];
  db.ref(`/groceryLists`).on('value', snap => {
    const data = snap.val() || {};
    groceryData = data;
    Object.entries(data).forEach(([cat, items]) => {
      if (!originalKeyOrder[cat] && items) {
        originalKeyOrder[cat] = Object.keys(items);
      }
    });
    let allKeys = Object.keys(data);
    let ordered = [];
    CATEGORIES.forEach(cat => { if(allKeys.includes(cat)) ordered.push(cat); });
    allKeys.forEach(cat=>{
      if(!ordered.includes(cat)) ordered.push(cat);
    });
    CATEGORIES = ordered;
    renderAllTables();
  });
  CATEGORIES.forEach(cat => {
    const ref = db.ref(`/groceryLists/${cat}`);
    const fn = ref.on('value', snap => {
      groceryData[cat] = snap.val() || {};
      renderList(cat);
      updateHeaderCount(cat);
    });
    listeners.push(() => ref.off('value', fn));
  });
}

// Modals
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
  btnNo.onclick = ()=>{ cleanup(); callback(false); };
  btnYes.onclick = ()=>{ cleanup(); callback(true); };
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

// Table Rendering
function renderAllTables() {
  const area = document.getElementById('tables-area');
  area.innerHTML = '';
  CATEGORIES.forEach((cat, idx) => {
    if (!CATEGORY_NAMES[cat]) CATEGORY_NAMES[cat] = cat.charAt(0).toUpperCase() + cat.slice(1);
    if (!CATEGORY_ICONS[cat]) CATEGORY_ICONS[cat] = '';
    const container = document.createElement('div');
    container.className = 'container';
    container.id = `${cat}-container`;
    container.dataset.category = cat;
    
    // Header
    const headerClass = getHeaderClass(cat, idx);
    const header = document.createElement('div');
    header.className = 'header ' + headerClass;
    header.id = `${cat}-header`;
    header.dataset.category = cat;
    
    // Add drag handle to header
    const headerDragHandle = document.createElement('div');
    headerDragHandle.className = 'drag-handle';
    headerDragHandle.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    header.appendChild(headerDragHandle);
    
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

    // List
    const ul = document.createElement('ul');
    ul.id = cat;
    ul.dataset.category = cat;
    container.appendChild(ul);

    // Add item button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '＋';
    addBtn.onclick = (e)=>{
      e.stopPropagation();
      addItem(cat);
    };
    container.appendChild(addBtn);

    area.appendChild(container);

    if(localStorage.getItem('col-'+cat)==='true') setCollapsed(cat,true);

    renderList(cat);
    updateHeaderCount(cat);
  });
  
  // Setup drag and drop events if in reorder mode
  if (isReorderMode) {
    setupDragAndDrop();
  }
}

function renderList(cat) {
  const ul = document.getElementById(cat);
  if (!ul) return;
  ul.innerHTML = '';

  let items = groceryData[cat] || {};
  let keys = Object.keys(items);

  if (checkZerosActive && originalKeyOrder[cat]) {
    const origOrder = originalKeyOrder[cat].slice();
    keys.sort((a,b)=>{
      const ia = items[a]?.count>0 ? 0 : 1;
      const ib = items[b]?.count>0 ? 0 : 1;
      if (ia !== ib) return ia-ib;
      return origOrder.indexOf(a) - origOrder.indexOf(b);
    });
  } else if (originalKeyOrder[cat]) {
    keys = originalKeyOrder[cat].slice();
  }

  keys.forEach(key => {
    const item = items[key];
    if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
    const li = document.createElement('li');
    li.dataset.key = key;
    li.dataset.category = cat;
    li.setAttribute('draggable', isReorderMode);
    if(item.checked) li.classList.add('checked');
    if(item.count > 0) li.classList.add('has-count');
    li.style.position = 'relative';

    // Add drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    li.appendChild(dragHandle);

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.checked;
    cb.onchange = () => toggleChecked(cat, key, cb.checked);
    li.appendChild(cb);

    // Name (edit on double click)
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    name.ondblclick = (e) => {
      e.stopPropagation();
      editNameInline(cat, key, name, item);
    };
    li.appendChild(name);

    // Counter
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

    ul.appendChild(li);
  });
  
  // Setup drag and drop events if in reorder mode
  if (isReorderMode) {
    setupDragAndDrop();
  }
}

function deleteTable(cat) {
  db.ref(`/groceryLists/${cat}`).remove();
  setTimeout(renderAllTables, 300);
}
function toggleCollapse(cat) {
  const ul = document.getElementById(cat);
  const addBtn = document.querySelector(`#${cat}-container .add-btn`);
  const container = document.getElementById(cat+'-container');
  let collapsed = ul.style.display!=='none';
  setCollapsed(cat, collapsed);
  localStorage.setItem('col-'+cat, collapsed?'true':'');
}
function setCollapsed(cat, collapsed) {
  const ul = document.getElementById(cat);
  const addBtn = document.querySelector(`#${cat}-container .add-btn`);
  const container = document.getElementById(cat+'-container');
  if (!ul || !addBtn || !container) return;
  ul.style.display = collapsed?'none':'';
  addBtn.style.display = collapsed?'none':'';
  container.classList.toggle('collapsed', collapsed);
}

function deleteRow(cat, key) {
  db.ref(`/groceryLists/${cat}/${key}`).remove();
  setTimeout(()=>renderList(cat), 300);
}
function addItem(cat) {
  showInputModal('Enter new item name:', 'e.g. Carrots', function(name) {
    if(!name) return;
    db.ref(`/groceryLists/${cat}`).push({name: name, count: 0, checked: false});
  });
}
function addNewTablePrompt() {
  showInputModal('Enter table name (e.g. Pharmacy):', 'e.g. Pharmacy', function(tname) {
    if(!tname) return;
    tname = tname.trim();
    let catKey = tname.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    if (!catKey) catKey = 'custom_' + Date.now();
    if(CATEGORIES.includes(catKey)) {
      alert('Table already exists!');
      return;
    }
    let items = {};
    showInputModal('Add an item to this table now? (Optional)', 'First item name', function(itemName) {
      if(itemName && itemName.trim()) {
        items = {[db.ref().push().key]: {name:itemName.trim(), count:0, checked:false}};
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
  if(nameDiv.classList.contains('editing')) return;
  const prevName = oldItem.name;
  nameDiv.classList.add('editing');
  nameDiv.setAttribute('contenteditable', 'true');
  nameDiv.setAttribute('spellcheck', 'false');
  nameDiv.style.userSelect = "text";
  nameDiv.focus();
  nameDiv.setSelectionRange && nameDiv.setSelectionRange(prevName.length, prevName.length);

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
  nameDiv.onkeydown = function(e) {
    if (e.key === "Enter") { e.preventDefault(); finishEdit(); }
    if (e.key === "Escape") { nameDiv.textContent = prevName; finishEdit(); }
  };
  nameDiv.onblur = finishEdit;
}

document.getElementById('static-reset-btn').onclick = function() {
  showModal("Reset all counters to 0 and uncheck all items in all tables?", function(yes) {
    if (!yes) return;
    checkZerosActive = false;
    CATEGORIES.forEach(cat=>{
      const items = groceryData[cat] || {};
      Object.entries(items).forEach(([key, item]) => {
        db.ref(`/groceryLists/${cat}/${key}`).update({count:0, checked:false});
      });
    });
    setTimeout(()=>{
      renderAllTables();
    }, 350);
  });
};

document.getElementById('check-zeros-btn').onclick = function() {
  showModal("Do you want to check all 'zero' items (highlight items to buy)?", function(yes) {
    if (!yes) return;
    checkZerosActive = true;
    CATEGORIES.forEach(cat=>{
      const items = groceryData[cat] || {};
      Object.entries(items).forEach(([key, item]) => {
        if(item.count==0 && !item.checked) {
          db.ref(`/groceryLists/${cat}/${key}`).update({checked:true});
        }
      });
    });
    setTimeout(()=>{
      renderAllTables();
    }, 350);
  });
};

function updateHeaderCount(cat){
  const items = groceryData[cat] || {};
  const count = Object.values(items).filter(x=>x && typeof x === "object" && !x.checked && x.count>0).length;
  const el = document.getElementById(cat+'-count');
  if(!el) return;
  if(count>0) {
    el.textContent = count;
    el.className = 'header-count';
  } else {
    el.innerHTML = '<span class="header-check">&#10003;</span>';
    el.className = '';
  }
}

// Reorder mode functionality
document.getElementById('reorder-toggle-btn').onclick = function() {
  isReorderMode = !isReorderMode;
  document.body.classList.toggle('reorder-mode', isReorderMode);
  this.classList.toggle('active', isReorderMode);
  
  if (isReorderMode) {
    setupDragAndDrop();
  } else {
    // Save the new order to Firebase when exiting reorder mode
    saveNewOrder();
  }
  
  renderAllTables();
};

function setupDragAndDrop() {
  if (!isReorderMode) return;
  
  // Setup table drag and drop
  const tables = document.querySelectorAll('.container');
  tables.forEach(table => {
    table.draggable = true;
    
    table.addEventListener('dragstart', (e) => {
      draggedTable = table;
      setTimeout(() => {
        table.classList.add('dragging');
      }, 0);
    });
    
    table.addEventListener('dragend', () => {
      table.classList.remove('dragging');
      draggedTable = null;
    });
  });
  
  // Setup item drag and drop within each table
  const items = document.querySelectorAll('li');
  items.forEach(item => {
    item.draggable = true;
    
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      setTimeout(() => {
        item.classList.add('dragging');
      }, 0);
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
    });
  });
  
  // Setup drop zones for tables
  const tablesArea = document.getElementById('tables-area');
  tablesArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterTable(tablesArea, e.clientY);
    if (afterElement) {
      tablesArea.insertBefore(draggedTable, afterElement);
    } else {
      tablesArea.appendChild(draggedTable);
    }
  });
  
  // Setup drop zones for items
  const lists = document.querySelectorAll('ul');
  lists.forEach(list => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterItem(list, e.clientY);
      if (afterElement) {
        list.insertBefore(draggedItem, afterElement);
      } else {
        list.appendChild(draggedItem);
      }
    });
  });
}

function getDragAfterTable(container, y) {
  const draggableElements = [...container.querySelectorAll('.container:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getDragAfterItem(container, y) {
  const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveNewOrder() {
  // Save table order
  const tablesArea = document.getElementById('tables-area');
  const newTableOrder = Array.from(tablesArea.querySelectorAll('.container'))
    .map(table => table.dataset.category);
  
  // Only update if order changed
  if (JSON.stringify(newTableOrder) !== JSON.stringify(CATEGORIES)) {
    CATEGORIES = newTableOrder;
    // In a real app, you might want to save this order to Firebase
  }
  
  // Save item order for each table
  CATEGORIES.forEach(cat => {
    const ul = document.getElementById(cat);
    if (!ul) return;
    
    const newItemOrder = Array.from(ul.querySelectorAll('li'))
      .map(li => li.dataset.key);
    
    // Only update if order changed
    if (JSON.stringify(newItemOrder) !== JSON.stringify(originalKeyOrder[cat] || [])) {
      originalKeyOrder[cat] = newItemOrder;
      // In a real app, you might want to save this order to Firebase
    }
  });
}

// Auth state change
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

// Initialize add table button
document.getElementById('add-table-btn').onclick = addNewTablePrompt;
