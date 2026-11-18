import express from 'express';
import cors from 'cors';
import UserRouter from './routers/user.router.js';
import GroupRouter from './routers/group.router.js';
import CategoryRouter from './routers/category.router.js';
import ExpenseRouter from './routers/expense.router.js';
import IncomeRouter from './routers/income.router.js';
import RecurrenceRouter from './routers/recurrence.router.js';
import CardRouter from './routers/card.router.js';
import WhatsappRouter from './routers/whatsapp.router.js';
import authMiddleware from './middlewares/auth.middleware.js';
import groupMiddleware from './middlewares/group.middleware.js';

const port = 3000;

const app = express();

// WhatsApp webhook: keep the raw body to check Meta's signature. Must come before express.json(),
// which then skips this request (its body is already read).
app.use("/whatsapp/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(cors());

app.use("/auth", UserRouter);
app.use("/group", GroupRouter);
// Family data: only for users who belong to a family (403 NO_GROUP otherwise).
// The routers still call authMiddleware per route; running it twice is harmless.
app.use("/category", authMiddleware, groupMiddleware, CategoryRouter);
app.use("/expense", authMiddleware, groupMiddleware, ExpenseRouter);
app.use("/income", authMiddleware, groupMiddleware, IncomeRouter);
app.use("/recurrence", authMiddleware, groupMiddleware, RecurrenceRouter);
app.use("/card", authMiddleware, groupMiddleware, CardRouter);
app.use("/whatsapp", WhatsappRouter);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});