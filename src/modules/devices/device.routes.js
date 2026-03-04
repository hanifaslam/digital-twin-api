const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  checkPermission,
  checkRoomAccess,
} = require("../../common/middlewares/auth.middleware");
const { responseHandler } = require("../../config/response");
const prisma = require("../../config/prisma");

// Endpoint untuk Control Device
router.post(
  "/control",
  authMiddleware,
  checkPermission("DEVICE_CONTROL"), // Pastikan punya ijin control
  checkRoomAccess, // Khusus dosen, cek ruangan
  async (req, res) => {
    try {
      const { room_id, light, ac } = req.body;
      const updated = await prisma.deviceStatus.upsert({
        where: { room_id },
        update: { light, ac },
        create: { room_id, light, ac },
      });
      return responseHandler(res, true, "Device updated", updated);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },
);

module.exports = router;
