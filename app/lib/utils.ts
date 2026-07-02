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

const CSS_NAMED_COLORS = new Set([
  "aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black",
  "blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse",
  "chocolate","coral","cornflowerblue","cornsilk","crimson","cyan","darkblue","darkcyan",
  "darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta",
  "darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen",
  "darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink",
  "deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen",
  "fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","green","greenyellow",
  "grey","honeydew","hotpink","indianred","indigo","ivory","khaki","lavender",
  "lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan",
  "lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon",
  "lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue",
  "lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine",
  "mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue",
  "mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream",
  "mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange",
  "orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred",
  "papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple",
  "red","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell",
  "sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen",
  "steelblue","tan","teal","thistle","tomato","turquoise","violet","wheat","white",
  "whitesmoke","yellow","yellowgreen",
]);

export function parseColorCommand(text: string): { color: string | null; body: string } {
  const match = text.match(/^\/(\S+)\s(.+)/);
  if (match && CSS_NAMED_COLORS.has(match[1].toLowerCase())) {
    return { color: match[1].toLowerCase(), body: match[2] };
  }
  return { color: null, body: text };
}

export function generateAdminToken(): string {
  return nanoid(16);
}

function adminTokenKey(sessionId: string): string {
  return `admin-token:${sessionId}`;
}

export function getStoredAdminToken(sessionId: string): string | null {
  return sessionStorage.getItem(adminTokenKey(sessionId));
}

export function storeAdminToken(sessionId: string, token: string): void {
  sessionStorage.setItem(adminTokenKey(sessionId), token);
}

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export function getAudienceUrl(sessionId: string): string {
  if (typeof window === "undefined") return "";
  return isLocalHostname(window.location.hostname)
    ? `${window.location.protocol}//${__DEV_LAN_IP__}:${window.location.port}/${sessionId}`
    : `${window.location.origin}/${sessionId}`;
}
