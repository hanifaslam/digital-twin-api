const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const prisma = require("../../config/prisma");
const { success, error } = require("../../config/response");

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
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
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user) return error(res, "Email atau password salah", 401);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return error(res, "Email atau password salah", 401);

    const { accessToken, refreshToken } = generateTokens(user);

    // 1. Set Access Token di Cookie (HttpOnly)
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 menit
    });

    // 2. Set Refresh Token di Cookie (HttpOnly)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
    });

    // Response Bersih (Tanpa token di body)
    return success(res, "success", {
      user: {
        id: user.id,
        name: user.name,
        role: user.role.name,
      },
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
        { id: user.id, email: user.email },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: "15m" },
      );

      // Update Access Token Cookie
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 15 * 60 * 1000,
      });

      return success(res, "success");
    });
  } catch (err) {
    return error(res, "Internal server error", 500);
  }
};

const logout = (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };

  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  return success(res, "success");
};

module.exports = { login, refreshToken, logout };
