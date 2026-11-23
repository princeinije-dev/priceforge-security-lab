import express from "express";
import {
  showCheckout,
  checkout,
  checkoutSecure,
  applyCouponApi,
  showOrders,
  showOrderDetails,
  showOrderDetailsSecure,
  cancelUserOrder,
  showInvoice
} from "../controllers/orderController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/checkout", showCheckout);
router.post("/checkout", checkout); // Vulnerable to price manipulation
router.post("/checkout-secure", checkoutSecure); // Secure counterpart
router.post("/api/apply-coupon", applyCouponApi);

router.get("/", showOrders);
router.get("/:id", showOrderDetails); // Vulnerable to IDOR
router.get("/secure/:id", showOrderDetailsSecure); // Secure counterpart
router.post("/:id/cancel", cancelUserOrder);
router.get("/:id/invoice", showInvoice);

export default router;
