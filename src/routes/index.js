const express = require("express");
const router = express.Router();
const userRoutes = require("../modules/users/user.routes");
const lecturerRoutes = require("../modules/lecturers/lecturer.routes");
const authRoutes = require("../modules/auth/auth.routes");
const { authMiddleware } = require("../common/middlewares/auth.middleware");
const roleRoutes = require("../modules/roles/role.routes");

router.use("/auth", authRoutes); // Login, Refresh, Logout (Public)

// Semua route di bawah ini diproteksi (Wajib Login)
router.use("/users", authMiddleware, userRoutes);
router.use("/lecturers", authMiddleware, lecturerRoutes);
router.use("/roles", authMiddleware, roleRoutes);

module.exports = router;
