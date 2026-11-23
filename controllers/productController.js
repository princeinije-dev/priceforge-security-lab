import {
  getAllProducts,
  getProductById,
  getRelatedProducts,
  getDistinctCategories,
  searchProductsUnsafe
} from "../models/productModel.js";
import { getProductReviews, getProductRatingStats } from "../models/reviewModel.js";
import { isInWishlist } from "../models/wishlistModel.js";

export async function showProducts(req, res) {
  try {
    const {
      search = "",
      category = "",
      sort = "newest",
      minPrice,
      maxPrice,
      page = 1
    } = req.query;

    const limit = 12;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);

    const result = await getAllProducts({
      search,
      category,
      sort,
      minPrice,
      maxPrice,
      page: pageNum,
      limit
    });

    const categories = await getDistinctCategories();

    res.render("shop/products", {
      title: category ? `${category} Products` : "Explore Products",
      products: result.products,
      categories,
      currentCategory: category || "all",
      searchQuery: search,
      currentSort: sort,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalItems: result.totalItems
    });
  } catch (error) {
    console.error("Products error:", error);
    res.status(500).render("errors/500", { message: "Unable to load products." });
  }
}

export async function showProductDetails(req, res) {
  try {
    const productId = req.params.id;
    const product = await getProductById(productId);

    if (!product || (!product.is_active && (!req.user || req.user.role !== "admin"))) {
      return res.status(404).render("errors/404", { message: "Product not found or currently unavailable." });
    }

    const reviews = await getProductReviews(productId);
    const ratingStats = await getProductRatingStats(productId);
    const relatedProducts = await getRelatedProducts(product.category, product.id, 4);
    const wishlisted = req.user ? await isInWishlist(req.user.id, product.id) : false;

    res.render("shop/product-details", {
      title: product.name,
      product,
      reviews,
      ratingStats,
      relatedProducts,
      wishlisted,
      success: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Product details error:", error);
    res.status(500).render("errors/500", { message: "Unable to load product details." });
  }
}

// INTENTIONAL LAB VULNERABILITY (SQL Injection):
// Deliberately unsafe search endpoint demonstrating raw string concatenation in SQL
export async function vulnerableSearch(req, res) {
  const query = req.query.q || "";
  try {
    let products = [];
    if (query) {
      products = await searchProductsUnsafe(query);
    }
    const categories = await getDistinctCategories();

    res.render("shop/products", {
      title: "Vulnerable Search Lab",
      products,
      categories,
      currentCategory: "all",
      searchQuery: query,
      currentSort: "newest",
      minPrice: "",
      maxPrice: "",
      currentPage: 1,
      totalPages: 1,
      totalItems: products.length,
      isLabVulnerable: true
    });
  } catch (error) {
    // Deliberate verbose error disclosure for SQL injection debugging in the lab
    res.status(500).render("errors/500", {
      message: `Database Error in SQLi Lab Endpoint: ${error.message}`,
      errorDetail: error.stack
    });
  }
}
