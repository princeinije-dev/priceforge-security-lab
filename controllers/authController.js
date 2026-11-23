import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  createUser,
  findUserByEmail,
  setResetToken,
  findUserByResetToken,
  updateUserPassword,
  clearResetToken
} from "../models/userModel.js";

export function showLogin(req, res) {
  if (req.user) {
    return res.redirect("/products");
  }
  res.render("auth/login", {
    title: "Sign In",
    redirect: req.query.redirect || "/products",
    error: req.query.error || null,
    success: req.query.msg || null
  });
}

export function showRegister(req, res) {
  if (req.user) {
    return res.redirect("/products");
  }
  res.render("auth/register", {
    title: "Create Account",
    error: req.query.error || null
  });
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 8) {
      return res.render("auth/register", {
        title: "Create Account",
        error: "All fields are required. Password must be at least 8 characters.",
        formData: { name, email }
      });
    }

    const existingUser = await findUserByEmail(email.trim().toLowerCase());
    if (existingUser) {
      return res.render("auth/register", {
        title: "Create Account",
        error: "An account with this email address already exists.",
        formData: { name }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await createUser(name.trim(), email.trim().toLowerCase(), hashedPassword, "customer");

    res.redirect("/auth/login?msg=" + encodeURIComponent("Account created successfully! Please sign in."));
  } catch (error) {
    console.error("Registration error:", error);
    res.render("auth/register", {
      title: "Create Account",
      error: "An error occurred during registration. Please try again."
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password, redirect } = req.body;

    if (!email || !password) {
      return res.render("auth/login", {
        title: "Sign In",
        redirect: redirect || "/products",
        error: "Please enter both email and password."
      });
    }

    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.render("auth/login", {
        title: "Sign In",
        redirect: redirect || "/products",
        error: "Invalid email or password."
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render("auth/login", {
        title: "Sign In",
        redirect: redirect || "/products",
        error: "Invalid email or password."
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const targetUrl = redirect && redirect.startsWith("/") ? redirect : "/products";
    res.redirect(targetUrl);
  } catch (error) {
    console.error("Login error:", error);
    res.render("auth/login", {
      title: "Sign In",
      redirect: req.body.redirect || "/products",
      error: "Authentication service error. Please try again."
    });
  }
}

export function logout(req, res) {
  res.clearCookie("token");
  res.redirect("/auth/login?msg=" + encodeURIComponent("You have signed out successfully."));
}

export function showForgotPassword(req, res) {
  res.render("auth/forgot-password", {
    title: "Reset Password",
    tokenPreview: req.query.token || null,
    resetLink: req.query.link || null,
    error: req.query.error || null,
    success: req.query.msg || null
  });
}

// INTENTIONAL LAB VULNERABILITY: Weak password reset token handling & disclosure
// The reset token is generated and deliberately reflected in the response for lab testing
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.render("auth/forgot-password", {
        title: "Reset Password",
        error: "Please enter your email address."
      });
    }

    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      // Return ambiguous message for UI, but still clear
      return res.render("auth/forgot-password", {
        title: "Reset Password",
        error: "No account found with that email address."
      });
    }

    // Weak / predictable token: simple hex string
    const resetToken = crypto.randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await setResetToken(user.email, resetToken, expires);

    const resetLink = `/auth/reset-password/${resetToken}`;

    // LAB FEATURE: In local lab mode without SMTP server, we expose the token directly in the response page!
    res.render("auth/forgot-password", {
      title: "Reset Password",
      success: "Password reset request initiated.",
      tokenPreview: resetToken,
      resetLink: resetLink
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.render("auth/forgot-password", {
      title: "Reset Password",
      error: "Unable to process password reset request."
    });
  }
}

export async function showResetPassword(req, res) {
  const { token } = req.params;
  const user = await findUserByResetToken(token);

  if (!user) {
    return res.render("auth/reset-password", {
      title: "Set New Password",
      token: null,
      error: "This password reset token is invalid or has expired."
    });
  }

  res.render("auth/reset-password", {
    title: "Set New Password",
    token,
    userEmail: user.email,
    error: null
  });
}

export async function resetPassword(req, res) {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || password.length < 8) {
    return res.render("auth/reset-password", {
      title: "Set New Password",
      token,
      error: "Password must be at least 8 characters long."
    });
  }

  if (password !== confirmPassword) {
    return res.render("auth/reset-password", {
      title: "Set New Password",
      token,
      error: "Passwords do not match."
    });
  }

  const user = await findUserByResetToken(token);
  if (!user) {
    return res.render("auth/reset-password", {
      title: "Set New Password",
      token: null,
      error: "This reset token has expired or is invalid. Please request a new one."
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await updateUserPassword(user.id, hashedPassword);
  await clearResetToken(user.id);

  res.redirect("/auth/login?msg=" + encodeURIComponent("Password updated successfully! Please sign in with your new password."));
}
