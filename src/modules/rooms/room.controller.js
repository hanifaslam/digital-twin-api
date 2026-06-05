const path = require('path')
const XLSX = require('xlsx')
const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')
const { getJakartaScheduleContext } = require('../../utils/date')

const ROOM_TEMPLATE_PATH = path.join(
  process.cwd(),
  'room_building_upload_template.xlsx'
)
const ROOM_TEMPLATE_HEADERS = {
  building_name: ['building name', 'building', 'gedung'],
  building_code: ['building code', 'kode gedung', 'code'],
  floor_name: ['floor name', 'floor', 'lantai'],
  room_name: ['room name', 'room', 'ruang'],
  status: ['status']
}

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

const findColumnValue = (row = {}, aliases = []) => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeHeader(key),
    value
  ])

  for (const alias of aliases) {
    const found = normalizedEntries.find(([key]) => key === alias)
    if (found) {
      return found[1]
    }
  }

  return undefined
}

const normalizeValue = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const normalizeStatus = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) return true
  if (['true', '1', 'active', 'aktif', 'yes'].includes(normalized)) return true
  if (['false', '0', 'inactive', 'nonaktif', 'no'].includes(normalized)) {
    return false
  }

  return null
}

const parseRoomWorkbookRows = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false
  })

  return rows
    .map((row, index) => ({
      row_number: index + 2,
      building_name: normalizeValue(
        findColumnValue(row, ROOM_TEMPLATE_HEADERS.building_name)
      ),
      building_code: normalizeValue(
        findColumnValue(row, ROOM_TEMPLATE_HEADERS.building_code)
      ).toUpperCase(),
      floor_name: normalizeValue(
        findColumnValue(row, ROOM_TEMPLATE_HEADERS.floor_name)
      ),
      room_name: normalizeValue(
        findColumnValue(row, ROOM_TEMPLATE_HEADERS.room_name)
      ),
      status: normalizeStatus(findColumnValue(row, ROOM_TEMPLATE_HEADERS.status))
    }))
    .filter(
      (row) =>
        row.building_name ||
        row.building_code ||
        row.floor_name ||
        row.room_name
    )
}

const getRoomDependencyCount = (room) => {
  const schedules = room?._count?.schedules || 0
  const sensorLogs = room?._count?.sensor_logs || 0
  const devices = room?._count?.devices || 0
  const deviceStatus = room?.device_status ? 1 : 0

  return schedules + sensorLogs + devices + deviceStatus
}

const withDeactivationFlag = (room) => {
  const { _count, device_status, ...roomData } = room

  return {
    ...roomData,
    can_deactivate: getRoomDependencyCount(room) === 0
  }
}

const mergeContiguousRoomSchedules = (items = [], currentTime = '00:00') => {
  const grouped = []

  items.forEach((item) => {
    const previousItem = grouped[grouped.length - 1]

    const hasSameIdentity =
      previousItem &&
      previousItem.course_name === item.course_name &&
      previousItem.course_code === item.course_code &&
      previousItem.class_id === item.class_id &&
      previousItem.class_name === item.class_name &&
      previousItem.lecturer_name === item.lecturer_name

    const isContiguous =
      hasSameIdentity && previousItem.end_time === item.start_time

    if (isContiguous) {
      previousItem.end_time = item.end_time
      previousItem.is_online =
        currentTime >= previousItem.start_time &&
        currentTime <= previousItem.end_time
      return
    }

    grouped.push({ ...item })
  })

  return grouped
}

