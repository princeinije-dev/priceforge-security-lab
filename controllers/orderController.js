import {
  createOrder,
  getUserOrders,
  getOrderDetails,
  getOrderDetailsInsecure,
  cancelOrder
} from "../models/orderModel.js";
import { getCart } from "../models/cartModel.js";
import { getUserAddresses, getAddressById } from "../models/addressModel.js";
import { validateCoupon } from "../models/couponModel.js";

export async function showCheckout(req, res) {
  try {
    const cart = await getCart(req.user.id);

    if (cart.length === 0) {
      return res.redirect("/cart?error=" + encodeURIComponent("Your cart is empty."));
    }

    const subtotal = cart.reduce((sum, item) => {
      return sum + Number(item.price) * item.quantity;
    }, 0);

    const addresses = await getUserAddresses(req.user.id);

    res.render("orders/checkout", {
      title: "Checkout",
      cart,
      subtotal,
      addresses,
      appliedCoupon: null,
      discount: 0,
      total: subtotal,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Checkout page error:", error);
    res.status(500).render("errors/500", { message: "Unable to load checkout page." });
  }
}

// API endpoint to validate coupon during checkout
export async function applyCouponApi(req, res) {
  try {
    const { code, subtotal } = req.body;
    if (!code) {
      return res.status(400).json({ valid: false, message: "Please enter a coupon code." });
    }

    const result = await validateCoupon(code, Number(subtotal) || 0, req.user?.id);
    return res.json(result);
  } catch (err) {
    console.error("Coupon validation error:", err);
    res.status(500).json({ valid: false, message: "Coupon verification error." });
  }
}

// INTENTIONAL LAB VULNERABILITY (Price Manipulation):
// Submits client-controlled price field without verifying against database price
export async function checkout(req, res) {
  try {
    let submittedItems = req.body.items;

    if (!submittedItems) {
      return res.redirect("/cart?error=" + encodeURIComponent("Your cart is empty."));
    }

    if (!Array.isArray(submittedItems)) {
      submittedItems = [submittedItems];
    }

    const items = submittedItems.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      price: Number(item.price) // Client-supplied price is kept!
    }));

    for (const item of items) {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !Number.isFinite(item.price) ||
        item.price < 0
      ) {
        return res.redirect("/orders/checkout?error=" + encodeURIComponent("Invalid item information."));
      }
    }

    // Determine shipping address text
    let shippingAddressText = req.body.inline_address || "";
    if (req.body.address_id) {
      const addr = await getAddressById(req.body.address_id);
      if (addr) {
        shippingAddressText = `${addr.full_name}, ${addr.street_address}, ${addr.city}, ${addr.state}, ${addr.postal_code || ""}, ${addr.country} (Phone: ${addr.phone || "N/A"})`;
      }
    }

    // Process coupon if submitted
    let couponId = null;
    let couponCode = null;
    let discountAmount = 0;

    if (req.body.coupon_code) {
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const couponCheck = await validateCoupon(req.body.coupon_code, subtotal, req.user.id);
      if (couponCheck.valid) {
        couponId = couponCheck.coupon.id;
        couponCode = couponCheck.coupon.code;
        discountAmount = couponCheck.discount;
      }
    }

    const order = await createOrder(req.user.id, items, {
      shippingAddressText,
      couponId,
      couponCode,
      discountAmount,
      trustSubmittedPrice: true // Price manipulation enabled
    });

    res.redirect(`/orders/${order.id}?msg=` + encodeURIComponent("Order placed successfully!"));
  } catch (error) {
    console.error("Checkout error:", error);
    res.redirect("/orders/checkout?error=" + encodeURIComponent(error.message));
  }
}

// SECURE COUNTERPART (Enforces database price):
export async function checkoutSecure(req, res) {
  try {
    const cart = await getCart(req.user.id);
    if (!cart || cart.length === 0) {
      return res.redirect("/cart?error=" + encodeURIComponent("Your cart is empty."));
    }

    const items = cart.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity
    }));

    let shippingAddressText = req.body.inline_address || "";
    if (req.body.address_id) {
      const addr = await getAddressById(req.body.address_id);
      if (addr) {
        shippingAddressText = `${addr.full_name}, ${addr.street_address}, ${addr.city}, ${addr.state}, ${addr.postal_code || ""}, ${addr.country}`;
      }
    }

    let couponId = null;
    let couponCode = null;
    let discountAmount = 0;

    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

    if (req.body.coupon_code) {
      const couponCheck = await validateCoupon(req.body.coupon_code, subtotal, req.user.id);
      if (couponCheck.valid) {
        couponId = couponCheck.coupon.id;
        couponCode = couponCheck.coupon.code;
        discountAmount = couponCheck.discount;
      }
    }

    const order = await createOrder(req.user.id, items, {
      shippingAddressText,
      couponId,
      couponCode,
      discountAmount,
      trustSubmittedPrice: false // Database price enforced!
    });

    res.redirect(`/orders/${order.id}?msg=` + encodeURIComponent("Order placed securely!"));
  } catch (error) {
    console.error("Secure checkout error:", error);
    res.redirect("/orders/checkout?error=" + encodeURIComponent(error.message));
  }
}

export async function showOrders(req, res) {
  try {
    const orders = await getUserOrders(req.user.id);

    res.render("orders/index", {
      title: "My Orders",
      orders,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Orders list error:", error);
    res.status(500).render("errors/500", { message: "Unable to load orders." });
  }
}

// INTENTIONAL LAB VULNERABILITY (IDOR):
// Does not verify that the order belongs to req.user.id, allowing any user to view any order by sequential numeric ID (e.g., 1, 2, 3...)
export async function showOrderDetails(req, res) {
  try {
    const result = await getOrderDetailsInsecure(req.params.id);

    if (!result) {
      return res.status(404).render("errors/404", { message: "Order not found." });
    }

    res.render("orders/details", {
      title: `Order #${result.order.id}`,
      order: result.order,
      items: result.items,
      isSecureRoute: false,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Order details error:", error);
    res.status(500).render("errors/500", { message: "Unable to load order details." });
  }
}

// SECURE COUNTERPART:
export async function showOrderDetailsSecure(req, res) {
  try {
    const result = await getOrderDetails(req.user.id, req.params.id);

    if (!result) {
      return res.status(404).render("errors/404", { message: "Order not found or unauthorized." });
    }

    res.render("orders/details", {
      title: `Order #${result.order.id}`,
      order: result.order,
      items: result.items,
      isSecureRoute: true,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Secure order details error:", error);
    res.status(500).render("errors/500", { message: "Unable to load order details." });
  }
}

export async function cancelUserOrder(req, res) {
  try {
    const orderId = req.params.id;
    await cancelOrder(orderId, req.user.id, false);
    res.redirect(`/orders/${orderId}?msg=` + encodeURIComponent("Order has been cancelled and items returned to stock."));
  } catch (error) {
    console.error("Cancel order error:", error);
    res.redirect(`/orders/${req.params.id}?error=` + encodeURIComponent(error.message));
  }
}

export async function showInvoice(req, res) {
  try {
    const orderId = req.params.id;
    // For lab inspection, insecure IDOR view allows invoice inspection
    const result = await getOrderDetailsInsecure(orderId);

    if (!result) {
      return res.status(404).render("errors/404", { message: "Invoice not found." });
    }

    res.render("orders/invoice", {
      title: `Invoice #${result.order.id}`,
      order: result.order,
      items: result.items
    });
  } catch (error) {
    console.error("Invoice error:", error);
    res.status(500).render("errors/500", { message: "Unable to generate invoice." });
  }
}
