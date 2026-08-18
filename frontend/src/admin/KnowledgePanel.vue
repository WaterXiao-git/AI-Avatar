<script setup>
// Admin 知识库：文档列表 / 上传 / 删除 / 重建索引（全部走真实接口，R2-01 删除/重建携带 Admin Token）
import { ref, onMounted } from 'vue'
import { getJSON, uploadDocument, sendJSON } from '../api/admin'

const docs = ref([])
const loading = ref(true)
const err = ref('')
const uploading = ref(false)
const reindexing = ref(false)
const msg = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    docs.value = await getJSON('/knowledge/documents')
  } catch (e) {
    err.value = '加载失败：' + e.message
  } finally {
    loading.value = false
  }
}

const fileInput = ref(null)
async function onPickFile() {
  const file = fileInput.value && fileInput.value.files && fileInput.value.files[0]
  fileInput.value.value = ''
  if (!file) return
  uploading.value = true
  msg.value = ''
  try {
    await uploadDocument(file)
    msg.value = `已上传：${file.name}`
    await load()
  } catch (e) {
    err.value = '上传失败：' + e.message
  } finally {
    uploading.value = false
  }
}

// R2-01：携带 Authorization: Bearer <token>，401/403 必须显示明确错误，不得伪装成功
function apiErr(action, e) {
  const m = String(e && e.message || '')
  if (/401/.test(m)) return `${action}：Token 无效或未登录，请重新登录后台`
  if (/403/.test(m)) return `${action}：没有权限（403）`
  return `${action}：${m}`
}

async function removeDoc(id) {
  if (!confirm('确定删除该文档？')) return
  try {
    await sendJSON('/knowledge/documents/' + id, 'DELETE')
    msg.value = '已删除'
    err.value = ''
    await load()
  } catch (e) {
    err.value = apiErr('删除失败', e)
  }
}

async function reindex() {
  reindexing.value = true
  err.value = ''
  msg.value = ''
  try {
    const r = await sendJSON('/knowledge/reindex', 'POST')
    msg.value = r.message || '重建完成'
    await load()
  } catch (e) {
    err.value = apiErr('重建失败', e)
  } finally {
    reindexing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="kp">
    <h3 class="kp-title">📚 知识库</h3>

    <div class="kp-actions">
      <button class="kp-btn primary" :disabled="uploading" @click="fileInput.click()">
        {{ uploading ? '上传中…' : '⬆ 上传文档' }}
      </button>
      <input ref="fileInput" type="file" accept=".txt,.md,.json,.csv" hidden @change="onPickFile" />
      <button class="kp-btn" :disabled="reindexing" @click="reindex">
        {{ reindexing ? '重建中…' : '🔄 重建索引' }}
      </button>
    </div>
    <p v-if="msg" class="kp-msg ok">{{ msg }}</p>
    <p v-if="err" class="kp-msg err">{{ err }}</p>

    <div v-if="loading" class="kp-loading">加载中…</div>
    <table v-else class="kp-table">
      <thead><tr><th>文件名</th><th>类型</th><th>状态</th><th>分块</th><th>上传时间</th><th></th></tr></thead>
      <tbody>
        <tr v-for="d in docs" :key="d.id">
          <td>{{ d.filename }}</td>
          <td>{{ d.file_type }}</td>
          <td><span class="kp-status" :class="d.status">{{ d.status }}</span></td>
          <td>{{ d.chunk_count }}</td>
          <td>{{ (d.uploaded_at || '').slice(0, 16) }}</td>
          <td><button class="kp-del" @click="removeDoc(d.id)">删除</button></td>
        </tr>
        <tr v-if="!docs.length"><td colspan="6" class="kp-empty">暂无文档，点击「上传文档」添加（.txt/.md/.json/.csv）</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.kp { padding: 4px 8px 12px; }
.kp-title { margin: 0 0 12px; font-size: 16px; color: #16324A; }
.kp-actions { display: flex; gap: 8px; margin-bottom: 10px; }
.kp-btn {
  border: 1px solid #D8E3EC; background: #fff; color: #2385BB;
  font-size: 12px; border-radius: 8px; padding: 7px 14px; cursor: pointer;
}
.kp-btn.primary { background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff; border: none; }
.kp-btn:disabled { opacity: .5; cursor: wait; }
.kp-msg { font-size: 12px; margin: 6px 0; }
.kp-msg.ok { color: #2FA878; }
.kp-msg.err { color: #d9534f; }
.kp-loading { color: #8aa0b5; padding: 30px 0; text-align: center; font-size: 13px; }
.kp-table { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(20,60,95,.08); }
.kp-table th { text-align: left; color: #6B7A8D; font-weight: 700; padding: 8px 10px; border-bottom: 1px solid #EEF2F6; }
.kp-table td { padding: 8px 10px; border-bottom: 1px solid #F5F8FB; color: #3A5268; }
.kp-status { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.kp-status.ready { background: #EAF9F0; color: #2FA878; }
.kp-status.indexing { background: #FFF7E0; color: #B7791F; }
.kp-status.pending { background: #EEF2F6; color: #6B7A8D; }
.kp-status.failed { background: #FFE9EE; color: #E0516B; }
.kp-del { border: none; background: none; color: #d9534f; cursor: pointer; font-size: 12px; }
.kp-empty { color: #a0b0c0; text-align: center; padding: 16px 0; }
</style>
