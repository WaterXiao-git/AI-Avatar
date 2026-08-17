// 从录屏帧编码为 mp4（基于时间戳的变帧率视频）
// 用法: node encode_video.cjs <outdir> <outmp4> [minDur] [maxDur]
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const OUT = path.resolve(process.argv[2])
const MP4 = process.argv[3]
const MIN_DUR = parseFloat(process.argv[4] || '0.005')
const MAX_DUR = parseFloat(process.argv[5] || '2.5')

const lines = fs.readFileSync(OUT + '/frames.tsv', 'utf-8').trim().split('\n').slice(1)
const rows = lines.map(l => l.split('\t')).filter(r => r.length >= 2 && fs.existsSync(OUT + '/' + r[0]))
if (rows.length < 2) { console.error('frames too few:', rows.length); process.exit(1) }

// 计算每帧展示时长
// 注意：CDP screencastFrame 的 metadata.timestamp 单位是"秒"（如 1786977205.91）
// 若某次录的是毫秒级时间戳（>1e12），自动除以 1000。
const firstTs = parseFloat(rows[0][1])
const isMs = firstTs > 1e12
const dur = []
for (let i = 0; i < rows.length; i++) {
  const ts = parseFloat(rows[i][1])
  const nextTs = i + 1 < rows.length ? parseFloat(rows[i + 1][1]) : ts + 1
  let d = isMs ? (nextTs - ts) / 1000 : (nextTs - ts)
  if (!isFinite(d) || d <= 0) d = 0.033
  d = Math.max(MIN_DUR, Math.min(MAX_DUR, d))
  dur.push(d)
}
// 最后一帧补 1.2s 定格
dur[rows.length - 1] = 1.2

const listFile = OUT + '/concat.txt'
const abs = OUT.replace(/\\/g, '/')
let list = ''
for (let i = 0; i < rows.length; i++) {
  list += `file '${abs}/${rows[i][0]}'\nduration ${dur[i].toFixed(4)}\n`
}
fs.writeFileSync(listFile, list)
console.log('frames:', rows.length, 'totalDur:', (dur.reduce((a, b) => a + b, 0)).toFixed(1) + 's')

const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart "${MP4}"`
console.log('cmd:', cmd.slice(0, 120) + '...')
const r = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
console.log(r.split('\n').filter(l => /Output|Video|Duration|frame=/.test(l)).slice(-4).join('\n'))
console.log('DONE ->', MP4)
