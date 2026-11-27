import { formatCents, formatRate, parseDollars, parsePercent } from "./money";
import type { Split } from "./split";
import type { State } from "./state";

export function summaryText(state: State, split: Split): string {
  const names = new Map(state.people.map((person) => [person.id, label(person.name)]));
  const lines: string[] = [];
  for (const item of state.items) {
    const who = item.who.map((id) => names.get(id)).filter((name): name is string => name !== undefined);
    lines.push(
      `${item.name.trim() || "Item"}  ${formatCents(parseDollars(item.price) ?? 0)}  ${who.length ? who.join(", ") : "unassigned"}`,
    );
  }
  if (lines.length) lines.push("");
  lines.push(`Subtotal  ${formatCents(split.subtotal)}`);
  lines.push(`${taxLabel(state)}  ${formatCents(split.tax)}`);
  lines.push(`${tipLabel(state)}  ${formatCents(split.tip)}`);
  if (split.unassigned) lines.push(`Not split yet  ${formatCents(split.unassigned)}`);
  lines.push(`Total  ${formatCents(split.total)}`);
  lines.push("");
  for (const person of split.people) {
    lines.push(`${label(person.name)}  ${formatCents(person.total)}`);
  }
  return lines.join("\n");
}

function taxLabel(state: State): string {
  if (state.taxMode !== "percent") return "Tax";
  const rate = parsePercent(state.tax);
  return rate === null ? "Tax" : `Tax ${formatRate(rate)}`;
}

function tipLabel(state: State): string {
  const rate = parsePercent(state.tip);
  if (rate === null || rate === 0) return "Tip";
  const basis = state.tipBase === "post-tax" ? "after tax" : "before tax";
  return `Tip ${formatRate(rate)} ${basis}`;
}

function label(name: string): string {
  return name.trim() || "Someone";
}
