/**
 * Task files besides the main table (tasks.mjs). A file listed here is loaded
 * when it exists, so a builder adds a task by creating the file; to add another,
 * add one line. Any file named `*.task.mjs` in this folder is picked up as well.
 */
export const EXTRA_TASK_FILES = [
  "flow.mjs",     // the 60-second flow (landing → ZIP or address → five legislators → weigh in)
  "contact.mjs",  // contact your legislator from a bill or a vote
];
