// Merkliste und eigene Bewertungen. Nur im Browser des Nutzers (localStorage): keine fremden
// Rezensionen, nichts wird irgendwohin geschickt. Jeder Zugriff ist abgesichert, weil
// localStorage im privaten Modus oder bei vollem Speicher fehlen kann.

const KEY_FAVS = "sportatlas:favs", KEY_NOTES = "sportatlas:notes";
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const favorites = {
  list() { return read(KEY_FAVS, []); },
  has(id) { return this.list().includes(id); },
  toggle(id) { const l = this.list(); const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.push(id); write(KEY_FAVS, l); return i < 0; },
};

/** Bewertung je Gebiet: { stars: 0–5, text, updated } */
export const notes = {
  get(id) { return read(KEY_NOTES, {})[id] || { stars: 0, text: "" }; },
  set(id, patch) { const all = read(KEY_NOTES, {}); all[id] = { ...(all[id] || { stars: 0, text: "" }), ...patch, updated: new Date().toISOString().slice(0, 10) }; if (!all[id].stars && !all[id].text) delete all[id]; return write(KEY_NOTES, all); },
  all() { return read(KEY_NOTES, {}); },
};

export const starsHtml = (n, interactive = false) => [1, 2, 3, 4, 5].map((i) => interactive
  ? `<button type="button" data-star="${i}" class="${n >= i ? "on" : ""}" aria-label="${i} von 5 Sternen" aria-pressed="${n >= i}">★</button>`
  : `<span class="${n >= i ? "on" : ""}">★</span>`).join("");
