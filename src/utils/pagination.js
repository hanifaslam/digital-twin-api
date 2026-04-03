const buildPagination = (page, perPage, total) => ({
  per_page: perPage,
  current_page: page,
  total_row: total,
  total_page: Math.ceil(total / perPage)
})

module.exports = { buildPagination }
