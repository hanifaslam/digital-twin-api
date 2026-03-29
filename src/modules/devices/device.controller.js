const { DeviceType } = require('@prisma/client')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')

const deviceController = {
  create: async (req, res) => {
    try {
      const { name, type, room_id, mqtt_topic, stream_url, status } =
        req.body || {}

      if (!name || !type || !room_id) {
        return error(res, 'Missing required fields', 400)
      }

      const roomExists = await prisma.room.findUnique({
        where: { id: room_id }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      await prisma.device.create({
        data: {
          name,
          type: type.toUpperCase(),
          room_id,
          mqtt_topic: mqtt_topic || null,
          stream_url: stream_url || null,
          status:
            status !== undefined ? status === 'true' || status === true : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, type, room_id, status } = req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.name = { contains: q, mode: 'insensitive' }
      }

      if (type) {
        where.type = type
      }

      if (room_id) {
        where.room_id = room_id
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      const [devices, total] = await Promise.all([
        prisma.device.findMany({
          where,
          select: {
            id: true,
            name: true,
            type: true,
            room_id: true,
            room: {
              select: {
                name: true
              }
            },
            status: true,
            created_at: true,
            updated_at: true
          },
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.device.count({ where })
      ])

      const result = devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        room_name: device.room?.name,
        status: device.status,
        created_at: device.created_at,
        updated_at: device.updated_at
      }))

      const metadata = {
        per_page: perPage,
        current_page: page,
        total_row: total,
        total_page: Math.ceil(total / perPage)
      }

      return success(res, 'success', result, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const device = await prisma.device.findUnique({
        where: { id },
        include: {
          room: {
            select: {
              name: true
            }
          }
        }
      })

      if (!device) return error(res, 'Device not found', 404)

      const result = {
        id: device.id,
        name: device.name,
        type: device.type,
        room_id: device.room_id,
        room_name: device.room?.name,
        mqtt_topic: device.mqtt_topic,
        stream_url: device.stream_url,
        status: device.status,
        created_at: device.created_at,
        updated_at: device.updated_at
      }

      return success(res, 'success', result)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, type, room_id, mqtt_topic, stream_url, status } =
        req.body || {}

      const deviceExists = await prisma.device.findUnique({
        where: { id }
      })
      if (!deviceExists) return error(res, 'Device not found', 404)

      if (room_id) {
        const roomExists = await prisma.room.findUnique({
          where: { id: room_id }
        })
        if (!roomExists) return error(res, 'Room not found', 404)
      }

      let updateData = {
        name,
        type: type ? type.toUpperCase() : undefined,
        room_id,
        mqtt_topic: mqtt_topic === '' ? null : mqtt_topic,
        stream_url: stream_url === '' ? null : stream_url,
        status:
          status !== undefined
            ? status === 'true' || status === true
            : undefined
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      )

      if (Object.keys(updateData).length === 0) {
        return error(res, 'No valid fields provided for update', 400)
      }

      const updatedDevice = await prisma.device.update({
        where: { id },
        data: updateData,
        include: {
          room: {
            select: {
              name: true
            }
          }
        }
      })

      // Flatten response and order property: room_name after room_id
      const result = {
        id: updatedDevice.id,
        name: updatedDevice.name,
        type: updatedDevice.type,
        room_id: updatedDevice.room_id,
        room_name: updatedDevice.room?.name,
        mqtt_topic: updatedDevice.mqtt_topic,
        stream_url: updatedDevice.stream_url,
        status: updatedDevice.status,
        created_at: updatedDevice.created_at,
        updated_at: updatedDevice.updated_at
      }

      return success(res, 'success', result)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const deviceExists = await prisma.device.findUnique({
        where: { id }
      })
      if (!deviceExists) return error(res, 'Device not found', 404)

      await prisma.device.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const device = await prisma.device.findUnique({
        where: { id }
      })
      if (!device) return error(res, 'Device not found', 404)

      const newStatus = !device.status

      await prisma.device.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getTypes: async (req, res) => {
    try {
      const types = Object.values(DeviceType)
      return success(res, 'success', types)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = deviceController
