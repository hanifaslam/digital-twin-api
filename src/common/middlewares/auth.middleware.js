const jwt = require("jsonwebtoken");
const prisma = require("../../config/prisma");
const { error } = require("../../config/response");

const authMiddleware = async (req, res, next) => {
  try {
    // 1. Cek token di Cookie (Utama) atau Header (Cadangan)
    const token =
      req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

    if (!token) return error(res, "Unauthorized - Access token missing", 401);

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        lecturer: true,
      },
    });

    if (!user) return error(res, "User not found", 401);

    const permissions = user.role.permissions.map((rp) => rp.permission.name);

    req.user = {
      ...user,
      permissions,
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return error(res, "Access token expired", 401);
    }
    return error(res, "Invalid token", 401);
  }
};

const checkPermission = (permissionName) => {
  return (req, res, next) => {
    if (req.user.role.name === "SUPERADMIN") return next();

    if (!req.user.permissions.includes(permissionName)) {
      return error(res, "You don't have permission to access this module", 403);
    }
    next();
  };
};

const checkRoomAccess = async (req, res, next) => {
  const { room_id } = req.body || req.params;
  const user = req.user;

  if (["SUPERADMIN", "HELPER"].includes(user.role.name)) return next();

  if (user.role.name === "DOSEN") {
    if (!user.lecturer) return error(res, "Lecturer profile not found", 403);

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const currentDay = days[now.getDay()];

    const activeSchedule = await prisma.schedule.findFirst({
      where: {
        lecturer_id: user.lecturer.id,
        room_id: room_id,
        day: currentDay,
        start_time: { lte: currentTime },
        end_time: { gte: currentTime },
      },
    });

    if (activeSchedule) return next();
  }

  return error(res, "You don't have active access to this room", 403);
};

module.exports = { authMiddleware, checkPermission, checkRoomAccess };
