const prisma = require("../../config/prisma");
const { responseHandler } = require("../../config/response");

const lecturerController = {
  create: async (req, res) => {
    try {
      const { name, nip, user_id } = req.body;
      const lecturer = await prisma.lecturer.create({
        data: { name, nip, user_id },
      });
      return responseHandler(
        res,
        true,
        "Lecturer created successfully",
        lecturer,
        201,
      );
    } catch (error) {
      return responseHandler(res, false, error.message, null, 400);
    }
  },

  getAll: async (req, res) => {
    try {
      const lecturers = await prisma.lecturer.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role_id: true,
              created_at: true,
            },
          },
        },
      });
      return responseHandler(
        res,
        true,
        "Lecturers retrieved successfully",
        lecturers,
      );
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const lecturer = await prisma.lecturer.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role_id: true,
              created_at: true,
            },
          },
        },
      });
      if (!lecturer) {
        return responseHandler(res, false, "Lecturer not found", null, 404);
      }
      return responseHandler(
        res,
        true,
        "Lecturer retrieved successfully",
        lecturer,
      );
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },
};

module.exports = lecturerController;
