import express from 'express';
import UserController from '../controllers/user.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/register", UserController.register);
router.post("/login", UserController.login);

// "Esqueceu a senha?": public on purpose (the user cannot log in). The emailed token is the proof.
router.post("/forgot-password", UserController.forgotPassword);
router.post("/reset-password", UserController.resetPassword);

// Sign-up email confirmation: public on purpose (login is refused until it is done).
router.post("/verify-email", UserController.verifyEmail);
router.post("/resend-verification", UserController.resendVerification);
router.get("/me", authMiddleware, UserController.getCurrentUser);

// Settings > Perfil / Segurança. No family needed.
router.patch("/me", authMiddleware, UserController.updateProfile);
router.put("/me/avatar", authMiddleware, UserController.updateAvatar);
router.delete("/me/avatar", authMiddleware, UserController.removeAvatar);
router.patch("/me/password", authMiddleware, UserController.changePassword);

export default router;
