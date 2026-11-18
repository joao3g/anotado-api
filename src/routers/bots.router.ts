import express from 'express';
import BotsController from '../controllers/bots.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

// Settings > Perfil > Bots de mensagem. No family needed (a user can link before joining one).
router.get("/status", authMiddleware, BotsController.getStatus);
router.post("/link-code", authMiddleware, BotsController.createLinkCode);
router.delete("/link/:channel", authMiddleware, BotsController.unlink);

export default router;
