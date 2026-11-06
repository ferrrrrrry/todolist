import {
  STORAGE_KEY,
  FILTERS,
  addTask,
  toggleTask,
  renameTask,
  removeTask,
  insertTask,
  clearDone,
  toggleAll,
  stats,
  parseTasks,
  loadTasks,
  saveTasks,
} from './store.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  today: $('#today'),
  form: $('#add-form'),
  input: $('#add-input'),
  list: $('#list'),
  empty: $('#empty'),
  emptyTitle: $('#empty-title'),
  emptyText: $('#empty-text'),
  toolbar: $('#toolbar'),
  filters: document.querySelectorAll('.filter'),
  counts: document.querySelectorAll('[data-count]'),
  toggleAll: $('#toggle-all'),
  clearDone: $('#clear-done'),
  progressValue: $('#progress-value'),
  progressBar: $('#progress-bar'),
  progressFill: $('#progress-fill'),
  toast: $('#toast'),
  toastText: $('#toast-text'),
  toastUndo: $('#toast-undo'),
  themeToggle: $('#theme-toggle'),
  template: $('#task-template'),
};

const EMPTY_STATES = {
  all: ['Список пуст', 'Добавьте первую задачу — она сохранится даже после перезагрузки.'],
  active: ['Всё сделано', 'Активных задач нет. Можно выдохнуть.'],
  done: ['Пока ничего не готово', 'Отмечайте задачи галочкой — они появятся здесь.'],
};

const state = {
  tasks: loadTasks(),
  filter: filterFromHash(),
  editingId: null,
  enteringId: null,
  undo: null,
};

let toastTimer = null;

function filterFromHash() {
  const name = location.hash.replace('#/', '');
  return name in FILTERS ? name : 'all';
}

function commit(nextTasks) {
  state.tasks = nextTasks;
  saveTasks(state.tasks);
  render();
}

function pluralize(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/* ---------- Отрисовка ---------- */

function renderTask(task) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const checkbox = node.querySelector('.task__checkbox');
  const title = node.querySelector('.task__title');
  const edit = node.querySelector('.task__edit');

  node.dataset.id = task.id;
  node.classList.toggle('task--done', task.done);
  if (task.id === state.enteringId) node.classList.add('task--enter');

  checkbox.checked = task.done;
  checkbox.setAttribute('aria-label', `Отметить «${task.title}» выполненной`);
  title.textContent = task.title; // textContent — защита от XSS
  title.title = 'Двойной клик — редактировать';

  node.querySelector('.task__edit-btn').setAttribute('aria-label', `Редактировать «${task.title}»`);
  node.querySelector('.task__delete').setAttribute('aria-label', `Удалить «${task.title}»`);

  if (task.id === state.editingId) {
    node.classList.add('task--editing');
    title.hidden = true;
    edit.hidden = false;
    edit.value = task.title;
    edit.setAttribute('aria-label', 'Новое название задачи');
  }
  return node;
}

function render() {
  const { total, done, active } = stats(state.tasks);
  const visible = state.tasks.filter(FILTERS[state.filter]);

  els.list.replaceChildren(...visible.map(renderTask));
  state.enteringId = null;

  const editInput = els.list.querySelector('.task--editing .task__edit');
  if (editInput) {
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
  }

  const isEmpty = visible.length === 0;
  els.empty.hidden = !isEmpty;
  if (isEmpty) {
    const [title, text] = EMPTY_STATES[state.filter];
    els.emptyTitle.textContent = title;
    els.emptyText.textContent = text;
  }

  els.filters.forEach((btn) => {
    const selected = btn.dataset.filter === state.filter;
    btn.classList.toggle('filter--active', selected);
    btn.setAttribute('aria-selected', String(selected));
  });
  const counts = { total, done, active };
  els.counts.forEach((el) => (el.textContent = counts[el.dataset.count]));

  els.toolbar.hidden = total === 0;
  els.clearDone.disabled = done === 0;
  els.toggleAll.textContent = total > 0 && active === 0 ? 'Снять отметки' : 'Отметить все';

  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressFill.style.width = `${percent}%`;
  els.progressBar.setAttribute('aria-valuenow', String(percent));
  els.progressValue.textContent = total
    ? `${done} из ${total} · ${percent}%`
    : 'Нет задач';

  document.title = active ? `(${active}) Список задач` : 'Список задач';
}

/* ---------- Уведомление с отменой ---------- */

