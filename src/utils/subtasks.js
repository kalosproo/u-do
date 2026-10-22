/**
 * Steps inside a task: a short checklist stored on the task itself.
 */

export const MAX_SUBTASKS = 30;
export const MAX_SUBTASK_TITLE = 120;

const newId = () => Math.random().toString(36).slice(2, 10);

/** Keeps only well-formed steps, trimmed and capped. */
export const cleanSubtasks = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((item) => item && String(item.title || "").trim())
    .slice(0, MAX_SUBTASKS)
    .map((item) => ({
      id: String(item.id || newId()).slice(0, 20),
      title: String(item.title).trim().slice(0, MAX_SUBTASK_TITLE),
      done: item.done === true,
    }));

export const subtaskProgress = (list) => {
  const clean = cleanSubtasks(list);
  return { done: clean.filter((item) => item.done).length, total: clean.length };
};

export const addSubtask = (list, title) => {
  const text = String(title || "").trim();
  if (!text) return cleanSubtasks(list);
  return cleanSubtasks([...(list || []), { id: newId(), title: text, done: false }]);
};

export const toggleSubtask = (list, id) =>
  cleanSubtasks((list || []).map((item) => (item.id === id ? { ...item, done: !item.done } : item)));

export const removeSubtask = (list, id) => cleanSubtasks((list || []).filter((item) => item.id !== id));

/** A repeating task's next occurrence starts its checklist fresh. */
export const resetSubtasks = (list) => cleanSubtasks(list).map((item) => ({ ...item, done: false }));
