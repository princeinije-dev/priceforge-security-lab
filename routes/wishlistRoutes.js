import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  showWishlist,
  addWishlistItem,
  removeWishlistItem,
  removeWishlistItemInsecureAction,
  moveToCart
} from "../controllers/wishlistController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", showWishlist);
router.post("/add", addWishlistItem);
router.post("/move-to-cart", moveToCart);
router.post("/:productId/remove", removeWishlistItem);

// Intentional IDOR Lab Endpoint
router.post("/item/:id/remove-insecure", removeWishlistItemInsecureAction);

export default router;
