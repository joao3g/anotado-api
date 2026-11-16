import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import recurrenceController from '../controllers/recurrence.controller.js';

const router = express.Router();

router.post("/create", authMiddleware, recurrenceController.create);
router.get("/list", authMiddleware, recurrenceController.list);
router.patch("/update", authMiddleware, recurrenceController.update);
router.patch("/cancel/:id", authMiddleware, recurrenceController.cancel);

export default router;
