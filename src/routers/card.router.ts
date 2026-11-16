import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import cardController from '../controllers/card.controller.js';

const router = express.Router();

router.post("/create", authMiddleware, cardController.create);
router.get("/list", authMiddleware, cardController.list);
router.patch("/update", authMiddleware, cardController.update);
router.delete("/delete/:id", authMiddleware, cardController.remove);

export default router;
