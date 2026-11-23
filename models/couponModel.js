import { pool } from "../config/db.js";

export async function getAllCoupons() {
  const result = await pool.query(
    "SELECT * FROM coupons ORDER BY created_at DESC"
  );
  return result.rows;
}

export async function getCouponById(id) {
  const result = await pool.query(
    "SELECT * FROM coupons WHERE id = $1",
    [id]
  );
  return result.rows[0];
}

export async function findCouponByCode(code) {
  const result = await pool.query(
    "SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)",
    [code.trim()]
  );
  return result.rows[0];
}

export async function createCoupon({ code, discount_type, discount_value, min_order_amount, max_uses, expires_at }) {
  const result = await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active)
     VALUES (UPPER($1), $2, $3, $4, $5, $6, TRUE)
     RETURNING *`,
    [code.trim(), discount_type, discount_value, min_order_amount || 0, max_uses || 100, expires_at || null]
  );
  return result.rows[0];
}

export async function updateCoupon(id, { code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active }) {
  const result = await pool.query(
    `UPDATE coupons
     SET code = UPPER($1), discount_type = $2, discount_value = $3, min_order_amount = $4, max_uses = $5, expires_at = $6, is_active = $7
     WHERE id = $8
     RETURNING *`,
    [code.trim(), discount_type, discount_value, min_order_amount || 0, max_uses || 100, expires_at || null, Boolean(is_active), id]
  );
  return result.rows[0];
}

export async function deleteCoupon(id) {
  const result = await pool.query(
    "DELETE FROM coupons WHERE id = $1 RETURNING *",
    [id]
  );
  return result.rowCount > 0;
}

export async function recordCouponUsage(couponId, userId, orderId, client = pool) {
  await client.query(
    "UPDATE coupons SET used_count = used_count + 1 WHERE id = $1",
    [couponId]
  );

  await client.query(
    `INSERT INTO coupon_usages (coupon_id, user_id, order_id)
     VALUES ($1, $2, $3)`,
    [couponId, userId, orderId]
  );
}

export async function getUserCouponUsageCount(couponId, userId, client = pool) {
  const result = await client.query(
    "SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2",
    [couponId, userId]
  );
  return Number(result.rows[0].count);
}

export async function validateCoupon(code, subtotal, userId, enforceUserLimit = true) {
  const coupon = await findCouponByCode(code);
  if (!coupon) {
    return { valid: false, message: "Invalid coupon code" };
  }

  if (!coupon.is_active) {
    return { valid: false, message: "This coupon is no longer active" };
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, message: "This coupon has expired" };
  }

  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
    return { valid: false, message: "This coupon has reached its maximum usage limit" };
  }

  if (subtotal < Number(coupon.min_order_amount)) {
    return {
      valid: false,
      message: `Minimum order amount of ₦${Number(coupon.min_order_amount).toLocaleString("en-NG")} required`
    };
  }

  if (enforceUserLimit && userId) {
    const timesUsed = await getUserCouponUsageCount(coupon.id, userId);
    if (timesUsed > 0) {
      return { valid: false, message: "You have already used this coupon" };
    }
  }

  let discount = 0;
  if (coupon.discount_type === "percentage") {
    discount = (subtotal * Number(coupon.discount_value)) / 100;
  } else {
    discount = Number(coupon.discount_value);
  }

  if (discount > subtotal) {
    discount = subtotal;
  }

  return {
    valid: true,
    coupon,
    discount: Math.round(discount * 100) / 100,
    newTotal: Math.max(0, Math.round((subtotal - discount) * 100) / 100)
  };
}
