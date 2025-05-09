const MAX_COUNT = 50;

function createRow(item = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const checkbox = document.createElement('div');
  checkbox.className = 'checkbox';
  checkbox.onclick = () => {
    checkbox.classList.toggle('checked');
    row.classList.toggle('checked');
    saveData();
  };

  const counter = document.createElement('div');
  counter.className = 'counter';
  const minus = document.createElement('button');
  minus.textContent = '−';
  const plus = document.createElement('button');
  plus.textContent = '+';
  const count = document.createElement('span');
  count.textContent = '1';

  minus.onclick = () => {
    let val = parseInt(count.textContent);
    if (val > 1) count.textContent = val - 1;
    saveData();
  };
  plus.onclick = () => {
    let val = parseInt(count.textContent);
    if (val < MAX_COUNT) count.textContent = val + 1;
    saveData();
  };

  counter.append(minus, count, plus);

  const input = document.createElement('input');
  input.className = 'item-name';
  input.type = 'text';
  input.value = item;
  input.oninput = saveData;

  const insert = document.createElement('button');
  insert.className = 'insert-btn';
  insert.textContent = '+';
  insert.onclick = () => {
    const newRow = createRow();
    row.parentNode.insertBefore(newRow, row.nextSibling);
    saveData();
  };

  row.append(checkbox, counter, input, insert);
  return row;
}

function saveData() {
  const allTables = document.querySelectorAll('.table');
  const state = [];
  allTables.forEach(table => {
    const rows = Array.from(table.querySelectorAll('.row')).map(row => {
      return {
        checked: row.classList.contains('checked'),
        count: row.querySelector('.counter span').textContent,
        name: row.querySelector('.item-name').value
      };
    });
    state.push({
      title: table.dataset.table,
      rows: rows
    });
  });
  localStorage.setItem('groceryAppData', JSON.stringify(state));
}

function loadData() {
  const data = JSON.parse(localStorage.getItem('groceryAppData') || '[]');
  if (!data.length) {
    document.querySelectorAll('.table').forEach(table => {
      table.appendChild(createRow());
    });
    return;
  }
  data.forEach(tableData => {
    const table = document.querySelector(`.table[data-table="${tableData.title}"]`);
    tableData.rows.forEach(row => {
      const r = createRow(row.name);
      if (row.checked) {
        r.classList.add('checked');
        r.querySelector('.checkbox').classList.add('checked');
      }
      r.querySelector('.counter span').textContent = row.count;
      table.appendChild(r);
    });
  });
}

function toggleAllCheckboxes() {
  const confirmToggle = confirm("Do you want to check/uncheck all? (No = Cancel)");
  if (!confirmToggle) return;

  const allCheckboxes = document.querySelectorAll('.checkbox');
  const allChecked = [...allCheckboxes].every(cb => cb.classList.contains('checked'));
  allCheckboxes.forEach(cb => {
    cb.classList.toggle('checked', !allChecked);
    cb.parentElement.classList.toggle('checked', !allChecked);
  });
  saveData();
}

document.addEventListener('DOMContentLoaded', loadData);