function showToast(text, undo) {
  state.undo = undo;
  els.toastText.textContent = text;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('toast--visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  state.undo = null;
  els.toast.classList.remove('toast--visible');
  setTimeout(() => {
    if (!els.toast.classList.contains('toast--visible')) els.toast.hidden = true;
  }, 250);
}

/* ---------- Действия ---------- */

function handleAdd(event) {
  event.preventDefault();
  const next = addTask(state.tasks, els.input.value);
  if (next === state.tasks) {
    els.form.classList.remove('add--shake');
    void els.form.offsetWidth; // перезапуск анимации
    els.form.classList.add('add--shake');
    els.input.focus();
    return;
  }
  state.enteringId = next[0].id;
  // Новая задача активна — переключаемся, чтобы она не «пропала» во вкладке «Готово».
  if (state.filter === 'done') setFilter('all', false);
  els.input.value = '';
  commit(next);
}

function deleteTask(id) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index === -1) return;
  const task = state.tasks[index];
  const node = els.list.querySelector(`[data-id="${CSS.escape(id)}"]`);

  const finish = () => {
    commit(removeTask(state.tasks, id));
    showToast('Задача удалена', () => commit(insertTask(state.tasks, task, index)));
  };

  if (node && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.classList.add('task--leave');
    node.addEventListener('animationend', finish, { once: true });
  } else {
    finish();
  }
}

function startEdit(id) {
  state.editingId = id;
  render();
}

function finishEdit(input, save) {
  const id = state.editingId;
  if (!id) return;
  state.editingId = null;
  if (save) {
    const before = state.tasks;
    const next = renameTask(state.tasks, id, input.value);
    commit(next);
    if (next.length < before.length) {
      const index = before.findIndex((t) => t.id === id);
      const task = before[index];
      showToast('Пустая задача удалена', () => commit(insertTask(state.tasks, task, index)));
    }
  } else {
    render();
  }
}

function setFilter(name, rerender = true) {
  state.filter = name;
  history.replaceState(null, '', name === 'all' ? location.pathname : `#/${name}`);
  if (rerender) render();
}

/* ---------- Обработчики ---------- */

els.form.addEventListener('submit', handleAdd);
els.form.addEventListener('animationend', () => els.form.classList.remove('add--shake'));

els.list.addEventListener('change', (e) => {
  if (!e.target.matches('.task__checkbox')) return;
  commit(toggleTask(state.tasks, e.target.closest('.task').dataset.id));
});

els.list.addEventListener('click', (e) => {
  const item = e.target.closest('.task');
  if (!item) return;
  if (e.target.closest('.task__delete')) deleteTask(item.dataset.id);
  else if (e.target.closest('.task__edit-btn')) startEdit(item.dataset.id);
});

els.list.addEventListener('dblclick', (e) => {
  if (e.target.closest('.task__title')) startEdit(e.target.closest('.task').dataset.id);
});

els.list.addEventListener('keydown', (e) => {
  if (!e.target.matches('.task__edit')) return;
  if (e.key === 'Enter') finishEdit(e.target, true);
  if (e.key === 'Escape') finishEdit(e.target, false);
});

els.list.addEventListener('focusout', (e) => {
  if (e.target.matches('.task__edit') && state.editingId) finishEdit(e.target, true);
});

els.filters.forEach((btn) => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));

els.toggleAll.addEventListener('click', () => commit(toggleAll(state.tasks)));

els.clearDone.addEventListener('click', () => {
  const before = state.tasks;
  const removed = stats(before).done;
  commit(clearDone(before));
  showToast(
    `Удалено ${removed} ${pluralize(removed, ['задача', 'задачи', 'задач'])}`,
    () => commit(before.map((t) => state.tasks.find((s) => s.id === t.id) ?? t)),
  );
});

els.toastUndo.addEventListener('click', () => {
  const undo = state.undo;
  hideToast();
  undo?.();
});

els.themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('todo-list:theme', next); } catch {}
});

// Горячие клавиши: «/» — фокус на поле ввода, Ctrl/Cmd+Z — отменить удаление.
document.addEventListener('keydown', (e) => {
  const typing = e.target.matches('input, textarea');
  if (e.key === '/' && !typing) {
    e.preventDefault();
    els.input.focus();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing && state.undo) {
    e.preventDefault();
    els.toastUndo.click();
  }
});

// Синхронизация между вкладками: изменения в одной сразу видны в другой.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state.tasks = parseTasks(e.newValue);
  if (!state.tasks.some((t) => t.id === state.editingId)) state.editingId = null;
  render();
});

window.addEventListener('hashchange', () => {
  state.filter = filterFromHash();
  render();
});

els.today.textContent = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());

render();
