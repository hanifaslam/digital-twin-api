const prisma = require('../../config/prisma')
const { responseHandler } = require('../../config/response')

const permissionController = {
  getAll: async (req, res) => {
    try {
      const modules = await prisma.module.findMany({
        orderBy: { sequence: 'asc' },
        include: {
          permissions: {
            orderBy: { sequence: 'asc' },
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      const formattedData = modules.map((m) => {
        const isDashboard = m.code.toLowerCase() === 'dashboard'
        const hasSinglePermission = m.permissions.length === 1

        if (isDashboard || hasSinglePermission) {
          const p = m.permissions[0]
          return {
            id: p ? p.id : m.id,
            code: m.code.toUpperCase(),
            name: m.name,
            children: []
          }
        }

        return {
          id: m.id,
          code: m.code.toUpperCase(),
          name: m.name,
          children: m.permissions.map((p) => ({
            id: p.id,
            code: p.name,
            name: p.name
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (l) => l.toUpperCase())
          }))
        }
      })

      return responseHandler(res, true, 'success', formattedData)
    } catch (error) {
      return responseHandler(res, false, error.message, null, 500)
    }
  }
}

module.exports = permissionController
