const chatbotSuggestions = [
  {
    id: 'energy-current-building',
    label: 'Energi Gedung',
    message: 'Gedung A konsumsi energinya sekarang berapa?',
    category: 'energy'
  },
  {
    id: 'energy-top-power-room',
    label: 'Ruangan Paling Boros',
    message: 'Power terbesar saat ini ada di ruangan mana?',
    category: 'energy'
  },
  {
    id: 'device-offline-count',
    label: 'Device Offline',
    message: 'Device offline di gedung ini ada berapa?',
    category: 'energy'
  },
  {
    id: 'room-schedule-today',
    label: 'Jadwal Hari Ini',
    message: 'Hari ini ruang 103 dipakai nggak?',
    category: 'room_schedule'
  },
  {
    id: 'room-schedule-tomorrow',
    label: 'Jadwal Besok',
    message: 'Besok di ruang 103 ada kelas apa?',
    category: 'room_schedule'
  },
  {
    id: 'room-schedule-weekday',
    label: 'Jadwal Hari Tertentu',
    message: 'Selasa ruang Lab AI dipakai atau kosong?',
    category: 'room_schedule'
  },
  {
    id: 'lecturer-status-yuli',
    label: 'Status Dosen',
    message: 'Bu Yuli available ga ya?',
    category: 'lecturer_status'
  },
  {
    id: 'lecturer-status-budi',
    label: 'Status Pak Budi',
    message: 'Pak Budi statusnya sekarang apa?',
    category: 'lecturer_status'
  },
  {
    id: 'room-lecturers-status',
    label: 'Dosen Di Ruangan',
    message: 'Dosen di ruang ini siapa aja dan statusnya gimana?',
    category: 'lecturer_status'
  },
  {
    id: 'room-environment-current',
    label: 'Suhu Ruangan',
    message: 'Suhu dan kelembapan ruangan ini berapa?',
    category: 'environment'
  },
  {
    id: 'building-sensor-status',
    label: 'Status Sensor',
    message: 'Kondisi sensor di gedung ini gimana sekarang?',
    category: 'environment'
  },
  {
    id: 'room-highest-temperature',
    label: 'Suhu Tertinggi',
    message: 'Ruangan mana yang suhu terbarunya paling tinggi?',
    category: 'environment'
  }
]

module.exports = {
  chatbotSuggestions
}
