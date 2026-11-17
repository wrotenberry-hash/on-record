/**
 * Task files besides the main table (tasks.mjs). A file listed here is loaded
 * when it exists; to add another, add one line. Any file named `*.task.mjs` in
 * this folder is picked up as well, without a line here.
 *
 * flow.mjs (the 60-second flow) is a script of its own with its own checks; it
 * is run by flow.task.mjs, which turns each of its runs into a row of the report.
 */
export const EXTRA_TASK_FILES = [
  "contact.mjs",  // contact your legislator from a bill page
];
