import "./style.css";
import { formatCents, formatRate, parseDollars, parsePercent } from "./money";
import { splitBill, type Split } from "./split";
import { decodeHash, encodeHash, takeId, toBill, type State } from "./state";
import { summaryText } from "./summary";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("missing #app");
const app: HTMLDivElement = root;

let state = decodeHash(location.hash);
let status = "";

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === "add-person") addPerson(form);
  if (form.id === "add-item") addItem(form);
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const personId = input.dataset.person;
  if (personId) {
    renamePerson(personId, input.value);
    return;
  }
  const itemId = input.dataset.item;
  if (itemId && input.dataset.field === "name") {
    patchItem(itemId, { name: input.value });
    return;
  }
  if (itemId && input.dataset.field === "price") {
    patchItem(itemId, { price: input.value });
    return;
  }
  if (input.id === "tax") {
    state = { ...state, tax: input.value };
    publish(false);
  } else if (input.id === "tip") {
    state = { ...state, tip: input.value };
    publish(false);
  }
});

app.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  const { action, id, item, person, mode, base } = button.dataset;
  switch (action) {
    case "remove-person":
      if (id) removePerson(id);
      break;
    case "remove-item":
      if (id) removeItem(id);
      break;
    case "toggle":
      if (item && person) toggle(item, person);
      break;
    case "tax-mode":
      if ((mode === "amount" || mode === "percent") && mode !== state.taxMode) {
        state = { ...state, taxMode: mode, tax: "" };
        publish(true);
      }
      break;
    case "tip-base":
      if ((base === "pre-tax" || base === "post-tax") && base !== state.tipBase) {
        state = { ...state, tipBase: base };
        publish(true);
      }
      break;
    case "copy":
      void copySummary();
      break;
  }
});

window.addEventListener("hashchange", () => {
  state = decodeHash(location.hash);
  render();
});

render();
writeHash();

function addPerson(form: HTMLFormElement) {
  const input = form.elements.namedItem("name");
  if (!(input instanceof HTMLInputElement)) return;
  const name = input.value.trim();
  if (!name) return;
  const taken = takeId(state);
  state = { ...taken.state, people: [...taken.state.people, { id: taken.id, name }] };
  publish(true);
  document.getElementById("new-person")?.focus();
}

function addItem(form: HTMLFormElement) {
  const nameInput = form.elements.namedItem("name");
  const priceInput = form.elements.namedItem("price");
  if (!(nameInput instanceof HTMLInputElement) || !(priceInput instanceof HTMLInputElement)) return;
  const name = nameInput.value.trim();
  const price = priceInput.value.trim();
  if (!name && !price) return;
  const taken = takeId(state);
  state = {
    ...taken.state,
    items: [...taken.state.items, { id: taken.id, name, price, who: [] }],
  };
  publish(true);
  document.getElementById("new-item")?.focus();
}

function renamePerson(id: string, name: string) {
  state = {
    ...state,
    people: state.people.map((person) => (person.id === id ? { ...person, name } : person)),
  };
  const shown = name.trim() || "Someone";
  const personSel = CSS.escape(id);
  for (const button of app.querySelectorAll<HTMLButtonElement>(
    `button[data-action="toggle"][data-person="${personSel}"]`,
  )) {
    button.textContent = shown;
  }
  const remove = app.querySelector<HTMLButtonElement>(`button[data-action="remove-person"][data-id="${personSel}"]`);
  remove?.setAttribute("aria-label", `Remove ${shown}`);
  publish(false);
}

function patchItem(id: string, patch: { name?: string; price?: string }) {
  state = {
    ...state,
    items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  };
  publish(false);
}

function removePerson(id: string) {
  state = {
    ...state,
    people: state.people.filter((person) => person.id !== id),
    items: state.items.map((item) => ({ ...item, who: item.who.filter((who) => who !== id) })),
  };
  publish(true);
}

function removeItem(id: string) {
  state = { ...state, items: state.items.filter((item) => item.id !== id) };
  publish(true);
}

function toggle(itemId: string, personId: string) {
  state = {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      const selected = new Set(item.who);
      if (selected.has(personId)) selected.delete(personId);
      else selected.add(personId);
      const who = state.people.map((person) => person.id).filter((id) => selected.has(id));
      return { ...item, who };
    }),
  };
  publish(true);
}

function publish(rebuild: boolean) {
  writeHash();
  if (rebuild) render();
  else paintNumbers();
}

