// Date rules shared by the services.
// A "YYYY-MM-DD" string parsed by new Date() is UTC midnight, so we only use UTC getters/setters.
// Local getters (getDate, setMonth...) would shift a day if the server time zone is not UTC.

// Due date of the invoice a CREDIT purchase on `date` goes to.
// 1. The invoice closes in the purchase month when the day is before closingDay, else in the next month
//    (a purchase on the closing day goes to the next invoice).
// 2. It is due on dueDay: in the closing month when dueDay > closingDay, else in the month after.
// Example: closes on the 3rd, due on the 10th. Bought Nov 5 -> closes Dec 3 -> due Dec 10.
// dueDay is 1..28, so the day exists in every month. Date.UTC moves month 12 to January of the next year.
export function calculateNextInvoiceDate(date: Date, card: { closingDay: number, dueDay: number }) {
    let monthOffset = date.getUTCDate() >= card.closingDay ? 1 : 0;
    if (card.dueDay <= card.closingDay) monthOffset += 1;

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, card.dueDay));
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
