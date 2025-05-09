
document.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    const active = document.activeElement;
    if (active && active.classList.contains('item-name')) {
      event.preventDefault();
      if (active.textContent.trim() === '') {
        const currentRow = active.closest('tr');
        const newRow = currentRow.cloneNode(true);
        newRow.querySelector('.item-name').textContent = '';
        newRow.querySelector('.counter').textContent = '1';
        newRow.querySelector('.item-checkbox').checked = false;
        newRow.classList.remove('checked');
        currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
        const newEditable = newRow.querySelector('.item-name');
        setTimeout(() => {
          newEditable.focus();
        }, 10);
      }
    }
  }
});
