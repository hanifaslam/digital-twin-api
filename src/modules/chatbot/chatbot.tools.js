const { buildToolResult } = require('./chatbot.data')

const buildTools = ({
  DynamicStructuredTool,
  z,
  defaultBuildingId,
  defaultRoomId,
  defaultLecturerId,
  helpers
}) => {
  const {
    getBuildingSnapshot,
    getEnergyAnomaliesSnapshot,
    getLecturerStatusSnapshot,
    getRoomLecturerStatuses,
    getRoomSchedulesForDay,
    getRoomSnapshot,
    getAvailableRoomsSnapshot,
    resolveBuildingOrExplain,
    resolveLecturerOrExplain,
    resolveRoomOrExplain
  } = helpers

  const executors = {
    get_dashboard_context: async ({
      building_id,
      building_name,
      room_id,
      room_name
    }) => {
      const resolvedBuilding =
        building_id || building_name || defaultBuildingId
          ? await resolveBuildingOrExplain({
              buildingId: building_id || defaultBuildingId || undefined,
              buildingName: building_name
            })
          : null

      if (resolvedBuilding?.ok === false) return resolvedBuilding

      const resolvedRoom =
        room_id || room_name || defaultRoomId
          ? await resolveRoomOrExplain({
              roomId: room_id || defaultRoomId || undefined,
              roomName: room_name,
              buildingId: resolvedBuilding?.id || building_id || defaultBuildingId
            })
          : null

      if (resolvedRoom?.ok === false) return resolvedRoom

      const effectiveBuildingId =
        resolvedBuilding?.id || resolvedRoom?.building_id || defaultBuildingId || null
      const roomSnapshot = resolvedRoom
        ? await getRoomSnapshot(resolvedRoom.id)
        : null
      const buildingSnapshot = effectiveBuildingId
        ? await getBuildingSnapshot(effectiveBuildingId)
        : null

      if (!roomSnapshot && resolvedRoom) {
        return buildToolResult({
          ok: false,
          message: 'Ruangan tidak ditemukan.',
          data: null
        })
      }

      if (!buildingSnapshot && effectiveBuildingId) {
        return buildToolResult({
          ok: false,
          message: 'Gedung tidak ditemukan.',
          data: null
        })
      }

      return buildToolResult({
        data: {
          room: roomSnapshot,
          building: buildingSnapshot
        },
        contextScope: {
          building_id: buildingSnapshot?.building_id || roomSnapshot?.building_id || null,
          room_id: roomSnapshot?.room_id || null
        }
      })
    },

    get_room_schedule: async ({ room_id, room_name, date }) => {
      const resolvedRoom = await resolveRoomOrExplain({
        roomId: room_id || defaultRoomId || undefined,
        roomName: room_name,
        buildingId: defaultBuildingId || undefined
      })

      if (resolvedRoom?.ok === false) return resolvedRoom

      const scheduleSnapshot = await getRoomSchedulesForDay(resolvedRoom.id, date)

      if (scheduleSnapshot?.unsupported) {
        return buildToolResult({
          ok: false,
          message:
            'Saat ini tool jadwal ruangan mendukung hari ini, besok, atau nama hari kerja seperti Senin sampai Jumat.',
          data: null
        })
      }

      return buildToolResult({
        data: {
          room_id: resolvedRoom.id,
          room_name: resolvedRoom.name,
          building_id: resolvedRoom.building_id,
          building_name: resolvedRoom.building?.name || null,
          target_day: scheduleSnapshot.target_day,
          target_day_label: scheduleSnapshot.target_label,
          requested_label: scheduleSnapshot.requested_label,
          is_today: scheduleSnapshot.is_today,
          current_time: scheduleSnapshot.current_time,
          schedules: scheduleSnapshot.schedules,
          is_used: scheduleSnapshot.schedules.length > 0
        },
        contextScope: {
          building_id: resolvedRoom.building_id,
          room_id: resolvedRoom.id
        }
      })
    },

    get_lecturer_status: async ({ lecturer_id, lecturer_name }) => {
      const resolvedLecturer = await resolveLecturerOrExplain({
        lecturerId: lecturer_id || defaultLecturerId || undefined,
        lecturerName: lecturer_name
      })

      if (resolvedLecturer?.ok === false) return resolvedLecturer

      const lecturerStatus = await getLecturerStatusSnapshot(resolvedLecturer.id)

      return buildToolResult({
        data: lecturerStatus,
        contextScope: {
          building_id: lecturerStatus?.active_schedule?.building_id || null,
          room_id: lecturerStatus?.active_schedule?.room_id || null,
          lecturer_id: lecturerStatus?.lecturer_id || resolvedLecturer.id
        }
      })
    },

    get_room_lecturers_status: async ({ room_id, room_name }) => {
      const resolvedRoom = await resolveRoomOrExplain({
        roomId: room_id || defaultRoomId || undefined,
        roomName: room_name,
        buildingId: defaultBuildingId || undefined
      })

      if (resolvedRoom?.ok === false) return resolvedRoom

      const lecturers = await getRoomLecturerStatuses(resolvedRoom.id)

      return buildToolResult({
        data: {
          room_id: resolvedRoom.id,
          room_name: resolvedRoom.name,
          building_id: resolvedRoom.building_id,
          building_name: resolvedRoom.building?.name || null,
          lecturers
        },
        contextScope: {
          building_id: resolvedRoom.building_id,
          room_id: resolvedRoom.id
        }
      })
    },

    find_available_rooms: async ({ building_id, building_name }) => {
      const resolvedBuilding =
        building_id || building_name || defaultBuildingId
          ? await resolveBuildingOrExplain({
              buildingId: building_id || defaultBuildingId || undefined,
              buildingName: building_name
            })
          : null

      if (resolvedBuilding?.ok === false) return resolvedBuilding

      const effectiveBuildingId = resolvedBuilding?.id || defaultBuildingId || null
      const availableRooms = await getAvailableRoomsSnapshot(effectiveBuildingId)

      return buildToolResult({
        data: availableRooms,
        contextScope: {
          building_id: effectiveBuildingId
        }
      })
    },

    get_energy_anomalies: async ({ building_id, building_name }) => {
      const resolvedBuilding =
        building_id || building_name || defaultBuildingId
          ? await resolveBuildingOrExplain({
              buildingId: building_id || defaultBuildingId || undefined,
              buildingName: building_name
            })
          : null

      if (resolvedBuilding?.ok === false) return resolvedBuilding

      const effectiveBuildingId = resolvedBuilding?.id || defaultBuildingId || null
      const anomalies = await getEnergyAnomaliesSnapshot(effectiveBuildingId)

      return buildToolResult({
        data: anomalies,
        contextScope: {
          building_id: effectiveBuildingId
        }
      })
    }
  }

  const tools = [
    new DynamicStructuredTool({
      name: 'get_dashboard_context',
      description:
        'Ambil konteks live gedung atau ruangan untuk energi, sensor, device health, top room power, dan status terbaru dashboard.',
      schema: z
        .object({
          building_id: z.string().optional(),
          building_name: z.string().optional(),
          room_id: z.string().optional(),
          room_name: z.string().optional()
        })
        .strict(),
      func: async (input) => JSON.stringify(await executors.get_dashboard_context(input))
    }),
    new DynamicStructuredTool({
      name: 'get_room_schedule',
      description:
        'Ambil jadwal ruangan untuk hari ini, besok, atau nama hari kerja tertentu, termasuk mata kuliah, dosen, dan apakah kelas sedang berlangsung jika targetnya hari ini.',
      schema: z
        .object({
          room_id: z.string().optional(),
          room_name: z.string().optional(),
          date: z.string().optional()
        })
        .strict(),
      func: async (input) => JSON.stringify(await executors.get_room_schedule(input))
    }),
    new DynamicStructuredTool({
      name: 'get_lecturer_status',
      description:
        'Ambil status dosen tertentu, termasuk AVAILABLE/BUSY/OFFLINE, override manual, dan jadwal aktif jika ada.',
      schema: z
        .object({
          lecturer_id: z.string().optional(),
          lecturer_name: z.string().optional()
        })
        .strict(),
      func: async (input) => JSON.stringify(await executors.get_lecturer_status(input))
    }),
    new DynamicStructuredTool({
      name: 'get_room_lecturers_status',
      description:
        'Ambil daftar dosen yang terkait dengan ruangan tertentu dan status availability mereka saat ini.',
      schema: z
        .object({
          room_id: z.string().optional(),
          room_name: z.string().optional()
        })
        .strict(),
      func: async (input) =>
        JSON.stringify(await executors.get_room_lecturers_status(input))
    }),
    new DynamicStructuredTool({
      name: 'find_available_rooms',
      description:
        'Cari ruangan yang saat ini sedang kosong (tidak ada jadwal aktif). Berguna untuk merekomendasikan ruangan kosong kepada user.',
      schema: z
        .object({
          building_id: z.string().optional(),
          building_name: z.string().optional()
        })
        .strict(),
      func: async (input) => JSON.stringify(await executors.find_available_rooms(input))
    }),
    new DynamicStructuredTool({
      name: 'get_energy_anomalies',
      description:
        'Cari ruangan yang pemakaian dayanya tinggi (>100W) namun tidak ada jadwal kelas aktif. Berguna untuk mendeteksi pemborosan energi dan memberikan rekomendasi mematikan perangkat.',
      schema: z
        .object({
          building_id: z.string().optional(),
          building_name: z.string().optional()
        })
        .strict(),
      func: async (input) => JSON.stringify(await executors.get_energy_anomalies(input))
    })
  ]

  return { executors, tools }
}

module.exports = {
  buildTools
}
