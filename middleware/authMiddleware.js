import jwt from "jsonwebtoken";
import { findUserById } from "../models/userModel.js";
import { getCartCount } from "../models/cartModel.js";

// Global middleware to populate req.user and res.locals for templates
export async function populateUser(req, res, next) {
  res.locals.user = null;
  res.locals.cartCount = 0;
  res.locals.currentPath = req.path;
  res.locals.flash = {
    success: req.query.msg || null,
    error: req.query.error || null
  };

  const token = req.cookies?.token;
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);

    if (user) {
      req.user = user;
      res.locals.user = user;
      const count = await getCartCount(user.id);
      res.locals.cartCount = count;
    } else {
      res.clearCookie("token");
    }
  } catch {
    res.clearCookie("token");
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }

  if (req.user.role !== "admin") {
    return res.status(403).render("errors/403", {
      title: "Access Forbidden",
      message: "Administrator privileges required to access this area."
    });
  }

  next();
}
