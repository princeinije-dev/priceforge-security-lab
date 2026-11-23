import bcrypt from "bcrypt";
import {
  findUserById,
  updateUserProfile,
  updateUserPassword
} from "../models/userModel.js";
import {
  getUserAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddressInsecure,
  deleteAddressSecure,
  setDefaultAddress
} from "../models/addressModel.js";
import { getUserOrders } from "../models/orderModel.js";

export async function showDashboard(req, res) {
  try {
    const user = await findUserById(req.user.id);
    const orders = await getUserOrders(req.user.id);
    const addresses = await getUserAddresses(req.user.id);

    res.render("account/dashboard", {
      title: "My Account",
      accountUser: user,
      recentOrders: orders.slice(0, 3),
      totalOrders: orders.length,
      defaultAddress: addresses.find(a => a.is_default) || addresses[0] || null
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).render("errors/500", { message: "Failed to load account dashboard" });
  }
}

export async function showProfile(req, res) {
  try {
    const user = await findUserById(req.user.id);
    res.render("account/profile", {
      title: "Profile Settings",
      accountUser: user,
      error: req.query.error || null,
      success: req.query.msg || null
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).render("errors/500", { message: "Failed to load profile" });
  }
}

// INTENTIONAL LAB VULNERABILITY (CSRF):
// Standard POST route does not require or validate CSRF token
export async function updateProfile(req, res) {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.redirect("/account/profile?error=" + encodeURIComponent("Name and email are required."));
    }

    await updateUserProfile(req.user.id, name.trim(), email.trim().toLowerCase());
    res.redirect("/account/profile?msg=" + encodeURIComponent("Profile updated successfully."));
  } catch (err) {
    console.error("Update profile error:", err);
    res.redirect("/account/profile?error=" + encodeURIComponent("Failed to update profile. Email may already be in use."));
  }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.redirect("/account/profile?error=" + encodeURIComponent("New password must be at least 8 characters."));
    }

    if (newPassword !== confirmPassword) {
      return res.redirect("/account/profile?error=" + encodeURIComponent("New passwords do not match."));
    }

    const user = await findUserById(req.user.id);
    // Need full user with password hash
    const { pool } = await import("../config/db.js");
    const fullUserRes = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, fullUserRes.rows[0].password);

    if (!isMatch) {
      return res.redirect("/account/profile?error=" + encodeURIComponent("Current password is incorrect."));
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await updateUserPassword(req.user.id, hashed);

    res.redirect("/account/profile?msg=" + encodeURIComponent("Password changed successfully."));
  } catch (err) {
    console.error("Change password error:", err);
    res.redirect("/account/profile?error=" + encodeURIComponent("Failed to change password."));
  }
}

export async function showAddresses(req, res) {
  try {
    const addresses = await getUserAddresses(req.user.id);
    res.render("account/addresses", {
      title: "Delivery Addresses",
      addresses,
      error: req.query.error || null,
      success: req.query.msg || null
    });
  } catch (err) {
    console.error("Addresses error:", err);
    res.status(500).render("errors/500", { message: "Failed to load addresses" });
  }
}

export async function addAddress(req, res) {
  try {
    const { full_name, phone, street_address, city, state, postal_code, country, is_default } = req.body;

    if (!full_name || !street_address || !city || !state) {
      return res.redirect("/account/addresses?error=" + encodeURIComponent("Please fill in all required address fields."));
    }

    await createAddress(req.user.id, {
      full_name,
      phone,
      street_address,
      city,
      state,
      postal_code,
      country,
      is_default: Boolean(is_default)
    });

    res.redirect("/account/addresses?msg=" + encodeURIComponent("New address saved."));
  } catch (err) {
    console.error("Add address error:", err);
    res.redirect("/account/addresses?error=" + encodeURIComponent("Failed to save address."));
  }
}

export async function editAddress(req, res) {
  try {
    const addressId = req.params.id;
    const { full_name, phone, street_address, city, state, postal_code, country, is_default } = req.body;

    // Check ownership
    const existing = await getAddressById(addressId);
    if (!existing) {
      return res.redirect("/account/addresses?error=" + encodeURIComponent("Address not found."));
    }

    await updateAddress(addressId, {
      full_name,
      phone,
      street_address,
      city,
      state,
      postal_code,
      country,
      is_default: Boolean(is_default)
    });

    res.redirect("/account/addresses?msg=" + encodeURIComponent("Address updated successfully."));
  } catch (err) {
    console.error("Edit address error:", err);
    res.redirect("/account/addresses?error=" + encodeURIComponent("Failed to update address."));
  }
}

// INTENTIONAL LAB VULNERABILITY (IDOR):
// Address deletion endpoint accepts address ID and deletes it without verifying ownership
export async function deleteAddressInsecureAction(req, res) {
  try {
    const addressId = req.params.id;
    await deleteAddressInsecure(addressId);
    res.redirect("/account/addresses?msg=" + encodeURIComponent("Address deleted (IDOR lab endpoint)."));
  } catch (err) {
    console.error("Delete address error:", err);
    res.redirect("/account/addresses?error=" + encodeURIComponent("Failed to delete address."));
  }
}

// SECURE COUNTERPART:
export async function deleteAddressSecureAction(req, res) {
  try {
    const addressId = req.params.id;
    const deleted = await deleteAddressSecure(addressId, req.user.id);
    if (!deleted) {
      return res.redirect("/account/addresses?error=" + encodeURIComponent("Address not found or unauthorized."));
    }
    res.redirect("/account/addresses?msg=" + encodeURIComponent("Address deleted securely."));
  } catch (err) {
    console.error("Delete address error:", err);
    res.redirect("/account/addresses?error=" + encodeURIComponent("Failed to delete address."));
  }
}

export async function setDefaultAddressAction(req, res) {
  try {
    const addressId = req.params.id;
    await setDefaultAddress(addressId, req.user.id);
    res.redirect("/account/addresses?msg=" + encodeURIComponent("Default address updated."));
  } catch (err) {
    console.error("Set default address error:", err);
    res.redirect("/account/addresses?error=" + encodeURIComponent("Failed to update default address."));
  }
}
