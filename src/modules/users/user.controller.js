const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const { success, error } = require("../../config/response");

const userController = {
  create: async (req, res) => {
    try {
      const { name, email, password, role_id } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email, password: hashedPassword, role_id },
        select: {
          id: true,
          name: true,
          email: true,
          role_id: true,
          created_at: true,
        },
      });
      return success(res, "success", user, 201);
    } catch (err) {
      return error(res, err.message, 400);
    }
  },

  getAll: async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role_id: true,
          created_at: true,
          role: true,
          lecturer: true,
        },
      });

      return success(res, "success", users);
    } catch (err) {
      return error(res, err.message, 500);
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role_id: true,
          created_at: true,
          role: true,
          lecturer: true,
        },
      });

      if (!user) return error(res, "User not found", 404);

      return success(res, "success", user);
    } catch (err) {
      return error(res, err.message, 500);
    }
  },
};

module.exports = userController;
