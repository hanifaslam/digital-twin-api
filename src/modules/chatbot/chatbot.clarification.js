const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const buildClarificationState = ({ entityType, matches, prompt }) => ({
  entity_type: entityType,
  prompt,
  options: matches.map((item, index) => ({
    index: index + 1,
    id: item.id,
    name: item.name || null,
    building_id: item.building_id || null,
    building_name: item.building_name || null,
    lecturer_id: item.lecturer_id || null,
    nip: item.nip || null
  }))
})

const buildClarificationReminder = (clarification) =>
  clarification?.options?.length
    ? `${clarification.prompt} Pilihan: ${clarification.options
        .map((item) =>
          [item.index, item.name, item.building_name, item.nip]
            .filter(Boolean)
            .join('. ')
        )
        .join(' | ')}`
    : clarification?.prompt || 'Mohon pilih salah satu opsi yang dimaksud.'

const resolveClarificationChoice = ({ clarification, message }) => {
  if (!clarification?.options?.length) {
    return { matchedOption: null, clarifiedMessage: message }
  }

  const normalizedMessage = normalizeText(message)
  const choiceMatch = normalizedMessage.match(/\b([1-9]|10)\b/)

  if (choiceMatch) {
    const selected = clarification.options.find(
      (item) => item.index === Number(choiceMatch[1])
    )

    if (selected) {
      return {
        matchedOption: selected,
        clarifiedMessage: `Klarifikasi untuk permintaan sebelumnya: pilih ${clarification.entity_type} "${selected.name || selected.id}". Pertanyaan terbaru user: ${message}`
      }
    }
  }

  const scoredMatches = clarification.options
    .map((item) => {
      const fields = [item.id, item.name, item.building_name, item.nip]
        .filter(Boolean)
        .map(normalizeText)
      const tokens = fields.flatMap((field) =>
        field
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3)
      )
      const score =
        fields.reduce(
          (sum, field) => sum + (normalizedMessage.includes(field) ? 3 : 0),
          0
        ) +
        tokens.reduce(
          (sum, token) => sum + (normalizedMessage.includes(token) ? 1 : 0),
          0
        )

      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (
    scoredMatches.length === 1 ||
    (scoredMatches.length > 1 &&
      scoredMatches[0].score > scoredMatches[1].score)
  ) {
    const selected = scoredMatches[0].item

    return {
      matchedOption: selected,
      clarifiedMessage: `Klarifikasi untuk permintaan sebelumnya: pilih ${clarification.entity_type} "${selected.name || selected.id}". Pertanyaan terbaru user: ${message}`
    }
  }

  return {
    matchedOption: null,
    clarifiedMessage: message
  }
}

module.exports = {
  buildClarificationReminder,
  buildClarificationState,
  resolveClarificationChoice
}
