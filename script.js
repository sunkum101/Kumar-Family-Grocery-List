document.addEventListener('DOMContentLoaded', function () {
  loadTableData('grocery');
  loadTableData('veggie');
  loadTableData('indianStore');
});

function addRow(tableName) {
  const tableBody = document.getElementById(`${tableName}Body`);
  const newRow = document.createElement('tr');
  newRow.classList.add('new-row');
  newRow.innerHTML = `
    <td><input type="checkbox" onchange="toggleRow(event, '${tableName}')"></td>
    <td><input type="text" placeholder="Item name" oninput="saveData('${tableName}')"></td>
    <td class="counter">
      <button onclick="updateCount(event, 'decrease')">-</button>
      <input type="number" value="1" min="1" max="50" onchange="saveData('${tableName}')">
      <button onclick="updateCount(event, 'increase')">+</button>
    </td>
    <td><button class="delete-row" onclick="deleteRow(event)">×</button></td>
  `;
  tableBody.appendChild(newRow);
  saveData(tableName); // Save new row immediately
}

function updateCount(event, action) {
  const input = event.target.parentElement.querySelector('input[type="number"]');
  let count = parseInt(input.value);
  if (action === 'decrease' && count > 1) {
    count--;
  } else if (action === 'increase' && count < 50) {
    count++;
  }
  input.value = count;
  saveData(event.target.closest('table').id);
}

function deleteRow(event) {
  if (confirm('Are you sure you want to delete this row?')) {
    event.target.closest('tr').remove();
    saveData(event.target.closest('table').id);
  }
}

function toggleRow(event, tableName) {
  const row = event.target.closest('tr');
  row.classList.toggle('completed', event.target.checked);
  saveData(tableName);
}

function toggleAll() {
  if (confirm("Are you sure you want to check/uncheck all items?")) {
    const checkboxes = document.querySelectorAll(`#groceryTable input[type="checkbox"], #veggieTable input[type="checkbox"], #indianStoreTable input[type="checkbox"]`);
    checkboxes.forEach(checkbox => checkbox.checked = !checkbox.checked);
    checkboxes.forEach(checkbox => checkbox.closest('tr').classList.toggle('completed', checkbox.checked));
    saveData('grocery');
    saveData('veggie');
    saveData('indianStore');
  }
}

function saveData(tableName) {
  const tableBody = document.getElementById(`${tableName}Body`);
  const rows = Array.from(tableBody.querySelectorAll('tr'));
  const data = rows.map(row => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    const itemName = row.querySelector('input[type="text"]').value;
    const count = row.querySelector('input[type="number"]').value;
    return {
      checked: checkbox.checked,
      itemName: itemName,
      count: count
    };
  });
  localStorage.setItem(tableName, JSON.stringify(data));
}

function loadTableData(tableName) {
  const data = JSON.parse(localStorage.getItem(tableName));
  if (data) {
    data.forEach(item => {
      const tableBody = document.getElementById(`${tableName}Body`);
      const newRow = document.createElement('tr');
      if (item.checked) {
        newRow.classList.add('completed');
      }
      newRow.innerHTML = `
        <td><input type="checkbox" onchange="toggleRow(event, '${tableName}')" ${item.checked ? 'checked' : ''}></td>
        <td><input type="text" value="${item.itemName}" oninput="saveData('${tableName}')"></td>
        <td class="counter">
          <button onclick="updateCount(event, 'decrease')">-</button>
          <input type="number" value="${item.count}" min="1" max="50" onchange="saveData('${tableName}')">
          <button onclick="updateCount(event, 'increase')">+</button>
        </td>
        <td><button class="delete-row" onclick="deleteRow(event)">×</button></td>
      `;
      tableBody.appendChild(newRow);
    });
  }
}

