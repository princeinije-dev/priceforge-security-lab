import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
  upload,
  showDashboard,
  showProducts,
  showAddProduct,
  addProduct,
  showEditProduct,
  editProduct,
  deleteProductAction,
  toggleProductActiveAction,
  showOrders,
  showOrderDetails,
  updateOrderStatusAction,
  showCustomers,
  showCustomerDetails,
  updateCustomerRoleAction,
  showCoupons,
  addCouponAction,
  editCouponAction,
  deleteCouponAction,
  showReviews,
  deleteReviewAction,
  brokenAccessControlApi
} from "../controllers/adminController.js";

const router = express.Router();

// INTENTIONAL LAB VULNERABILITY (Broken Access Control):
// This sensitive API endpoint deliberately omits requireAdmin middleware!
router.get("/api/unprotected-stats", brokenAccessControlApi);

// All regular admin routes below are protected by requireAdmin middleware
router.use(requireAdmin);

// Dashboard
router.get("/", showDashboard);

// Products
router.get("/products", showProducts);
router.get("/products/new", showAddProduct);
router.post("/products/new", upload.single("image"), addProduct);
router.get("/products/:id/edit", showEditProduct);
router.post("/products/:id/edit", upload.single("image"), editProduct);
router.post("/products/:id/delete", deleteProductAction);
router.post("/products/:id/toggle", toggleProductActiveAction);

// Orders
router.get("/orders", showOrders);
router.get("/orders/:id", showOrderDetails);
router.post("/orders/:id/status", updateOrderStatusAction);

// Customers
router.get("/customers", showCustomers);
router.get("/customers/:id", showCustomerDetails);
router.post("/customers/:id/role", updateCustomerRoleAction);

// Coupons
router.get("/coupons", showCoupons);
router.post("/coupons/new", addCouponAction);
router.post("/coupons/:id/edit", editCouponAction);
router.post("/coupons/:id/delete", deleteCouponAction);

// Reviews
router.get("/reviews", showReviews);
router.post("/reviews/:id/delete", deleteReviewAction);

export default router;
