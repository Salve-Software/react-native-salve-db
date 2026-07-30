const rules = [
  { type: 'feat', release: 'minor', title: '✨ Features' },
  { type: 'fix', release: 'patch', title: '🐛 Bug Fixes' },
  { type: 'perf', release: 'patch', title: '💨 Performance Improvements' },
  { type: 'refactor', release: 'patch', title: '🔄 Code Refactors' },
  { type: 'docs', release: 'patch', title: '📚 Documentation' },
  { type: 'chore', release: 'patch', title: '🛠️ Other changes' },
]

const sortMap = Object.fromEntries(
  rules.map((rule, index) => [rule.title, index])
)

module.exports = { rules, sortMap }
