import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  removeWishlistItemInsecure
} from "../models/wishlistModel.js";
import { addToCart } from "../models/cartModel.js";

export async function showWishlist(req, res) {
  try {
    const items = await getWishlist(req.user.id);
    res.render("shop/wishlist", {
      title: "My Wishlist",
      items,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Wishlist error:", err);
    res.status(500).render("errors/500", { message: "Unable to load wishlist." });
  }
}

export async function addWishlistItem(req, res) {
  try {
    const { productId } = req.body;
    await addToWishlist(req.user.id, productId);

    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.json({ success: true, message: "Item added to wishlist." });
    }

    res.redirect("/wishlist?msg=" + encodeURIComponent("Item added to your wishlist."));
  } catch (err) {
    console.error("Add wishlist error:", err);
    res.redirect("/wishlist?error=" + encodeURIComponent("Failed to add item to wishlist."));
  }
}

export async function removeWishlistItem(req, res) {
  try {
    const { productId } = req.params;
    await removeFromWishlist(req.user.id, productId);
    res.redirect("/wishlist?msg=" + encodeURIComponent("Item removed from wishlist."));
  } catch (err) {
    console.error("Remove wishlist error:", err);
    res.redirect("/wishlist?error=" + encodeURIComponent("Failed to remove item from wishlist."));
  }
}

// INTENTIONAL LAB VULNERABILITY (IDOR):
// Removes item directly using wishlist_item_id without validating user ownership
export async function removeWishlistItemInsecureAction(req, res) {
  try {
    const { id } = req.params;
    await removeWishlistItemInsecure(id);
    res.redirect("/wishlist?msg=" + encodeURIComponent("Wishlist item removed (IDOR lab endpoint)."));
  } catch (err) {
    console.error("IDOR Wishlist error:", err);
    res.redirect("/wishlist?error=" + encodeURIComponent("Failed to remove wishlist item."));
  }
}

export async function moveToCart(req, res) {
  try {
    const { productId } = req.body;
    await addToCart(req.user.id, productId, 1);
    await removeFromWishlist(req.user.id, productId);

    res.redirect("/cart?msg=" + encodeURIComponent("Item moved to your shopping cart."));
  } catch (err) {
    console.error("Move to cart error:", err);
    res.redirect("/wishlist?error=" + encodeURIComponent("Failed to move item to cart."));
  }
}
