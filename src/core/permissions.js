import { STAFF_USERNAMES } from "../config.js";

export function isStaff(username) {
  return typeof username === "string" && STAFF_USERNAMES.includes(username.trim());
}
