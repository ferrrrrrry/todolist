// Чистая логика списка задач: без DOM, поэтому легко тестируется.
// Все функции возвращают новый массив и не мутируют исходный.

export const STORAGE_KEY = 'todo-list:v1';
export const MAX_TITLE_LENGTH = 200;

export const FILTERS = {
  all: () => true,
  active: (task) => !task.done,
  done: (task) => task.done,
};

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function normalizeTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

export function addTask(tasks, rawTitle, now = Date.now()) {
  const title = normalizeTitle(rawTitle);
  if (!title) return tasks;
  return [{ id: createId(), title, done: false, createdAt: now }, ...tasks];
}

export function toggleTask(tasks, id) {
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

export function renameTask(tasks, id, rawTitle) {
  const title = normalizeTitle(rawTitle);
  if (!title) return removeTask(tasks, id);
  return tasks.map((t) => (t.id === id ? { ...t, title } : t));
}

export function removeTask(tasks, id) {
  return tasks.filter((t) => t.id !== id);
}

export function insertTask(tasks, task, index) {
  const next = tasks.filter((t) => t.id !== task.id);
  const at = Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, task);
  return next;
}

export function clearDone(tasks) {
  return tasks.filter((t) => !t.done);
}

export function toggleAll(tasks) {
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  return tasks.map((t) => ({ ...t, done: !allDone }));
}

export function stats(tasks) {
  const done = tasks.filter((t) => t.done).length;
  return { total: tasks.length, done, active: tasks.length - done };
}

function isValidTask(t) {
  return (
    t !== null &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    t.title.trim() !== '' &&
    typeof t.done === 'boolean'
  );
}

// Разбирает сохранённые данные. Битые записи отбрасываются,
// чтобы испорченный localStorage не ломал приложение.
export function parseTasks(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidTask).map((t) => ({
      id: t.id,
      title: normalizeTitle(t.title),
      done: t.done,
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    }));
  } catch {
    return [];
  }
}

export function loadTasks(storage = globalThis.localStorage) {
  try {
    return parseTasks(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveTasks(tasks, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    // Приватный режим или переполненное хранилище: работаем дальше в памяти.
    return false;
  }
}
