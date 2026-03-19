const prisma = require("../../config/prisma");
const { responseHandler } = require("../../config/response");

const roleController = {
  create: async (req, res) => {
    try {
      const { name, status, code, access } = req.body || {};

      const checkedIds = [];
      if (access && Array.isArray(access)) {
        access.forEach((item) => {
          if (item.is_checked) {
            checkedIds.push(item.id);
          }
          if (item.children && Array.isArray(item.children)) {
            item.children.forEach((child) => {
              if (child.is_checked) {
                checkedIds.push(child.id);
              }
            });
          }
        });
      }

      const validPermissions = await prisma.permission.findMany({
        where: { id: { in: checkedIds } },
        select: { id: true },
      });

      await prisma.role.create({
        data: {
          name: name,
          status: status,
          code: code,
          permissions: {
            create: validPermissions.map((p) => ({
              permission_id: p.id,
            })),
          },
        },
      });

      return responseHandler(res, true, "Role created successfully", null, 201);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 400);
    }
  },

  getListRole: async (req, res) => {
    try {
      const { q, status } = req.query || {};
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.per_page) || 10;
      const skip = (page - 1) * limit;

      let where = {};

      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
        ];
      }

      if (status !== undefined && status !== "") {
        where.status = status === "true" || status === true;
      }

      const [roles, total] = await Promise.all([
        prisma.role.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
        }),
        prisma.role.count({ where }),
      ]);

      const formattedRoles = roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        status: role.status,
        created_at: role.created_at,
        is_active: role.status,
      }));

      const metadata = {
        per_page: limit,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / limit),
      };

      return responseHandler(
        res,
        true,
        "success",
        formattedRoles,
        200,
        metadata,
      );
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },

  showRole: async (req, res) => {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          permissions: true,
        },
      });

      if (!role) {
        return responseHandler(res, false, "Role not found", null, 404);
      }

      const rolePermissionIds = role.permissions.map((p) => p.permission_id);

      const modules = await prisma.module.findMany({
        orderBy: { sequence: "asc" },
        include: {
          permissions: true,
        },
      });

      const access = modules.map((m) => {
        const isModuleChecked = m.permissions.some((p) =>
          rolePermissionIds.includes(p.id),
        );

        return {
          id: m.id,
          code: m.code.toUpperCase(),
          name: m.name,
          is_checked: isModuleChecked,
          children:
            m.code.toLowerCase() === "dashboard"
              ? []
              : m.permissions.map((p) => ({
                  id: p.id,
                  code: p.name,
                  name: p.name
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/\b\w/g, (l) => l.toUpperCase()),
                  is_checked: rolePermissionIds.includes(p.id),
                })),
        };
      });

      const formattedData = {
        id: role.id,
        code: role.code,
        name: role.name,
        status: role.status,
        is_active: role.status,
        access: access,
      };

      return responseHandler(res, true, "success", formattedData);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, status, code, access } = req.body || {};

      const roleExists = await prisma.role.findUnique({ where: { id } });
      if (!roleExists) {
        return responseHandler(res, false, "Role not found", null, 404);
      }

      const checkedIds = [];
      if (access && Array.isArray(access)) {
        access.forEach((item) => {
          if (item.is_checked) {
            checkedIds.push(item.id);
          }
          if (item.children && Array.isArray(item.children)) {
            item.children.forEach((child) => {
              if (child.is_checked) {
                checkedIds.push(child.id);
              }
            });
          }
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id },
          data: {
            name: name,
            code: code,
            status: status,
          },
        });

        await tx.rolePermission.deleteMany({
          where: { role_id: id },
        });

        const validPermissions = await tx.permission.findMany({
          where: { id: { in: checkedIds } },
          select: { id: true },
        });

        if (validPermissions.length > 0) {
          await tx.rolePermission.createMany({
            data: validPermissions.map((p) => ({
              role_id: id,
              permission_id: p.id,
            })),
          });
        }
      });

      return responseHandler(res, true, "Role updated successfully", null);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) {
        return responseHandler(res, false, "Role not found", null, 404);
      }

      const newStatus = !role.status;

      await prisma.role.update({
        where: { id },
        data: { status: newStatus },
      });

      return responseHandler(res, true, "success", null);
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500);
    }
  },
};

module.exports = roleController;
