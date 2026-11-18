import express from 'express';
import WhatsappController from '../controllers/whatsapp.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import whatsappSignatureMiddleware from '../middlewares/whatsapp-signature.middleware.js';

const router = express.Router();

// Called by Meta, not by the app: no JWT. GET uses the verify token; POST must carry Meta's signature.
router.get("/webhook", WhatsappController.verifyWebhook);
router.post("/webhook", whatsappSignatureMiddleware, WhatsappController.receiveWebhook);

// Settings > Perfil > WhatsApp. No family needed (a user can link before joining one).
router.get("/status", authMiddleware, WhatsappController.getStatus);
router.post("/link-code", authMiddleware, WhatsappController.createLinkCode);
router.delete("/link", authMiddleware, WhatsappController.unlink);

export default router;
