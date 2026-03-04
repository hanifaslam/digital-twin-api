const prisma = require("../../config/prisma");
const { responseHandler } = require("../../config/response");

const roleController = {
  create: async (req, res) => {
    try {
      const { name } = req.body;
      const role = await prisma.role.create({
        data: { name: name.toUpperCase() },
      });
      return responseHandler(res, true, "Role created successfully", role, 201);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 400);
    }
  },

  getAll: async (req, res) => {
    try {
      const roles = await prisma.role.findMany();
      return responseHandler(res, true, "Roles retrieved successfully", roles);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },
};

module.exports = roleController;
