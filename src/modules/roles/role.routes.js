const express = require("express");
const router = express.Router();
const roleController = require("./role.controller");

router.post("/", roleController.create);
router.get("/:id", roleController.showRole);
router.patch("/:id", roleController.update);
router.patch("/:id/status", roleController.toggleStatus);
router.get("/", roleController.getListRole);

module.exports = router;
