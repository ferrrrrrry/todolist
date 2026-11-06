import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  MAX_TITLE_LENGTH,
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

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
};

test('addTask добавляет задачу в начало списка', () => {
  const tasks = addTask(addTask([], 'Первая'), 'Вторая');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, 'Вторая');
  assert.equal(tasks[0].done, false);
  assert.notEqual(tasks[0].id, tasks[1].id);
});

test('addTask игнорирует пустой ввод и чистит пробелы', () => {
  const empty = [];
  assert.equal(addTask(empty, '   '), empty);
  assert.equal(addTask(empty, ''), empty);
  assert.equal(addTask([], '  купить   хлеб ')[0].title, 'купить хлеб');
});

test('addTask обрезает слишком длинный заголовок', () => {
  const [task] = addTask([], 'a'.repeat(500));
  assert.equal(task.title.length, MAX_TITLE_LENGTH);
});

test('toggleTask переключает только нужную задачу и не мутирует массив', () => {
  const tasks = addTask(addTask([], 'A'), 'B');
  const next = toggleTask(tasks, tasks[1].id);
  assert.equal(next[1].done, true);
  assert.equal(next[0].done, false);
  assert.equal(tasks[1].done, false);
  assert.equal(toggleTask(next, tasks[1].id)[1].done, false);
});

test('renameTask меняет название, а пустое название удаляет задачу', () => {
  const tasks = addTask([], 'Старое');
  assert.equal(renameTask(tasks, tasks[0].id, ' Новое ')[0].title, 'Новое');
  assert.equal(renameTask(tasks, tasks[0].id, '  ').length, 0);
});

test('removeTask и insertTask: удаление с восстановлением на прежнее место', () => {
  const tasks = addTask(addTask(addTask([], 'C'), 'B'), 'A');
  const removed = tasks[1];
  const without = removeTask(tasks, removed.id);
  assert.deepEqual(without.map((t) => t.title), ['A', 'C']);
  assert.deepEqual(insertTask(without, removed, 1).map((t) => t.title), ['A', 'B', 'C']);
  assert.equal(insertTask(without, removed, 99).at(-1).title, 'B');
});

test('clearDone, toggleAll и stats', () => {
  let tasks = addTask(addTask(addTask([], 'C'), 'B'), 'A');
  tasks = toggleTask(tasks, tasks[0].id);
  assert.deepEqual(stats(tasks), { total: 3, done: 1, active: 2 });
  assert.equal(clearDone(tasks).length, 2);

  tasks = toggleAll(tasks);
  assert.ok(tasks.every((t) => t.done));
  tasks = toggleAll(tasks);
  assert.ok(tasks.every((t) => !t.done));
  assert.deepEqual(toggleAll([]), []);
});

test('фильтры', () => {
  const [b, a] = addTask(addTask([], 'A'), 'B');
  const tasks = toggleTask([b, a], a.id);
  assert.equal(tasks.filter(FILTERS.all).length, 2);
  assert.deepEqual(tasks.filter(FILTERS.active).map((t) => t.title), ['B']);
  assert.deepEqual(tasks.filter(FILTERS.done).map((t) => t.title), ['A']);
});

test('сохранение и загрузка из хранилища', () => {
  const storage = memoryStorage();
  const tasks = addTask(addTask([], 'A'), 'B');
  assert.equal(saveTasks(tasks, storage), true);
  assert.deepEqual(loadTasks(storage), tasks);
});

test('parseTasks переживает битые данные', () => {
  assert.deepEqual(parseTasks(null), []);
  assert.deepEqual(parseTasks('{not json'), []);
  assert.deepEqual(parseTasks('{"a":1}'), []);
  const raw = JSON.stringify([
    { id: '1', title: 'ok', done: true, createdAt: 1 },
    { id: 2, title: 'плохой id', done: false },
    { id: '3', title: '   ', done: false },
    { id: '4', title: 'без даты', done: false },
    null,
  ]);
  const parsed = parseTasks(raw);
  assert.deepEqual(parsed.map((t) => t.id), ['1', '4']);
  assert.ok(Number.isFinite(parsed[1].createdAt));
});

test('ошибки хранилища не ломают приложение', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.deepEqual(loadTasks(broken), []);
  assert.equal(saveTasks([], broken), false);
});

test('ключ хранилища версионирован', () => {
  assert.match(STORAGE_KEY, /:v\d+$/);
});
