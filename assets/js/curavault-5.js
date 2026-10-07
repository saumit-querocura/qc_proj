document.addEventListener('click', event => {
  const button = event.target.closest('[data-cv-delete]'); if (!button) return;
  const dialog = document.createElement('dialog'); dialog.className = 'cv-review-dialog';
  const title = document.createElement('h2'); title.textContent = 'Delete uploaded record?';
  const message = document.createElement('p'); message.textContent = 'This removes the original, extracted text and lab values derived from this record. Confirmed medicine schedules will continue unless you choose to stop them below.';
  const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; label.append(checkbox, document.createTextNode(' Also stop confirmed medicines linked to this record'));
  const error = document.createElement('p'); error.setAttribute('role','alert');
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.onclick = () => dialog.close();
  const remove = document.createElement('button'); remove.textContent = 'Delete record';
  remove.onclick = async () => { remove.disabled = true; try { const response = await fetch(CV + '/records/' + encodeURIComponent(button.dataset.cvDelete), {method:'DELETE', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({stop_linked_medicines:checkbox.checked})}); const data = await response.json(); if (!response.ok || !data.ok) throw Error(data.error || 'Deletion failed.'); dialog.close(); await loadRecords(); await refreshOverview(); toast('Record deleted.', 'ok'); } catch (e) { error.textContent = e.message; } finally { remove.disabled = false; } };
  dialog.append(title,message,label,error,cancel,remove); dialog.onclose = () => { dialog.remove(); button.focus(); }; document.body.append(dialog); dialog.showModal(); cancel.focus();
});