function writeHash() {
  const hash = encodeHash(state);
  const next = location.pathname + location.search + hash;
  if (location.pathname + location.search + location.hash !== next) {
    history.replaceState(null, "", next);
  }
}

function render() {
  const y = window.scrollY;
  app.innerHTML = view(state);
  window.scrollTo(0, y);
}

function paintNumbers() {
  const split = currentSplit();
  const owed = document.getElementById("owed");
  const totals = document.getElementById("totals");
  const bar = document.getElementById("bar-total");
  if (owed) owed.innerHTML = owedHtml(split);
  if (totals) totals.innerHTML = totalsHtml(state, split);
  if (bar) bar.textContent = formatCents(split.total);
  markInvalid();
}

function markInvalid() {
  const tax = document.getElementById("tax");
  const tip = document.getElementById("tip");
  if (tax instanceof HTMLInputElement) tax.classList.toggle("bad", filledButBad(tax.value, validTax));
  if (tip instanceof HTMLInputElement) {
    tip.classList.toggle("bad", filledButBad(tip.value, (value) => parsePercent(value) !== null));
  }
  for (const input of app.querySelectorAll<HTMLInputElement>("input[data-field='price']")) {
    input.classList.toggle("bad", filledButBad(input.value, (value) => parseDollars(value) !== null));
  }
}

function filledButBad(value: string, ok: (value: string) => boolean): boolean {
  return value.trim() !== "" && !ok(value);
}

function validTax(value: string): boolean {
  return state.taxMode === "amount" ? parseDollars(value) !== null : parsePercent(value) !== null;
}

function currentSplit(): Split {
  return splitBill(toBill(state));
}

async function copySummary() {
  const text = summaryText(state, currentSplit());
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    copied = document.execCommand("copy");
    area.remove();
  }
  setStatus(copied ? "Copied." : "Copy failed.");
}

function setStatus(message: string) {
  status = message;
  const node = document.getElementById("status");
  if (node) node.textContent = message;
  window.setTimeout(() => {
    if (status !== message) return;
    status = "";
    const live = document.getElementById("status");
    if (live) live.textContent = "";
  }, 2000);
}

function view(current: State): string {
  const split = splitBill(toBill(current));
  return `<main>
    <h1>Split the bill</h1>
    <section>
      <h2>People</h2>
      ${peopleHtml(current)}
      <form id="add-person" class="add" autocomplete="off">
        <input id="new-person" name="name" placeholder="Name" aria-label="Name" maxlength="40" autocapitalize="words" />
        <button type="submit">Add</button>
      </form>
    </section>
    <section>
      <h2>Items</h2>
      ${itemsHtml(current)}
      <form id="add-item" class="add" autocomplete="off">
        <input id="new-item" name="name" placeholder="Item" aria-label="Item" maxlength="80" />
        <input id="new-price" name="price" class="price" inputmode="decimal" placeholder="0.00" aria-label="Price" maxlength="16" />
        <button type="submit">Add</button>
      </form>
    </section>
    <section>
      <h2>Tax and tip</h2>
      ${taxHtml(current)}
    </section>
    <section>
      <h2>Each person</h2>
      <ul id="owed" class="owed">${owedHtml(split)}</ul>
      <div id="totals">${totalsHtml(current, split)}</div>
      <p id="status" class="hint" role="status">${esc(status)}</p>
      <p class="hint">The link in the address bar is this bill.</p>
    </section>
    <div class="bar">
      <div><span class="muted">Total</span> <strong id="bar-total" class="money">${formatCents(split.total)}</strong></div>
      <button type="button" data-action="copy">Copy summary</button>
    </div>
  </main>`;
}

function peopleHtml(current: State): string {
  if (current.people.length === 0) return "";
  return `<ul class="people">${current.people
    .map(
      (person) => `<li>
        <input id="person-${esc(person.id)}" data-person="${esc(person.id)}" value="${esc(person.name)}" aria-label="Name" maxlength="40" autocapitalize="words" />
        <button type="button" class="text" data-action="remove-person" data-id="${esc(person.id)}" aria-label="Remove ${esc(person.name.trim() || "Someone")}">Remove</button>
      </li>`,
    )
    .join("")}</ul>`;
}

