import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  showDashboard,
  showProfile,
  updateProfile,
  changePassword,
  showAddresses,
  addAddress,
  editAddress,
  deleteAddressInsecureAction,
  deleteAddressSecureAction,
  setDefaultAddressAction
} from "../controllers/accountController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", showDashboard);
router.get("/profile", showProfile);
router.post("/profile", updateProfile); // Vulnerable to CSRF
router.post("/change-password", changePassword);

router.get("/addresses", showAddresses);
router.post("/addresses/add", addAddress);
router.post("/addresses/:id/edit", editAddress);
router.post("/addresses/:id/delete-insecure", deleteAddressInsecureAction); // Vulnerable to IDOR
router.post("/addresses/:id/delete", deleteAddressSecureAction);
router.post("/addresses/:id/default", setDefaultAddressAction);

export default router;
