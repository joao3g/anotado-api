import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import feedbackController from '../controllers/feedback.controller.js';

const router = express.Router();

// No groupMiddleware: users without a family can report problems too.
router.post("/", authMiddleware, feedbackController.create);

export default router;
