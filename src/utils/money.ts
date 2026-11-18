// Money as text, never as float math.

// "1234.5" or "1234.56" (a Decimal's toFixed(2) / a parsed amount) -> "R$ 1.234,56"
export function formatBRL(amount: string) {
    const [rawInteger = "0", rawFraction = ""] = amount.replace("-", "").split(".");
    const integer = rawInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const fraction = rawFraction.padEnd(2, "0").slice(0, 2);

    return `${amount.startsWith("-") ? "-" : ""}R$ ${integer},${fraction}`;
}
