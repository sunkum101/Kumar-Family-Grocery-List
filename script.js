const tableIds = ["Grocery", "Veggies", "IndianStore"];
let data = {};

function saveData() {
  localStorage.setItem("groceryListData", JSON.stringify(data));
}

function loadData() {
  const stored = localStorage.getItem("groceryListData");
  if (stored) data = JSON.parse(stored);
}

function createRow(tableId, item = "", count = 1, checked = false) {
  const tr = document.createElement("tr");
  if (checked) tr.classList.add("checked");

  const td = document.createElement("td");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "item-checkbox";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => {
    tr.classList.toggle("checked", checkbox.checked);
    updateStorage(tableId);
  });

  const minus = document.createElement("button");
  minus.textContent = "−";
  minus.className = "counter-btn";
  minus.onclick = () => {
    if (counter.value > 1) {
      counter.value--;
      updateStorage(tableId);
    }
  };

  const counter = document.createElement("input");
  counter.type = "number";
  counter.value = count;
  counter.min = 1;
  counter.max = 50;
  counter.style.width = "48px";
  counter.style.textAlign = "center";
  counter.onchange = () => updateStorage(tableId);

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.className = "counter-btn";
  plus.onclick = () => {
    if (counter.value < 50) {
      counter.value++;
      updateStorage(tableId);
    }
  };

  const itemName = document.createElement("span");
  itemName.contentEditable = "true";
  itemName.className = "item-name";
  itemName.textContent = item;
  itemName.addEventListener("input", () => updateStorage(tableId));
  itemName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const rows = Array.from(tr.parentElement.children);
      const currentIndex = rows.indexOf(tr);
      if (itemName.textContent.trim() && currentIndex + 1 === rows.length) {
        const newRow = createRow(tableId);
        tr.parentElement.appendChild(newRow);
        setTimeout(() => {
          newRow.querySelector(".item-name").focus();
        }, 10);
      }
    }
  });

  const insertBtn = document.createElement("button");
  insertBtn.className = "insert-btn";
  insertBtn.textContent = "+";
  insertBtn.onclick = () => {
    const newRow = createRow(tableId);
    tr.after(newRow);
    setTimeout(() => {
      newRow.querySelector(".item-name").focus();
    }, 10);
    updateStorage(tableId);
  };

  td.append(checkbox, minus, counter, plus, itemName, insertBtn);
  tr.appendChild(td);
  return tr;
}

function updateStorage(tableId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  const rows = tbody.querySelectorAll("tr");
  data[tableId] = Array.from(rows).map((tr) => {
    const checkbox = tr.querySelector("input[type=checkbox]");
    const counter = tr.querySelector("input[type=number]");
    const itemName = tr.querySelector(".item-name");
    return {
      item: itemName.textContent.trim(),
      count: parseInt(counter.value),
      checked: checkbox.checked
    };
  });
  saveData();
}

function renderTable(tableId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";
  const items = data[tableId] || [];
  items.forEach(({ item, count, checked }) => {
    const row = createRow(tableId, item, count, checked);
    tbody.appendChild(row);
  });
  const finalRow = createRow(tableId);
  tbody.appendChild(finalRow);
}

function toggleAllCheckboxes() {
  if (!confirm("Do you really want to check/uncheck all items?")) return;
  const anyUnchecked = tableIds.some(id =>
    (data[id] || []).some(row => !row.checked)
  );
  tableIds.forEach(tableId => {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
      const checkbox = row.querySelector("input[type=checkbox]");
      checkbox.checked = anyUnchecked;
      row.classList.toggle("checked", anyUnchecked);
    });
    updateStorage(tableId);
  });
}

function init() {
  loadData();

  // Default items if first time
  if (!localStorage.getItem("groceryListData")) {
    data = {
      Grocery: [
        { item: "केले", count: 1, checked: false },
        { item: "Chicken Ng.", count: 1, checked: false },
        { item: "लाल सेब", count: 1, checked: false },
        { item: "हरे सेब", count: 1, checked: false },
        { item: "Dish. Ringe.", count: 1, checked: false },
        { item: "Pears", count: 1, checked: false },
        { item: "Dish Tablets", count: 1, checked: false },
        { item: "Avocado", count: 1, checked: false },
        { item: "Dish. Liquid", count: 1, checked: false },
        { item: "संतरे for जूस", count: 1, checked: false },
        { item: "Woolwash", count: 1, checked: false },
        { item: "संतरे (Kunal)", count: 1, checked: false },
        { item: "Pre-wash", count: 1, checked: false },
        { item: "अंगूर", count: 1, checked: false },
        { item: "Detergent", count: 1, checked: false },
        { item: "गाजर", count: 1, checked: false },
        { item: "Bin bags", count: 1, checked: false },
        { item: "प्याज", count: 1, checked: false },
        { item: "Beetroot", count: 1, checked: false },
        { item: "Potato", count: 1, checked: false },
        { item: "Chicken", count: 1, checked: false },
        { item: "Kids Snack", count: 1, checked: false },
        { item: "Sugar", count: 1, checked: false },
        { item: "Hard Butter", count: 1, checked: false },
        { item: "Eggs", count: 1, checked: false },
        { item: "Pizza Cheese", count: 1, checked: false },
        { item: "Bread", count: 1, checked: false },
        { item: "Soft Butter", count: 1, checked: false },
        { item: "Pizza Base", count: 1, checked: false },
        { item: "Full Cr. Milk", count: 1, checked: false },
        { item: "Buns", count: 1, checked: false },
        { item: "Coconut", count: 1, checked: false },
        { item: "Yakult", count: 1, checked: false },
      ],
      Veggies: [
        { item: "टमाटर", count: 1, checked: false },
        { item: "खीरा", count: 1, checked: false },
        { item: "भिंडी", count: 1, checked: false },
        { item: "शिमला मिर्च", count: 1, checked: false },
        { item: "नींबू", count: 1, checked: false },
        { item: "लोकी", count: 1, checked: false },
        { item: "अदरक", count: 1, checked: false },
        { item: "लहसुन", count: 1, checked: false },
        { item: "पालक", count: 1, checked: false },
        { item: "Beans", count: 1, checked: false },
        { item: "हरा धनिया", count: 1, checked: false },
        { item: "Broccoli", count: 1, checked: false },
        { item: "पुदीना", count: 1, checked: false },
        { item: "Corn", count: 1, checked: false },
        { item: "मेथी", count: 1, checked: false },
        { item: "पपीता", count: 1, checked: false },
        { item: "बैंगन", count: 1, checked: false },
        { item: "Kiwi", count: 1, checked: false },
        { item: "कद्दू", count: 1, checked: false },
        { item: "शकरकंदी", count: 1, checked: false },
        { item: "तरबूज", count: 1, checked: false },
        { item: "प्याज", count: 1, checked: false }
      ],
      IndianStore: [
        { item: "आटा", count: 1, checked: false },
        { item: "राई", count: 1, checked: false },
        { item: "चावल", count: 1, checked: false },
        { item: "दलिया", count: 1, checked: false },
        { item: "पोहा", count: 1, checked: false },
        { item: "बेसन", count: 1, checked: false },
        { item: "दाल", count: 1, checked: false },
        { item: "सरसों तेल", count: 1, checked: false }
      ]
    };
    saveData();
  }

  tableIds.forEach(renderTable);
}

init();
