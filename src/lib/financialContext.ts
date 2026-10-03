import type { FinancialData } from './plaidData';
import { categoryMeta, categoryOf, displayName, inRange, monthRange, spendingByCategory, sumIncome, sumSpending, SECURITY_TYPE_LABELS } from './finance';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Turns the user's data into a compact plain-text snapshot for the AI model.
// Kept small on purpose: Groq's free tier allows ~8k tokens per minute for gpt-oss-120b.
export function buildFinancialContext(data: FinancialData) {
  const lines: string[] = [];
  const today = new Date();
  lines.push(`Today is ${today.toDateString()}.`);

  if (!data.linked) {
    lines.push('The user has not linked any accounts yet.');
    return lines.join('\n');
  }

  lines.push('', '## Summary');
  lines.push(`Net worth: ${money(data.netWorth)} (assets ${money(data.assets)}, liabilities ${money(data.liabilities)})`);

  lines.push('', '## Accounts');
  const accountNames = new Map<string, string>();
  for (const a of data.accounts) {
    const name = `${a.name}${a.mask ? ` ••${a.mask}` : ''}`;
    accountNames.set(a.account_id, name);
    const limit = a.balances.limit ? `, limit ${money(a.balances.limit)}` : '';
    lines.push(`- ${name} (${a.institution}, ${a.type}/${a.subtype ?? '-'}): ${money(a.balances.current ?? 0)}${limit}`);
  }

  lines.push('', '## Monthly cash flow (transfers and card payments excluded from spending)');
  for (const offset of [0, -1, -2]) {
    const range = monthRange(offset);
    const txns = data.transactions.filter(t => inRange(t, range));
    const label = new Date(range.start + 'T12:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const cats = spendingByCategory(txns).slice(0, 8).map(c => `${c.label} ${money(c.total)}`).join(', ');
    lines.push(`- ${label}${offset === 0 ? ' (month to date)' : ''}: spent ${money(sumSpending(txns))}, income ${money(sumIncome(txns))}. By category: ${cats || 'none'}`);
  }

  if (data.holdings.length > 0) {
    const total = data.holdings.reduce((s, h) => s + h.value, 0);
    lines.push('', `## Investment holdings (total ${money(total)})`);

    const byType = new Map<string, number>();
    for (const h of data.holdings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.value);
    lines.push('Allocation: ' + [...byType.entries()].sort((a, b) => b[1] - a[1])
      .map(([t, v]) => `${SECURITY_TYPE_LABELS[t] ?? t} ${((v / total) * 100).toFixed(1)}%`).join(', '));

    // Combine the same security across accounts, then list the largest positions
    const combined = new Map<string, { label: string; type: string; value: number; basis: number | null }>();
    for (const h of data.holdings) {
      const c = combined.get(h.security_id);
      if (c) {
        c.value += h.value;
        c.basis = c.basis != null && h.cost_basis != null ? c.basis + h.cost_basis : null;
      } else {
        combined.set(h.security_id, { label: h.ticker ? `${h.ticker} (${h.name})` : h.name, type: h.type, value: h.value, basis: h.is_cash ? null : h.cost_basis });
      }
    }
    const top = [...combined.values()].sort((a, b) => b.value - a.value).slice(0, 30);
    for (const h of top) {
      const gain = h.basis != null ? `, gain ${money(h.value - h.basis)} (${h.basis ? (((h.value - h.basis) / h.basis) * 100).toFixed(1) : '0'}%)` : '';
      lines.push(`- ${h.label} [${h.type}]: ${money(h.value)}, ${((h.value / total) * 100).toFixed(1)}% of portfolio${gain}`);
    }
    if (combined.size > top.length) lines.push(`- …and ${combined.size - top.length} smaller positions`);
  }

  lines.push('', '## Transactions, most recent first (positive = money out, negative = money in)');
  for (const t of data.transactions.slice(0, 150)) {
    lines.push(`${t.date} | ${displayName(t)} | ${t.amount.toFixed(2)} | ${categoryMeta(categoryOf(t)).label}${t.pending ? ' (pending)' : ''} | ${accountNames.get(t.account_id) ?? ''}`);
  }
  if (data.transactions.length > 150) lines.push(`(${data.transactions.length - 150} older transactions omitted)`);

  return lines.join('\n');
}
