import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductActive,
  getLowStockProducts,
  getBestSellingProducts
} from "../models/productModel.js";
import {
  getAllOrdersAdmin,
  getOrderDetailsInsecure,
  updateOrderStatus,
  cancelOrder,
  getDashboardStats
} from "../models/orderModel.js";
import {
  getAllUsers,
  findUserById,
  updateUserRole
} from "../models/userModel.js";
import {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon
} from "../models/couponModel.js";
import {
  getAllReviewsAdmin,
  deleteReviewAdmin
} from "../models/reviewModel.js";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// INTENTIONAL LAB VULNERABILITY (File Upload):
// Deliberately permissive multer storage preserving original name / extension without strict content-type verification
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Admin Dashboard Overview
export async function showDashboard(req, res) {
  try {
    const stats = await getDashboardStats();
    const recentOrders = await getAllOrdersAdmin();
    const lowStock = await getLowStockProducts(10);
    const bestSellers = await getBestSellingProducts(5);

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      stats,
      recentOrders: recentOrders.slice(0, 5),
      lowStock,
      bestSellers,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).render("errors/500", { message: "Failed to load admin dashboard." });
  }
}

// Products Management
export async function showProducts(req, res) {
  try {
    const { search = "", category = "", page = 1 } = req.query;
    const result = await getAllProducts({
      search,
      category,
      page: parseInt(page, 10) || 1,
      limit: 20,
      includeInactive: true
    });

    res.render("admin/products/index", {
      title: "Product Inventory",
      products: result.products,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalItems: result.totalItems,
      search,
      category,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin products error:", err);
    res.status(500).render("errors/500", { message: "Failed to load products." });
  }
}

export function showAddProduct(req, res) {
  res.render("admin/products/form", {
    title: "Add New Product",
    product: null,
    error: req.query.error || null
  });
}

export async function addProduct(req, res) {
  try {
    const { name, description, price, stock, category, is_active } = req.body;
    let image_url = req.body.image_url || "";

    if (req.file) {
      image_url = `/uploads/${req.file.filename}`;
    }

    if (!name || !price || stock === undefined) {
      return res.redirect("/admin/products/new?error=" + encodeURIComponent("Name, price, and stock are required."));
    }

    await createProduct({
      name: name.trim(),
      description: description?.trim() || "",
      price: Number(price),
      stock: Number(stock),
      category: category || "Accessories",
      image_url: image_url || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85",
      is_active: is_active === "on" || is_active === "true" || is_active === true
    });

    res.redirect("/admin/products?msg=" + encodeURIComponent("Product added successfully!"));
  } catch (err) {
    console.error("Add product error:", err);
    res.redirect("/admin/products/new?error=" + encodeURIComponent("Failed to create product."));
  }
}

export async function showEditProduct(req, res) {
  try {
    const product = await getProductById(req.params.id);
    if (!product) {
      return res.status(404).render("errors/404", { message: "Product not found." });
    }

    res.render("admin/products/form", {
      title: `Edit ${product.name}`,
      product,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Edit product load error:", err);
    res.status(500).render("errors/500", { message: "Failed to load product." });
  }
}

export async function editProduct(req, res) {
  try {
    const id = req.params.id;
    const { name, description, price, stock, category, is_active } = req.body;
    let image_url = req.body.image_url;

    if (req.file) {
      image_url = `/uploads/${req.file.filename}`;
    }

    await updateProduct(id, {
      name: name.trim(),
      description: description?.trim() || "",
      price: Number(price),
      stock: Number(stock),
      category: category || "Accessories",
      image_url,
      is_active: is_active === "on" || is_active === "true" || is_active === true
    });

    res.redirect("/admin/products?msg=" + encodeURIComponent("Product updated successfully!"));
  } catch (err) {
    console.error("Update product error:", err);
    res.redirect(`/admin/products/${req.params.id}/edit?error=` + encodeURIComponent("Failed to update product."));
  }
}

export async function deleteProductAction(req, res) {
  try {
    await deleteProduct(req.params.id);
    res.redirect("/admin/products?msg=" + encodeURIComponent("Product removed from inventory."));
  } catch (err) {
    console.error("Delete product error:", err);
    res.redirect("/admin/products?error=" + encodeURIComponent("Failed to delete product."));
  }
}

export async function toggleProductActiveAction(req, res) {
  try {
    const updated = await toggleProductActive(req.params.id);
    res.redirect("/admin/products?msg=" + encodeURIComponent(`Product is now ${updated.is_active ? 'active' : 'inactive'}.`));
  } catch (err) {
    console.error("Toggle product error:", err);
    res.redirect("/admin/products?error=" + encodeURIComponent("Failed to toggle product status."));
  }
}

// Order Management
export async function showOrders(req, res) {
  try {
    const status = req.query.status || "all";
    const orders = await getAllOrdersAdmin({ status });

    res.render("admin/orders/index", {
      title: "Order Management",
      orders,
      currentStatus: status,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).render("errors/500", { message: "Failed to load orders." });
  }
}

export async function showOrderDetails(req, res) {
  try {
    const result = await getOrderDetailsInsecure(req.params.id);
    if (!result) {
      return res.status(404).render("errors/404", { message: "Order not found." });
    }

    res.render("admin/orders/details", {
      title: `Admin Order #${result.order.id}`,
      order: result.order,
      items: result.items,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin order details error:", err);
    res.status(500).render("errors/500", { message: "Failed to load order details." });
  }
}

export async function updateOrderStatusAction(req, res) {
  try {
    const { status } = req.body;
    const allowed = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.redirect(`/admin/orders/${req.params.id}?error=` + encodeURIComponent("Invalid order status."));
    }

    if (status === "Cancelled") {
      await cancelOrder(req.params.id, null, true);
    } else {
      await updateOrderStatus(req.params.id, status);
    }

    res.redirect(`/admin/orders/${req.params.id}?msg=` + encodeURIComponent(`Order status updated to ${status}.`));
  } catch (err) {
    console.error("Update status error:", err);
    res.redirect(`/admin/orders/${req.params.id}?error=` + encodeURIComponent(err.message));
  }
}

// Customer Management
export async function showCustomers(req, res) {
  try {
    const users = await getAllUsers();
    res.render("admin/customers/index", {
      title: "Customer Directory",
      users,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin customers error:", err);
    res.status(500).render("errors/500", { message: "Failed to load customers." });
  }
}

export async function showCustomerDetails(req, res) {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).render("errors/404", { message: "Customer not found." });
    }

    const { getUserOrders } = await import("../models/orderModel.js");
    const { getUserAddresses } = await import("../models/addressModel.js");
    const orders = await getUserOrders(user.id);
    const addresses = await getUserAddresses(user.id);

    res.render("admin/customers/details", {
      title: `Customer: ${user.name}`,
      customer: user,
      orders,
      addresses,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin customer details error:", err);
    res.status(500).render("errors/500", { message: "Failed to load customer details." });
  }
}

export async function updateCustomerRoleAction(req, res) {
  try {
    const { role } = req.body;
    if (!["admin", "customer"].includes(role)) {
      return res.redirect(`/admin/customers/${req.params.id}?error=` + encodeURIComponent("Invalid role."));
    }

    await updateUserRole(req.params.id, role);
    res.redirect(`/admin/customers/${req.params.id}?msg=` + encodeURIComponent(`Customer role updated to ${role}.`));
  } catch (err) {
    console.error("Role update error:", err);
    res.redirect(`/admin/customers/${req.params.id}?error=` + encodeURIComponent("Failed to update role."));
  }
}

// Coupon Management
export async function showCoupons(req, res) {
  try {
    const coupons = await getAllCoupons();
    res.render("admin/coupons/index", {
      title: "Coupons & Discounts",
      coupons,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin coupons error:", err);
    res.status(500).render("errors/500", { message: "Failed to load coupons." });
  }
}

export async function addCouponAction(req, res) {
  try {
    const { code, discount_type, discount_value, min_order_amount, max_uses, expires_at } = req.body;
    if (!code || !discount_value) {
      return res.redirect("/admin/coupons?error=" + encodeURIComponent("Coupon code and value are required."));
    }

    await createCoupon({
      code,
      discount_type: discount_type || "percentage",
      discount_value: Number(discount_value),
      min_order_amount: Number(min_order_amount) || 0,
      max_uses: Number(max_uses) || 100,
      expires_at: expires_at || null
    });

    res.redirect("/admin/coupons?msg=" + encodeURIComponent("Coupon created successfully!"));
  } catch (err) {
    console.error("Add coupon error:", err);
    res.redirect("/admin/coupons?error=" + encodeURIComponent("Failed to create coupon. Code may already exist."));
  }
}

export async function editCouponAction(req, res) {
  try {
    const { code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active } = req.body;
    await updateCoupon(req.params.id, {
      code,
      discount_type,
      discount_value: Number(discount_value),
      min_order_amount: Number(min_order_amount) || 0,
      max_uses: Number(max_uses) || 100,
      expires_at: expires_at || null,
      is_active: is_active === "on" || is_active === "true" || is_active === true
    });

    res.redirect("/admin/coupons?msg=" + encodeURIComponent("Coupon updated."));
  } catch (err) {
    console.error("Edit coupon error:", err);
    res.redirect("/admin/coupons?error=" + encodeURIComponent("Failed to update coupon."));
  }
}

export async function deleteCouponAction(req, res) {
  try {
    await deleteCoupon(req.params.id);
    res.redirect("/admin/coupons?msg=" + encodeURIComponent("Coupon deleted."));
  } catch (err) {
    console.error("Delete coupon error:", err);
    res.redirect("/admin/coupons?error=" + encodeURIComponent("Failed to delete coupon."));
  }
}

// Review Management
export async function showReviews(req, res) {
  try {
    const reviews = await getAllReviewsAdmin();
    res.render("admin/reviews/index", {
      title: "Customer Reviews",
      reviews,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Admin reviews error:", err);
    res.status(500).render("errors/500", { message: "Failed to load reviews." });
  }
}

export async function deleteReviewAction(req, res) {
  try {
    await deleteReviewAdmin(req.params.id);
    res.redirect("/admin/reviews?msg=" + encodeURIComponent("Review removed."));
  } catch (err) {
    console.error("Delete review error:", err);
    res.redirect("/admin/reviews?error=" + encodeURIComponent("Failed to delete review."));
  }
}

// INTENTIONAL LAB VULNERABILITY (Broken Access Control):
// This endpoint discloses sensitive administrative statistics and user lists
// without any requireAdmin or requireAuth middleware!
export async function brokenAccessControlApi(req, res) {
  try {
    const stats = await getDashboardStats();
    const users = await getAllUsers();
    res.json({
      status: "success",
      message: "CONFIDENTIAL ADMIN METRICS (Intentional Broken Access Control Lab)",
      stats,
      userSample: users.map(u => ({ id: u.id, email: u.email, role: u.role }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
