import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  showCart,
  addCartItem,
  changeCartQuantity,
  deleteCartItem,
  clearCartAction
} from "../controllers/cartController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", showCart);
router.post("/add", addCartItem);
router.post("/clear", clearCartAction);
router.post("/:id/update", changeCartQuantity);
router.post("/:id/remove", deleteCartItem);

export default router;
