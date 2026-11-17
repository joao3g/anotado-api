import express from 'express';
import GroupController from '../controllers/group.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import groupMiddleware from '../middlewares/group.middleware.js';
import adminMiddleware from '../middlewares/admin.middleware.js';

const router = express.Router();

// Onboarding (users without a family)
router.post("/create", authMiddleware, GroupController.create);
router.post("/join", authMiddleware, GroupController.join);

// Settings > Família (own family only)
router.get("/me", authMiddleware, groupMiddleware, GroupController.getMine);
router.post("/me/leave", authMiddleware, groupMiddleware, GroupController.leave);

// Admin only
router.patch("/me", authMiddleware, groupMiddleware, adminMiddleware, GroupController.updateMine);
router.post("/me/invite-code", authMiddleware, groupMiddleware, adminMiddleware, GroupController.regenerateInviteCode);
router.delete("/me/members/:id", authMiddleware, groupMiddleware, adminMiddleware, GroupController.removeMember);
router.patch("/me/members/:id/role", authMiddleware, groupMiddleware, adminMiddleware, GroupController.setMemberRole);

router.get("/getByLogin/:login", authMiddleware, GroupController.getByUserLogin);

export default router;
