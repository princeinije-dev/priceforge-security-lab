import express from "express";
import {
  showProducts,
  showProductDetails,
  vulnerableSearch
} from "../controllers/productController.js";
import {
  submitReview,
  editReview,
  deleteReviewAction
} from "../controllers/reviewController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// SQL Injection Lab Endpoint
router.get("/search/vulnerable", vulnerableSearch);

// Storefront Product Routes
router.get("/", showProducts);
router.get("/:id", showProductDetails);

// Product Review Routes
router.post("/:id/reviews", requireAuth, submitReview);
router.post("/:productId/reviews/:reviewId/edit", requireAuth, editReview);
router.post("/:productId/reviews/:reviewId/delete", requireAuth, deleteReviewAction);

export default router;
