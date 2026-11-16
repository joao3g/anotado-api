import express from 'express';
import GroupController from '../controllers/group.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import groupMiddleware from '../middlewares/group.middleware.js';

const router = express.Router();

// Onboarding (users without a family)
router.post("/create", authMiddleware, GroupController.create);
router.post("/join", authMiddleware, GroupController.join);

// Settings > Família (own family only)
router.get("/me", authMiddleware, groupMiddleware, GroupController.getMine);
router.patch("/me", authMiddleware, groupMiddleware, GroupController.updateMine);
router.post("/me/invite-code", authMiddleware, groupMiddleware, GroupController.regenerateInviteCode);
router.post("/me/leave", authMiddleware, groupMiddleware, GroupController.leave);

router.get("/getByLogin/:login", authMiddleware, GroupController.getByUserLogin);
router.delete("/remove/:id", authMiddleware, GroupController.remove);
router.patch("/update", authMiddleware, GroupController.update);

export default router;
