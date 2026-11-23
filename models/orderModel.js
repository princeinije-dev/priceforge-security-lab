import { pool } from "../config/db.js";
import { recordCouponUsage } from "./couponModel.js";

export async function createOrder(
  userId,
  items,
  {
    shippingAddressText = "",
    couponId = null,
    couponCode = null,
    discountAmount = 0,
    trustSubmittedPrice = true // Intentional lab vulnerability flag
  } = {}
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let subtotalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      // Row-level lock on products to prevent concurrent overselling
      const productResult = await client.query(
        `SELECT id, name, price, stock
         FROM products
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [item.productId]
      );

      if (productResult.rowCount === 0) {
        throw new Error("One or more selected products are unavailable.");
      }

      const product = productResult.rows[0];

      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
      }

      // Deduct stock
      const stockResult = await client.query(
        `UPDATE products
         SET stock = stock - $1
         WHERE id = $2 AND stock >= $1
         RETURNING id`,
        [item.quantity, item.productId]
      );

      if (stockResult.rowCount === 0) {
        throw new Error(`Stock allocation conflict for ${product.name}. Please retry.`);
      }

      // INTENTIONAL LAB VULNERABILITY (Price Manipulation):
      // When trustSubmittedPrice is true, client-supplied price is accepted directly!
      let unitPrice = Number(product.price);
      if (trustSubmittedPrice && item.price !== undefined && item.price !== null) {
        unitPrice = Number(item.price);
      }

      const lineSubtotal = unitPrice * item.quantity;
      subtotalAmount += lineSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal: lineSubtotal
      });
    }

    const finalDiscount = Math.min(Number(discountAmount) || 0, subtotalAmount);
    const totalAmount = Math.max(0, subtotalAmount - finalDiscount);

    // Auto-incrementing integer ID
    const orderResult = await client.query(
      `INSERT INTO orders 
        (user_id, total_amount, subtotal_amount, discount_amount, coupon_id, coupon_code, shipping_address_text, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending')
       RETURNING *`,
      [userId, totalAmount, subtotalAmount, finalDiscount, couponId, couponCode, shippingAddressText]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id, // integer ID
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.subtotal
        ]
      );
    }

    // Record coupon usage if coupon applied
    if (couponId) {
      await recordCouponUsage(couponId, userId, order.id, client);
    }

    // Clear user's cart
    await client.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);

    await client.query("COMMIT");

    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserOrders(userId) {
  const result = await pool.query(
    `SELECT *
     FROM orders
     WHERE user_id = $1
     ORDER BY id DESC`,
    [userId]
  );

  return result.rows;
}

// Secure lookup: guarantees order belongs to user
export async function getOrderDetails(userId, orderId) {
  const numericId = parseInt(orderId, 10);
  if (isNaN(numericId)) {
    return null;
  }

  const orderResult = await pool.query(
    `SELECT orders.*, users.name as user_name, users.email as user_email
     FROM orders
     JOIN users ON users.id = orders.user_id
     WHERE orders.id = $1 AND orders.user_id = $2`,
    [numericId, userId]
  );

  if (orderResult.rowCount === 0) {
    return null;
  }

  const itemsResult = await pool.query(
    `SELECT order_items.*, products.image_url
     FROM order_items
     LEFT JOIN products ON products.id = order_items.product_id
     WHERE order_items.order_id = $1`,
    [numericId]
  );

  return {
    order: orderResult.rows[0],
    items: itemsResult.rows
  };
}

// INTENTIONAL LAB VULNERABILITY (IDOR):
// Fetches order details by numeric sequential orderId without validating that the authenticated user owns this order
export async function getOrderDetailsInsecure(orderId) {
  const numericId = parseInt(orderId, 10);
  if (isNaN(numericId)) {
    return null;
  }

  const orderResult = await pool.query(
    `SELECT orders.*, users.name as user_name, users.email as user_email
     FROM orders
     JOIN users ON users.id = orders.user_id
     WHERE orders.id = $1`,
    [numericId]
  );

  if (orderResult.rowCount === 0) {
    return null;
  }

  const itemsResult = await pool.query(
    `SELECT order_items.*, products.image_url
     FROM order_items
     LEFT JOIN products ON products.id = order_items.product_id
     WHERE order_items.order_id = $1`,
    [numericId]
  );

  return {
    order: orderResult.rows[0],
    items: itemsResult.rows
  };
}

export async function getAllOrdersAdmin({ status = null } = {}) {
  let query = `
    SELECT orders.*, users.name as user_name, users.email as user_email,
      (SELECT COUNT(*) FROM order_items WHERE order_items.order_id = orders.id) as item_count
    FROM orders
    JOIN users ON users.id = orders.user_id
  `;
  const params = [];

  if (status && status !== "all") {
    query += " WHERE orders.status = $1";
    params.push(status);
  }

  query += " ORDER BY orders.id DESC";

  const result = await pool.query(query, params);
  return result.rows;
}

export async function updateOrderStatus(orderId, status) {
  const numericId = parseInt(orderId, 10);
  if (isNaN(numericId)) {
    throw new Error("Invalid order ID");
  }

  const result = await pool.query(
    "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
    [status, numericId]
  );
  return result.rows[0];
}

export async function cancelOrder(orderId, userId = null, isAdmin = false) {
  const numericId = parseInt(orderId, 10);
  if (isNaN(numericId)) {
    throw new Error("Invalid order ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Fetch order
    const orderQuery = isAdmin || !userId
      ? "SELECT * FROM orders WHERE id = $1 FOR UPDATE"
      : "SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE";
    const orderParams = isAdmin || !userId ? [numericId] : [numericId, userId];

    const orderRes = await client.query(orderQuery, orderParams);
    if (orderRes.rowCount === 0) {
      throw new Error("Order not found or unauthorized");
    }

    const order = orderRes.rows[0];

    // Business rule: only Pending or Processing orders can be cancelled
    if (order.status === "Cancelled") {
      throw new Error("Order has already been cancelled.");
    }
    if (order.status === "Delivered") {
      throw new Error("Delivered orders cannot be cancelled directly.");
    }

    // Restore stock for items in the order
    const itemsRes = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [numericId]
    );

    for (const item of itemsRes.rows) {
      if (item.product_id) {
        await client.query(
          "UPDATE products SET stock = stock + $1 WHERE id = $2",
          [item.quantity, item.product_id]
        );
      }
    }

    // Mark order as Cancelled
    const updatedOrderRes = await client.query(
      "UPDATE orders SET status = 'Cancelled' WHERE id = $1 RETURNING *",
      [numericId]
    );

    await client.query("COMMIT");
    return updatedOrderRes.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getDashboardStats() {
  const statsRes = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status != 'Cancelled') as total_revenue,
      (SELECT COUNT(*) FROM orders) as total_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Pending') as pending_orders,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') as total_customers,
      (SELECT COUNT(*) FROM products WHERE is_active = TRUE) as total_products,
      (SELECT COUNT(*) FROM products WHERE stock <= 10 AND is_active = TRUE) as low_stock_count
  `);

  return {
    totalRevenue: Number(statsRes.rows[0].total_revenue),
    totalOrders: Number(statsRes.rows[0].total_orders),
    pendingOrders: Number(statsRes.rows[0].pending_orders),
    totalCustomers: Number(statsRes.rows[0].total_customers),
    totalProducts: Number(statsRes.rows[0].total_products),
    lowStockCount: Number(statsRes.rows[0].low_stock_count)
  };
}
