const defaultData = {
  grocery: [
    "केले", "Chicken Ng.", "लाल सेब", "हरे सेब", "Dish. Ringe.", "Pears",
    "Dish Tablets", "Avocado", "Dish. Liquid", "संतरे for जूस", "Woolwash",
    "संतरे (Kunal)", "Pre-wash", "अंगूर", "Detergent", "गाजर", "Bin bags",
    "प्याज", "Beetroot", "Potato", "Chicken", "Kids Snack", "Sugar",
    "Hard Butter", "Eggs", "Pizza Cheese", "Bread", "Soft Butter",
    "Pizza Base", "Full Cr. Milk", "Buns", "Coconut", "Yakult"
  ],
  veggies: [
    "टमाटर", "खीरा", "भिंडी", "शिमला मिर्च", "नींबू", "लोकी", "अदरक", "लहसुन",
    "पालक", "Beans", "हरा धनिया", "Broccoli", "पुदीना", "Corn", "मेथी",
    "पपीता", "बैंगन", "Kiwi", "कद्दू", "शकरकंदी", "तरबूज", "प्याज"
  ],
  indian: [
    "आटा", "राई", "चावल", "दलिया", "पोहा", "बेसन", "दाल", "सरसों तेल"
  ]
};

function loadData(tableId, items) {
  const saved = JSON.parse(localStorage.getItem(tableId) || 'null');
  const list = saved || items.map(text => ({ text, count: 1, done: false }));
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';
  list.forEach(item => addRow(tableId, item.text, item.count, item.done));
}

function addRow(tableId, text = '', count = 1, done = false) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  const tr = document.createElement('tr');
  if (done) tr.classList.add('completed');

  const td = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = done;
  checkbox.addEventListener('change', () => {
    tr.classList.toggle('completed', checkbox.checked);
    saveTable(tableId);
  });

  const counter = document.createElement('div');
  counter.className = 'counter';

  const minus = document.createElement('button');
  minus.textContent = '−';
  minus.onclick = () => {
    if (input.value > 1) input.value--;
    saveTable(tableId);
  };

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '50';
  input.value = count;
  input.className = 'count-input';
  input.addEventListener('input', () => saveTable(tableId));

  const plus = document.createElement('button');
  plus.textContent = '+';
  plus.onclick = () => {
    if (input.value < 50) input.value++;
    saveTable(tableId);
  };

  counter.append(minus, input, plus);

  const editable = document.createElement('input');
  editable.type = 'text';
  editable.value = text;
  editable.addEventListener('input', () => saveTable(tableId));
  editable.addEventListener('keydown', e => {
    if (e.key === 'Enter' && editable.value.trim() && tr.nextSibling === null) {
      addRow(tableId);
      setTimeout(() => {
        tr.nextSibling.querySelector('input[type=text]').focus();
      }, 100);
    }
  });

  const del = document.createElement('button');
  del.className = 'delete-row';
  del.textContent = '×';
  del.onclick = () => {
    if (confirm('Delete this item?')) {
      tr.remove();
      saveTable(tableId);
    }
  };

  td.append(checkbox, counter, editable, del);
  tr.appendChild(td);
  tbody.appendChild(tr);
}

function saveTable(tableId) {
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  const data = Array.from(rows).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      text: inputs[2].value,
      count: parseInt(inputs[1].value),
      done: inputs[0].checked
    };
  });
  localStorage.setItem(tableId, JSON.stringify(data));
}

["grocery", "veggies", "indian"].forEach(id => loadData(id, defaultData[id]));

document.getElementById('toggleAll').addEventListener('click', () => {
  if (!confirm("Are you sure you want to check/uncheck all?")) return;
  const all = document.querySelectorAll('tbody input[type=checkbox]');
  const anyUnchecked = Array.from(all).some(cb => !cb.checked);
  all.forEach(cb => {
    cb.checked = anyUnchecked;
    cb.dispatchEvent(new Event('change'));
  });
});