const roomController = {
  downloadTemplate: async (req, res) => {
    try {
      return res.download(ROOM_TEMPLATE_PATH, 'room_building_upload_template.xlsx')
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAllRooms: async (req, res) => {
    try {
      const { building_id } = req.query || {}

      let where = {
        status: true
      }

      if (building_id) {
        where.building_id = building_id
      }

      const rooms = await prisma.room.findMany({
        where,
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      })

      return success(res, 'success', rooms)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  create: async (req, res) => {
    try {
      const { name, building_id, floor_id, status } = req.body || {}

      if (!name || !building_id || !floor_id) {
        return error(res, 'Missing required fields', 400)
      }

      const existingRoom = await prisma.room.findFirst({
        where: { name, building_id }
      })

      if (existingRoom) {
        return error(res, 'Room name already exists in this building', 400)
      }

      const [buildingExists, floorExists] = await Promise.all([
        prisma.building.findUnique({
          where: { id: building_id },
          select: { id: true }
        }),
        prisma.floor.findUnique({
          where: { id: floor_id },
          select: { id: true }
        })
      ])

      if (!buildingExists) {
        return error(res, 'Building not found', 400)
      }

      if (!floorExists) {
        return error(res, 'Floor not found', 400)
      }

      await prisma.room.create({
        data: {
          name,
          building_id,
          floor_id,
          status:
            status !== undefined ? status === 'true' || status === true : true
        }
      })

      return success(res, 'success', null, 201)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  uploadExcel: async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return error(res, 'Excel file is required', 400)
      }

      let rows = []

      try {
        rows = parseRoomWorkbookRows(req.file.buffer)
      } catch (parseError) {
        return error(
          res,
          `Failed to read Excel file: ${parseError.message}`,
          400
        )
      }

      if (rows.length === 0) {
        return error(res, 'Excel file has no room rows to import', 400)
      }

      const skipped = []
      const validRows = []
      const duplicateKeysInFile = new Set()
      const seenKeys = new Set()

      rows.forEach((row) => {
        const rowErrors = []

        if (!row.building_name) {
          rowErrors.push('Building name is required')
        }

        if (!row.floor_name) {
          rowErrors.push('Floor name is required')
        }

        if (!row.room_name) {
          rowErrors.push('Room name is required')
        }

        if (row.status === null) {
          rowErrors.push('Status must be a boolean-like value')
        }

        const uniqueKey = [
          row.building_name.toLowerCase(),
          row.floor_name.toLowerCase(),
          row.room_name.toLowerCase()
        ].join('::')

        if (seenKeys.has(uniqueKey)) {
          duplicateKeysInFile.add(uniqueKey)
        } else {
          seenKeys.add(uniqueKey)
        }

        if (duplicateKeysInFile.has(uniqueKey)) {
          rowErrors.push('Duplicate room found in the uploaded file')
        }

        if (rowErrors.length > 0) {
          skipped.push({
            row_number: row.row_number,
            building_name: row.building_name || null,
            floor_name: row.floor_name || null,
            room_name: row.room_name || null,
            reason: rowErrors.join('; ')
          })
          return
        }

        validRows.push(row)
      })

      if (validRows.length === 0) {
        return error(res, 'No valid room rows found in the uploaded file', 400)
      }

      const createdRooms = await prisma.$transaction(async (tx) => {
        const created = []

        for (const row of validRows) {
          let building = null

          if (row.building_code) {
            building = await tx.building.findFirst({
              where: {
                OR: [
                  { code: row.building_code },
                  { name: row.building_name }
                ]
              }
            })
          } else {
            building = await tx.building.findFirst({
              where: { name: row.building_name }
            })
          }

          if (!building) {
            building = await tx.building.create({
              data: {
                name: row.building_name,
                code: row.building_code || null,
                status: true
              }
            })
          }

          const floor =
            (await tx.floor.findFirst({
              where: { name: row.floor_name }
            })) ||
            (await tx.floor.create({
              data: {
                name: row.floor_name,
                status: true
              }
            }))

          const existingRoom = await tx.room.findFirst({
            where: {
              name: row.room_name,
              building_id: building.id
            },
            include: {
              building: {
                select: { id: true, name: true, code: true }
              },
              floor: {
                select: { id: true, name: true }
              }
            }
          })

          if (existingRoom) {
            skipped.push({
              row_number: row.row_number,
              building_name: row.building_name,
              floor_name: row.floor_name,
              room_name: row.room_name,
              reason: 'Room already exists in this building'
            })
            continue
          }

          const room = await tx.room.create({
            data: {
              name: row.room_name,
              building_id: building.id,
              floor_id: floor.id,
              status: row.status
            },
            include: {
              building: {
                select: { id: true, name: true, code: true }
              },
              floor: {
                select: { id: true, name: true }
              }
            }
          })

          created.push(room)
        }

        return created
      })

      return success(
        res,
        skipped.length > 0
          ? 'Room import completed with some skipped rows'
          : 'Room import completed successfully',
        {
          created_count: createdRooms.length,
          skipped_count: skipped.length,
          created: createdRooms.map((room) => ({
            id: room.id,
            room_name: room.name,
            building_name: room.building?.name || null,
            building_code: room.building?.code || null,
            floor_name: room.floor?.name || null,
            status: room.status
          })),
          skipped
        },
        201
      )
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getAll: async (req, res) => {
    try {
      const { q, status, building_id, floor_id } = req.query || {}
      const statuses = [
        ...new Set(
          status
            ?.split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item === 'true' || item === 'false')
        )
      ]
      const buildingIds = building_id
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      let where = {}

      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { building: { name: { contains: q, mode: 'insensitive' } } }
        ]
      }

      if (statuses?.length === 1) {
        where.status = statuses[0] === 'true'
      }

      if (buildingIds?.length === 1) {
        where.building_id = buildingIds[0]
      }

      if (buildingIds?.length > 1) {
        where.building_id = {
          in: buildingIds
        }
      }

      if (floor_id) {
        where.floor_id = floor_id
      }

      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          include: {
            building: {
              select: { id: true, name: true, code: true }
            },
            floor: {
              select: { id: true, name: true }
            },
            _count: {
              select: {
                schedules: true,
                sensor_logs: true,
                devices: true
              }
            },
            device_status: {
              select: { id: true }
            }
          },
          skip,
          take: perPage,
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.room.count({ where })
      ])

      const metadata = buildPagination(page, perPage, total)

      const formattedRooms = rooms.map((room) => {
        const { building, floor, status, created_at, updated_at, ...roomData } =
          withDeactivationFlag(room)
        return {
          ...roomData,
          building_name: building?.name,
          floor_name: floor?.name,
          status,
          created_at,
          updated_at
        }
      })

      return success(res, 'success', formattedRooms, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params
      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          building: true,
          floor: true,
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })

      if (!room) return error(res, 'Room not found', 404)

      const { building, floor, status, created_at, updated_at, ...roomData } =
        withDeactivationFlag(room)
      const formattedRoom = {
        ...roomData,
        building_name: building?.name,
        floor_name: floor?.name,
        status,
        created_at,
        updated_at
      }

      return success(res, 'success', formattedRoom)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  update: async (req, res) => {
    try {
      const { id } = req.params
      const { name, building_id, floor_id, status } = req.body || {}

      const roomExists = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      if (
        status !== undefined &&
        (status === false || status === 'false') &&
        getRoomDependencyCount(roomExists) > 0
      ) {
        return error(
          res,
          'Cannot deactivate room because it is still used by related data',
          400
        )
      }

      if (name && (building_id || roomExists.building_id)) {
        const conflict = await prisma.room.findFirst({
          where: {
            name,
            building_id: building_id || roomExists.building_id,
            NOT: { id }
          }
        })

        if (conflict) {
          return error(res, 'Room name already exists in this building', 400)
        }
      }

      if (building_id) {
        const buildingExists = await prisma.building.findUnique({
          where: { id: building_id },
          select: { id: true }
        })

        if (!buildingExists) {
          return error(res, 'Building not found', 400)
        }
      }

      if (floor_id) {
        const floorExists = await prisma.floor.findUnique({
          where: { id: floor_id },
          select: { id: true }
        })

        if (!floorExists) {
          return error(res, 'Floor not found', 400)
        }
      }

      let updateData = {
        name,
        building_id,
        floor_id,
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

      await prisma.room.update({
        where: { id },
        data: updateData
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  delete: async (req, res) => {
    try {
      const { id } = req.params
      const roomExists = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!roomExists) return error(res, 'Room not found', 404)

      const dependencies = []

      if (roomExists._count.schedules > 0) {
        dependencies.push('schedule')
      }


      if (roomExists._count.sensor_logs > 0) {
        dependencies.push('sensor log')
      }

      if (roomExists._count.devices > 0) {
        dependencies.push('device')
      }

      if (roomExists.device_status) {
        dependencies.push('device status')
      }

      if (dependencies.length > 0) {
        return error(
          res,
          `Cannot delete room because it is still used by: ${dependencies.join(', ')}`,
          400
        )
      }

      await prisma.room.delete({ where: { id } })

      return success(res, 'success', null)
    } catch (err) {
      if (err.code === 'P2003') {
        return error(
          res,
          'Cannot delete room because it is still referenced by related data',
          400
        )
      }

      return error(res, err.message, 500)
    }
  },

  toggleStatus: async (req, res) => {
    try {
      const { id } = req.params
      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
              sensor_logs: true,
              devices: true
            }
          },
          device_status: {
            select: { id: true }
          }
        }
      })
      if (!room) return error(res, 'Room not found', 404)

      const newStatus = !room.status

      if (!newStatus && getRoomDependencyCount(room) > 0) {
        return error(
          res,
          'Cannot deactivate room because it is still used by related data',
          400
        )
      }

      await prisma.room.update({
        where: { id },
        data: { status: newStatus }
      })

      return success(res, 'success', null)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getPublicSchedules: async (req, res) => {
    try {
      const { id: room_id } = req.params
      if (!room_id) {
        return error(res, 'room_id path parameter is required', 400)
      }

      const { currentDay, currentTime } = getJakartaScheduleContext()

      if (!currentDay) {
        return success(res, 'success', [])
      }

      const schedules = await prisma.schedule.findMany({
        where: {
          room_id: room_id,
          day: currentDay,
          status: true
        },
        include: {
          course: {
            select: { name: true, code: true }
          },
          class: {
            select: { id: true, name: true }
          },
          time_slot: {
            select: { start_time: true, end_time: true }
          },
          lecturer: {
            include: {
              user: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: {
          time_slot: {
            start_time: 'asc'
          }
        }
      })

      const formattedSchedules = schedules.map((s) => ({
        id: s.id,
        course_name: s.course.name,
        course_code: s.course.code,
        class_id: s.class?.id || null,
        class_name: s.class?.name || null,
        start_time: s.time_slot.start_time,
        end_time: s.time_slot.end_time,
        is_online:
          currentTime >= s.time_slot.start_time &&
          currentTime <= s.time_slot.end_time,
        lecturer_name: s.lecturer.user?.name || 'N/A'
      }))

      const mergedSchedules = mergeContiguousRoomSchedules(
        formattedSchedules,
        currentTime
      )

      return success(res, 'success', mergedSchedules)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getPublicRoomInfo: async (req, res) => {
    try {
      const { id } = req.params
      const room = await prisma.room.findUnique({
        where: { id },
        include: {
          building: true,
          floor: true
        }
      })

      if (!room) {
        return error(res, 'Room not found', 404)
      }

      const responseData = {
        id: room.id,
        name: room.name,
        building: room.building?.name,
        floor: room.floor?.name
      }

      return success(res, 'success', responseData)
    } catch (err) {
      return error(res, err.message, 500)
    }
  }
}

module.exports = roomController
