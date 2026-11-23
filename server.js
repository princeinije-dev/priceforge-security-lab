import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db.js";
import { runMigrations } from "./config/migrate.js";
import { populateUser } from "./middleware/authMiddleware.js";

// Route imports
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser mounted before all routes
app.use(cookieParser());

// Static assets
app.use(express.static(path.join(process.cwd(), "public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// Global user session & template locals middleware
app.use(populateUser);

// Mount application routes
app.get("/", (req, res) => {
  res.redirect("/products");
});

app.use("/products", productRoutes);
app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/wishlist", wishlistRoutes);
app.use("/orders", orderRoutes);
app.use("/account", accountRoutes);
app.use("/admin", adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render("errors/404", {
    title: "Page Not Found",
    message: "The page or resource you are looking for does not exist."
  });
});

// 500 error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Application Error:", err);
  res.status(500).render("errors/500", {
    title: "Server Error",
    message: "An internal server error occurred.",
    errorDetail: process.env.NODE_ENV === "development" ? err.stack : null
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`PriceForge running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
