import { pool } from "../config/db.js";

export async function getWishlist(userId) {
  const result = await pool.query(
    `SELECT 
       wishlist_items.id as wishlist_item_id,
       wishlist_items.created_at as added_at,
       products.*
     FROM wishlist_items
     JOIN products ON products.id = wishlist_items.product_id
     WHERE wishlist_items.user_id = $1
     ORDER BY wishlist_items.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function addToWishlist(userId, productId) {
  const result = await pool.query(
    `INSERT INTO wishlist_items (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING *`,
    [userId, productId]
  );
  return result.rowCount > 0;
}

export async function removeFromWishlist(userId, productId) {
  const result = await pool.query(
    "DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2 RETURNING *",
    [userId, productId]
  );
  return result.rowCount > 0;
}

export async function removeWishlistItemInsecure(wishlistItemId) {
  // INTENTIONAL LAB VULNERABILITY (IDOR):
  // Deletes wishlist item by item ID without checking user ownership
  const result = await pool.query(
    "DELETE FROM wishlist_items WHERE id = $1 RETURNING *",
    [wishlistItemId]
  );
  return result.rowCount > 0;
}

export async function isInWishlist(userId, productId) {
  if (!userId) return false;
  const result = await pool.query(
    "SELECT 1 FROM wishlist_items WHERE user_id = $1 AND product_id = $2",
    [userId, productId]
  );
  return result.rowCount > 0;
}