function itemsHtml(current: State): string {
  if (current.items.length === 0) return "";
  return `<ul class="items">${current.items
    .map(
      (item) => `<li class="item">
        <div class="add">
          <input id="item-name-${esc(item.id)}" data-item="${esc(item.id)}" data-field="name" value="${esc(item.name)}" aria-label="Item" maxlength="80" />
          <input id="item-price-${esc(item.id)}" class="price${badPrice(item.price) ? " bad" : ""}" data-item="${esc(item.id)}" data-field="price" inputmode="decimal" value="${esc(item.price)}" aria-label="Price" maxlength="16" />
          <button type="button" class="text" data-action="remove-item" data-id="${esc(item.id)}" aria-label="Remove ${esc(item.name.trim() || "item")}">Remove</button>
        </div>
        <div class="who" role="group" aria-label="Who shared ${esc(item.name.trim() || "this item")}">
          ${whoHtml(current, item.who, item.id)}
        </div>
      </li>`,
    )
    .join("")}</ul>`;
}

function whoHtml(current: State, who: string[], itemId: string): string {
  if (current.people.length === 0) return `<span class="hint">Add a person, then tap their name.</span>`;
  return current.people
    .map((person) => {
      const on = who.includes(person.id);
      return `<button type="button" data-action="toggle" data-item="${esc(itemId)}" data-person="${esc(person.id)}" aria-pressed="${on ? "true" : "false"}">${esc(person.name.trim() || "Someone")}</button>`;
    })
    .join("");
}

function taxHtml(current: State): string {
  const taxBad = filledButBad(current.tax, validTax);
  const tipBad = filledButBad(current.tip, (value) => parsePercent(value) !== null);
  return `<div class="seg" role="group" aria-label="Tax">
      <button type="button" data-action="tax-mode" data-mode="amount" aria-pressed="${current.taxMode === "amount"}">Amount</button>
      <button type="button" data-action="tax-mode" data-mode="percent" aria-pressed="${current.taxMode === "percent"}">Percent</button>
    </div>
    <label class="field">
      <span>${current.taxMode === "amount" ? "Tax amount" : "Tax percent"}</span>
      <input id="tax" inputmode="decimal" maxlength="16" class="${taxBad ? "bad" : ""}" value="${esc(current.tax)}" placeholder="${current.taxMode === "amount" ? "0.00" : "8.875"}" />
    </label>
    <label class="field">
      <span>Tip percent</span>
      <input id="tip" inputmode="decimal" maxlength="16" class="${tipBad ? "bad" : ""}" value="${esc(current.tip)}" placeholder="18" />
    </label>
    <div class="seg" role="group" aria-label="Tip calculated on">
      <button type="button" data-action="tip-base" data-base="pre-tax" aria-pressed="${current.tipBase === "pre-tax"}">Before tax</button>
      <button type="button" data-action="tip-base" data-base="post-tax" aria-pressed="${current.tipBase === "post-tax"}">After tax</button>
    </div>`;
}

function owedHtml(split: Split): string {
  if (split.people.length === 0) return `<li class="empty">No one yet.</li>`;
  return split.people
    .map(
      (person) => `<li>
        <div class="line"><span>${esc(person.name.trim() || "Someone")}</span><span class="money">${formatCents(person.total)}</span></div>
        <p class="parts">food ${formatCents(person.food)}, tax ${formatCents(person.tax)}, tip ${formatCents(person.tip)}</p>
      </li>`,
    )
    .join("");
}

function totalsHtml(current: State, split: Split): string {
  const taxRate = current.taxMode === "percent" ? parsePercent(current.tax) : null;
  const tipRate = parsePercent(current.tip);
  const taxName = taxRate !== null ? `Tax ${formatRate(taxRate)}` : "Tax";
  const tipName =
    tipRate !== null && tipRate > 0
      ? `Tip ${formatRate(tipRate)} ${current.tipBase === "post-tax" ? "after tax" : "before tax"}`
      : "Tip";
  return `<div class="line"><span>Subtotal</span><span class="money">${formatCents(split.subtotal)}</span></div>
    <div class="line"><span>${esc(taxName)}</span><span class="money">${formatCents(split.tax)}</span></div>
    <div class="line"><span>${esc(tipName)}</span><span class="money">${formatCents(split.tip)}</span></div>
    ${split.unassigned ? `<div class="line"><span>Not split yet</span><span class="money">${formatCents(split.unassigned)}</span></div>` : ""}
    <div class="line grand"><span>Total</span><span class="money">${formatCents(split.total)}</span></div>`;
}

function badPrice(price: string): boolean {
  return price.trim() !== "" && parseDollars(price) === null;
}

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
