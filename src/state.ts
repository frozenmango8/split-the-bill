import { parseDollars, parsePercent } from "./money";
import type { Bill } from "./split";

export type Person = { id: string; name: string };
export type Item = { id: string; name: string; price: string; who: string[] };

export type State = {
  nextId: number;
  people: Person[];
  items: Item[];
  taxMode: "amount" | "percent";
  tax: string;
  tip: string;
  tipBase: "pre-tax" | "post-tax";
};

type Payload = {
  v: 1;
  n: number;
  people: [string, string][];
  items: [string, string, string, string[]][];
  taxMode: State["taxMode"];
  tax: string;
  tip: string;
  tipBase: State["tipBase"];
};

export function emptyState(): State {
  return {
    nextId: 1,
    people: [],
    items: [],
    taxMode: "amount",
    tax: "",
    tip: "",
    tipBase: "pre-tax",
  };
}

export function takeId(state: State): { id: string; state: State } {
  return {
    id: state.nextId.toString(36),
    state: { ...state, nextId: state.nextId + 1 },
  };
}

export function toBill(state: State): Bill {
  return {
    people: state.people,
    items: state.items.map((item) => ({
      id: item.id,
      name: item.name,
      cents: parseDollars(item.price) ?? 0,
      sharedBy: item.who,
    })),
    taxMode: state.taxMode,
    taxValue: state.taxMode === "amount" ? (parseDollars(state.tax) ?? 0) : (parsePercent(state.tax) ?? 0),
    tipRate: parsePercent(state.tip) ?? 0,
    tipBase: state.tipBase,
  };
}

const EMPTY = JSON.stringify(toPayload(emptyState()));

export function encodeHash(state: State): string {
  const json = JSON.stringify(toPayload(state));
  if (json === EMPTY) return "";
  return "#" + encodeURIComponent(json);
}

export function decodeHash(hash: string): State {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw || raw.length > 100_000) return emptyState();
  const data = parsePayload(raw);
  if (!isRecord(data) || data.v !== 1) return emptyState();

  const people = readPeople(data.people);
  const order = people.map((person) => person.id);
  const items = readItems(data.items, new Set(order), order);
  const state: State = {
    nextId: 1,
    people,
    items,
    taxMode: data.taxMode === "percent" ? "percent" : "amount",
    tax: clip(data.tax, 32),
    tip: clip(data.tip, 32),
    tipBase: data.tipBase === "post-tax" ? "post-tax" : "pre-tax",
  };
  state.nextId = nextIdAfter(data.n, [...people, ...items]);
  return state;
}

// Browsers sometimes hand back a percent-decoded hash. Try the raw text
// first so a name like "100%" isn't decoded twice.
function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // still encoded
  }
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function toPayload(state: State): Payload {
  return {
    v: 1,
    n: state.nextId,
    people: state.people.map((person) => [person.id, person.name]),
    items: state.items.map((item) => [item.id, item.name, item.price, item.who]),
    taxMode: state.taxMode,
    tax: state.tax,
    tip: state.tip,
    tipBase: state.tipBase,
  };
}

function readPeople(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") continue;
    const id = entry[0].slice(0, 32);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    people.push({ id, name: entry[1].slice(0, 40) });
  }
  return people;
}

function readItems(value: unknown, ids: Set<string>, order: string[]): Item[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const [rawId, rawName, rawPrice, rawWho] = entry;
    if (typeof rawId !== "string" || typeof rawName !== "string" || typeof rawPrice !== "string") continue;
    const id = rawId.slice(0, 32);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const selected = new Set(
      Array.isArray(rawWho) ? rawWho.filter((id): id is string => typeof id === "string" && ids.has(id)) : [],
    );
    items.push({
      id,
      name: rawName.slice(0, 80),
      price: rawPrice.slice(0, 16),
      who: order.filter((personId) => selected.has(personId)),
    });
  }
  return items;
}

function nextIdAfter(stored: unknown, rows: { id: string }[]): number {
  let next = typeof stored === "number" && Number.isInteger(stored) && stored > 0 ? stored : 1;
  for (const row of rows) {
    const parsed = Number.parseInt(row.id, 36);
    if (Number.isInteger(parsed) && parsed >= next) next = parsed + 1;
  }
  return next;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
