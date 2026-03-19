const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../config/prisma");
const { success, error } = require("../../config/response");

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

const login = async (req, res) => {
  try {
    const { login: username, password, remember_me } = req.body || {};

    const user = await prisma.user.findFirst({
      where: { username },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  include: { module: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return error(res, "Username atau password salah", 401);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return error(res, "Username atau password salah", 401);

    const { accessToken, refreshToken } = generateTokens(user);

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    };

    res.cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      ...(remember_me && { maxAge: 7 * 24 * 60 * 60 * 1000 }),
    });

    return success(res, "success", {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role_name: user.role.name,
      role_id: user.role_id,
    });
  } catch (err) {
    console.error(err);
    return error(res, "Internal server error", 500);
  }
};

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return error(res, "Refresh token missing", 401);

    jwt.verify(token, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) return error(res, "Invalid refresh token", 403);

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { role: true },
      });

      if (!user) return error(res, "User not found", 401);

      const accessToken = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: "15m" },
      );

      // Update Access Token Cookie
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 15 * 60 * 1000,
      });

      return success(res, "success");
    });
  } catch (err) {
    return error(res, "Internal server error", 500);
  }
};

const getMe = async (req, res) => {
  try {
    const user = req.user;

    const formatAccess = (permissions) => {
      const modules = {};

      permissions.forEach((rp) => {
        const p = rp.permission;
        const m = p.module;

        if (!modules[m.id]) {
          modules[m.id] = {
            id: m.id,
            name: m.name,
            code: m.code,
            children: [],
          };
        }

        if (m.code !== "dashboard") {
          modules[m.id].children.push({
            id: p.id,
            name: p.name
              .replace(/_/g, " ")
              .toLowerCase()
              .replace(/\b\w/g, (l) => l.toUpperCase()),
            code: p.name.toLowerCase(),
          });
        }
      });

      return Object.values(modules).sort(
        (a, b) => (a.sequence || 0) - (b.sequence || 0),
      );
    };

    const access = formatAccess(user.role.permissions);

    return success(res, "success", {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role_name: user.role.name,
      role_id: user.role_id,
      access,
    });
  } catch (err) {
    return error(res, "Internal server error", 500);
  }
};

const logout = (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  };

  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  return success(res, "success");
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return error(res, "Email tidak terdaftar", 404);

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 jam

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_token: token,
        reset_password_expires: expires,
      },
    });

    return success(res, "Token reset password berhasil dibuat", { token });
  } catch (err) {
    console.error(err);
    return error(res, "Internal server error", 500);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirm_password } = req.body || {};

    if (password !== confirm_password) {
      return error(res, "Konfirmasi password tidak cocok", 400);
    }

    const user = await prisma.user.findFirst({
      where: {
        reset_password_token: token,
        reset_password_expires: { gte: new Date() },
      },
    });

    if (!user)
      return error(res, "Token tidak valid atau sudah kadaluwarsa", 400);

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null,
      },
    });

    return success(res, "Password berhasil diperbarui");
  } catch (err) {
    console.error(err);
    return error(res, "Internal server error", 500);
  }
};

const changePassword = async (req, res) => {
  try {
    const { old_password, new_password, confirm_password } = req.body || {};
    const user_id = req.user.id;

    if (new_password !== confirm_password) {
      return error(res, "Konfirmasi password baru tidak cocok", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: user_id } });
    if (!user) return error(res, "User tidak ditemukan", 404);

    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) return error(res, "Password lama salah", 400);

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return success(res, "Password berhasil diubah");
  } catch (err) {
    console.error(err);
    return error(res, "Internal server error", 500);
  }
};

module.exports = {
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
};
