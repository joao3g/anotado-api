// Date rules shared by the services.
// A "YYYY-MM-DD" string parsed by new Date() is UTC midnight, so we only use UTC getters/setters.
// Local getters (getDate, setMonth...) would shift a day if the server time zone is not UTC.

export function calculateNextInvoiceDate(date: Date, cardClosingDay: number) {
    const dueDate = new Date(date);
    dueDate.setUTCDate(cardClosingDay + 1);
    if (date.getUTCDate() >= cardClosingDay) dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);

    return dueDate;
}

// Adds months and clamps the day to the last day of the target month.
// Example: Jan 31 + 1 month = Feb 28 (or Feb 29 in a leap year).
// Always call it from the anchor date (installment #1), never chain it, or the day drifts to 28.
export function addMonthsClamped(date: Date, months: number) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;
    const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfTargetMonth)));
}

// Today's date in Brazil, as UTC midnight (same format as the stored dates).
export function todayInBrazil() {
    return new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
}

// Last day of the month of `date`, as UTC midnight.
export function endOfMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}
