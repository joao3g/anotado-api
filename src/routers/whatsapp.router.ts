import express from 'express';
import WhatsappController from '../controllers/whatsapp.controller.js';
import whatsappSignatureMiddleware from '../middlewares/whatsapp-signature.middleware.js';

const router = express.Router();

// Called by Meta, not by the app: no JWT. GET uses the verify token; POST must carry Meta's signature.
router.get("/webhook", WhatsappController.verifyWebhook);
router.post("/webhook", whatsappSignatureMiddleware, WhatsappController.receiveWebhook);

export default router;
