import express from "express";
import {
  showLogin,
  login,
  showRegister,
  register,
  logout,
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword
} from "../controllers/authController.js";

const router = express.Router();

router.get("/register", showRegister);
router.post("/register", register);

router.get("/login", showLogin);
router.post("/login", login);

router.get("/logout", logout);
router.post("/logout", logout);

router.get("/forgot-password", showForgotPassword);
router.post("/forgot-password", forgotPassword);

router.get("/reset-password/:token", showResetPassword);
router.post("/reset-password/:token", resetPassword);

export default router;
