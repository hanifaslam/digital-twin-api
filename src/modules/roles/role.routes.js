const express = require("express");
const router = express.Router();
const roleController = require("./role.controller");

router.post("/", roleController.create);
router.get("/", roleController.getAll);

module.exports = router;
