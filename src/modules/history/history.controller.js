const prisma = require('../../config/prisma')
const { success, error } = require('../../config/response')
const { buildPagination } = require('../../utils/pagination')
const ExcelJS = require('exceljs')

const formatStudyProgramsForList = (studyPrograms = []) =>
  studyPrograms.map((item) => item.study_program.name)

const historyController = {
  getLecturerHistory: async (req, res) => {
    try {
      const { q, start_date, end_date, study_program } = req.query || {}
      const search = q?.trim()
      const page = parseInt(req.query.page) || 1
      const perPage = parseInt(req.query.per_page) || 10
      const skip = (page - 1) * perPage

      const studyProgramIds = study_program
        ?.split(',')
        .map((id) => id.trim())
        .filter(Boolean)

      let where = {}

      if (search) {
        where.OR = [
          {
            lecturer: {
              user: { name: { contains: search, mode: 'insensitive' } }
            }
          },
          { lecturer: { nip: { contains: search, mode: 'insensitive' } } }
        ]
      }

      if (start_date || end_date) {
        where.check_in_at = {}
        if (start_date) {
          const start = new Date(start_date)
          if (!isNaN(start.getTime())) {
            where.check_in_at.gte = start
          }
        }
        if (end_date) {
          const end = new Date(end_date)
          if (!isNaN(end.getTime())) {
            if (String(end_date).length === 10) {
              end.setUTCHours(23, 59, 59, 999)
            }
            where.check_in_at.lte = end
          }
        }
        if (Object.keys(where.check_in_at).length === 0) {
          delete where.check_in_at
        }
      }

      if (studyProgramIds?.length) {
        where.lecturer = {
          ...where.lecturer,
          study_programs: {
            some: {
              study_program_id: {
                in: studyProgramIds
              }
            }
          }
        }
      }

      const [attendances, total] = await Promise.all([
        prisma.attendance.findMany({
          where,
          skip,
          take: perPage,
          include: {
            lecturer: {
              include: {
                user: {
                  select: { name: true }
                },
                study_programs: {
                  include: {
                    study_program: {
                      select: { name: true }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            check_in_at: 'desc'
          }
        }),
        prisma.attendance.count({ where })
      ])

      const formattedData = attendances.map((attendance) => ({
        id: attendance.id,
        lecturer_id: attendance.lecturer_id,
        name: attendance.lecturer?.user?.name || null,
        study_program: formatStudyProgramsForList(
          attendance.lecturer?.study_programs
        ),
        date: attendance.check_in_at
      }))

      const metadata = buildPagination(page, perPage, total)

      return success(res, 'success', formattedData, 200, metadata)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  getActivityLog: async (req, res) => {
    try {
      const { id } = req.params
      const { date } = req.query

      let targetDate = date ? new Date(date) : new Date()
      if (isNaN(targetDate.getTime())) {
        targetDate = new Date()
      }

      targetDate.setHours(0, 0, 0, 0)
      const nextDate = new Date(targetDate)
      nextDate.setDate(nextDate.getDate() + 1)

      const lecturer = await prisma.lecturer.findUnique({
        where: { id },
        include: {
          schedules: {
            include: {
              time_slot: true
            }
          },
          attendances: {
            where: {
              check_in_at: {
                gte: targetDate,
                lt: nextDate
              }
            },
            orderBy: {
              check_in_at: 'asc'
            }
          }
        }
      })

      if (!lecturer) {
        return error(res, 'Lecturer not found', 404)
      }

      if (lecturer.attendances.length === 0) {
        return success(res, 'success', [])
      }

      const logs = []

      lecturer.attendances.forEach((att) => {
        const time = new Date(att.check_in_at)
          .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          .replace(':', '.')

        const isFace = att.type === 'FACE'
        const badgeText = isFace
          ? 'Via Face Recognition'
          : 'via manual attendance'
        const badgeColor = isFace ? 'success' : 'warning'
        const description = isFace
          ? 'Face recognition was successful'
          : 'Face recognition was unsuccessful'

        logs.push({
          time,
          title: 'Clock In',
          text: badgeText,
          description: description,
          timestamp: new Date(att.check_in_at).getTime()
        })
      })

      const days = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY'
      ]
      const dayOfWeek = days[targetDate.getDay()]

      const todaysSchedules = lecturer.schedules.filter(
        (s) => s.day === dayOfWeek && s.status
      )

      const timeToMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number)
        return h * 60 + m
      }

      let intervals = todaysSchedules
        .map((s) => ({
          start: timeToMinutes(s.time_slot.start_time),
          end: timeToMinutes(s.time_slot.end_time),
          startStr: s.time_slot.start_time,
          endStr: s.time_slot.end_time
        }))
        .sort((a, b) => a.start - b.start)

      let mergedIntervals = []
      if (intervals.length > 0) {
        let current = intervals[0]
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) {
            current.end = Math.max(current.end, intervals[i].end)
            if (current.end === intervals[i].end) {
              current.endStr = intervals[i].endStr
            }
          } else {
            mergedIntervals.push(current)
            current = intervals[i]
          }
        }
        mergedIntervals.push(current)
      }

      const firstClockInTime = new Date(
        lecturer.attendances[0].check_in_at
      ).getTime()

      mergedIntervals.forEach((interval) => {
        const [startHour, startMinute] = interval.startStr.split(':')
        let startDateTime = new Date(targetDate)
        startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0)

        const [endHour, endMinute] = interval.endStr.split(':')
        const endDateTime = new Date(targetDate)
        endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0)

        if (endDateTime.getTime() <= firstClockInTime) {
          // Ignore completely missed classes? Or we can still log them as Not Available
          // return;
        }

        let description =
          'Lecturer is not available as a scheduled class has started'
        if (startDateTime.getTime() < firstClockInTime) {
          description =
            'Lecturer was not present when the scheduled class started'
        }

        const formattedTimeStr = startDateTime
          .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          .replace(':', '.')

        logs.push({
          time: formattedTimeStr,
          title: 'Not Available',
          text: 'Not Available',
          description: description,
          timestamp: startDateTime.getTime()
        })

        logs.push({
          time: interval.endStr.replace(':', '.'),
          title: 'Available',
          text: 'Available',
          description:
            'Schedule class ended. Lecturer is now available in the lecturer room.',
          timestamp: endDateTime.getTime()
        })
      })

      const isTargetDateToday =
        new Date().toDateString() === targetDate.toDateString()
      if (isTargetDateToday && lecturer.is_manual && lecturer.overridden_at) {
        const overrideDate = new Date(lecturer.overridden_at)
        if (overrideDate >= targetDate && overrideDate < nextDate) {
          const time = overrideDate
            .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            .replace(':', '.')

          let titleText = 'Not Available'
          let badgeText = 'Not Available'
          let desc = 'Lecturer manually left the lecturer room.'
          let color = 'danger'

          if (lecturer.status === 'AVAILABLE') {
            titleText = 'Available'
            badgeText = 'Available'
            desc = 'Lecturer manually became available.'
            color = 'success'
          }

          logs.push({
            time,
            title: titleText,
            text: badgeText,
            description: desc,
            timestamp: overrideDate.getTime()
          })
        }
      }

      const now = Date.now()
      logs.sort((a, b) => a.timestamp - b.timestamp)
      const filteredLogs = logs.filter((log) => log.timestamp <= now)
      const formattedLogs = filteredLogs.map(({ timestamp, ...rest }) => rest)

      return success(res, 'success', formattedLogs)
    } catch (err) {
      return error(res, err.message, 500)
    }
  },

  exportLecturerHistory: async (req, res) => {
    try {
      const { q, study_program, date, start_date, end_date } = req.query || {}
      const search = q?.trim()
      const studyProgramIds = study_program
        ?.split(',')
        .map((id) => id.trim())
        .filter(Boolean)

      let where = {}

      if (start_date || end_date) {
        where.check_in_at = {}
        if (start_date) {
          const start = new Date(start_date)
          if (!isNaN(start.getTime())) {
            where.check_in_at.gte = start
          }
        }
        if (end_date) {
          const end = new Date(end_date)
          if (!isNaN(end.getTime())) {
            if (String(end_date).length === 10) {
              end.setUTCHours(23, 59, 59, 999)
            }
            where.check_in_at.lte = end
          }
        }
        if (Object.keys(where.check_in_at).length === 0) {
          delete where.check_in_at
        }
      }

      let lecturerWhere = {}
      if (search) {
        lecturerWhere.OR = [
          { nip: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } }
        ]
      }
      if (studyProgramIds?.length) {
        lecturerWhere.study_programs = {
          some: { study_program_id: { in: studyProgramIds } }
        }
      }

      if (Object.keys(lecturerWhere).length > 0) {
        where.lecturer = lecturerWhere
      }

      const attendances = await prisma.attendance.findMany({
        where,
        include: {
          lecturer: {
            include: {
              user: { select: { name: true } },
              study_programs: {
                include: { study_program: { select: { name: true } } }
              }
            }
          }
        },
        orderBy: { check_in_at: 'desc' }
      })

      const formattedData = attendances.map((attendance, index) => {
        const checkInDate = new Date(attendance.check_in_at)
        const day = String(checkInDate.getDate()).padStart(2, '0')
        const month = String(checkInDate.getMonth() + 1).padStart(2, '0')
        const year = checkInDate.getFullYear()

        const time = checkInDate
          .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          .replace(':', '.')

        return {
          No: index + 1,
          Name: attendance.lecturer?.user?.name || '-',
          NIP: attendance.lecturer?.nip || '-',
          'Study Program':
            attendance.lecturer?.study_programs
              .map((sp) => sp.study_program.name)
              .join(', ') || '-',
          Date: `${day}-${month}-${year}`,
          'Check-in Time': time,
          Type:
            attendance.type === 'FACE'
              ? 'Face Recognition'
              : 'Manual Attendance'
        }
      })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Lecturer History')

      // Add Title
      worksheet.mergeCells('A1:G1')
      const titleCell = worksheet.getCell('A1')
      titleCell.value = 'LECTURER ATTENDANCE HISTORY'
      titleCell.font = { name: 'Arial', size: 14, bold: true }
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' }

      // Add an empty row for spacing
      worksheet.addRow([])

      // Define Headers
      const headerRow = worksheet.addRow([
        'No',
        'Name',
        'NIP',
        'Study Program',
        'Date',
        'Check-in Time',
        'Type'
      ])

      // Style Headers
      headerRow.font = { bold: true }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD3D3D3' } // Light grey
        }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })

      // Add Data
      formattedData.forEach((row) => {
        const dataRow = worksheet.addRow([
          row['No'],
          row['Name'],
          row['NIP'],
          row['Study Program'],
          row['Date'],
          row['Check-in Time'],
          row['Type']
        ])

        // Style Data Cells
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
          // Align No, Date, Time, Type to center
          if ([1, 5, 6, 7].includes(cell.col)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
          }
          
          // Format NIP column explicitly as Text to prevent Excel warnings
          if (cell.col === 3) {
            cell.numFmt = '@'
          }
        })
      })

      // Set column widths
      worksheet.getColumn(1).width = 5
      worksheet.getColumn(2).width = 30
      worksheet.getColumn(3).width = 20
      worksheet.getColumn(4).width = 40
      worksheet.getColumn(5).width = 15
      worksheet.getColumn(6).width = 15
      worksheet.getColumn(7).width = 20

      const buffer = await workbook.xlsx.writeBuffer()

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="lecturer_history.xlsx"'
      )
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )

      return res.send(buffer)
    } catch (err) {
      console.error('Export Excel Error:', err)
      return error(res, err.message, 500)
    }
  }
}

module.exports = historyController
