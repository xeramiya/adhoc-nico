import { nanoid } from "nanoid";

export function generateSessionId(): string {
  return nanoid(10);
}

export function getUserId(): string {
  const key = "adhoc-nico-userId";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = nanoid(8);
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export function isUrlLine(line: string): boolean {
  return /^https?:\/\//.test(line.trim());
}
