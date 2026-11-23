import { pool } from "../config/db.js";

export async function getCart(userId) {
  const result = await pool.query(
    `SELECT
       cart_items.id,
       cart_items.product_id,
       cart_items.quantity,
       products.name,
       products.price,
       products.stock,
       products.image_url,
       products.category
     FROM cart_items
     JOIN products ON products.id = cart_items.product_id
     WHERE cart_items.user_id = $1
     ORDER BY cart_items.created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function addToCart(userId, productId, quantity = 1) {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const result = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     SELECT $1, id, $3
     FROM products
     WHERE id = $2 AND is_active = TRUE AND stock >= $3
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = LEAST(
       cart_items.quantity + $3,
       (SELECT stock FROM products WHERE id = $2)
     )
     RETURNING *`,
    [userId, productId, qty]
  );

  return result.rowCount > 0;
}

export async function updateCartItem(userId, itemId, quantity) {
  const qty = parseInt(quantity, 10);
  if (qty <= 0) {
    return removeCartItem(userId, itemId);
  }

  const result = await pool.query(
    `UPDATE cart_items
     SET quantity = $1
     WHERE id = $2
       AND user_id = $3
       AND EXISTS (
         SELECT 1
         FROM products
         WHERE products.id = cart_items.product_id
           AND products.stock >= $1
       )
     RETURNING id`,
    [qty, itemId, userId]
  );

  return result.rowCount > 0;
}

export async function removeCartItem(userId, itemId) {
  const result = await pool.query(
    `DELETE FROM cart_items
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [itemId, userId]
  );

  return result.rowCount > 0;
}

export async function clearCart(userId) {
  const result = await pool.query(
    "DELETE FROM cart_items WHERE user_id = $1",
    [userId]
  );
  return result.rowCount;
}

export async function getCartCount(userId) {
  if (!userId) return 0;
  const result = await pool.query(
    "SELECT COALESCE(SUM(quantity), 0) as total FROM cart_items WHERE user_id = $1",
    [userId]
  );
  return parseInt(result.rows[0].total, 10) || 0;
}
