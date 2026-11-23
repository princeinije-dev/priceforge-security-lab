import { getProductById } from "../models/productModel.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart
} from "../models/cartModel.js";

export async function showCart(req, res) {
  try {
    const items = await getCart(req.user.id);

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );

    res.render("cart/index", {
      title: "Your Shopping Cart",
      items,
      total,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Cart error:", error);
    res.status(500).render("errors/500", { message: "Unable to load cart." });
  }
}

export async function addCartItem(req, res) {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await getProductById(productId);

    if (!product || !product.is_active || product.stock < 1) {
      if (req.xhr || req.headers.accept?.includes("json")) {
        return res.status(400).json({ success: false, message: "Product is currently out of stock." });
      }
      return res.redirect("/products?error=" + encodeURIComponent("Product is currently out of stock."));
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const added = await addToCart(req.user.id, product.id, qty);

    if (!added) {
      if (req.xhr || req.headers.accept?.includes("json")) {
        return res.status(400).json({ success: false, message: "Cannot add more items than available in stock." });
      }
      return res.redirect(`/products/${productId}?error=` + encodeURIComponent("Stock limit reached."));
    }

    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.json({ success: true, message: `${product.name} added to cart!` });
    }

    res.redirect("/cart?msg=" + encodeURIComponent(`${product.name} added to your cart.`));
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).render("errors/500", { message: "Unable to add product to cart." });
  }
}

export async function changeCartQuantity(req, res) {
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.redirect("/cart?error=" + encodeURIComponent("Invalid quantity provided."));
  }

  try {
    const updated = await updateCartItem(
      req.user.id,
      req.params.id,
      quantity
    );

    if (!updated) {
      return res.redirect("/cart?error=" + encodeURIComponent("Requested quantity exceeds available stock."));
    }

    res.redirect("/cart");
  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).render("errors/500", { message: "Unable to update cart quantity." });
  }
}

export async function deleteCartItem(req, res) {
  try {
    await removeCartItem(req.user.id, req.params.id);
    res.redirect("/cart?msg=" + encodeURIComponent("Item removed from cart."));
  } catch (error) {
    console.error("Remove cart item error:", error);
    res.status(500).render("errors/500", { message: "Unable to remove item from cart." });
  }
}

export async function clearCartAction(req, res) {
  try {
    await clearCart(req.user.id);
    res.redirect("/cart?msg=" + encodeURIComponent("Cart cleared."));
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).render("errors/500", { message: "Unable to clear cart." });
  }
}
