<script setup>
// Admin 数字人配置：读写 /api/config/avatar（welcome_text / persona / reply_length / idle / default_mode / proactive）
import { ref, onMounted } from 'vue'
import { getJSON, putJSON } from '../api/admin'

const cfg = ref(null)
const loading = ref(true)
const saving = ref(false)
const err = ref('')
const ok = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    cfg.value = await getJSON('/config/avatar')
  } catch (e) {
    err.value = '加载失败：' + e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  err.value = ''
  ok.value = ''
  try {
    cfg.value = await putJSON('/config/avatar', {
      welcome_text: cfg.value.welcome_text,
      persona: cfg.value.persona,
      reply_length: cfg.value.reply_length,
      idle_disconnect_seconds: Number(cfg.value.idle_disconnect_seconds) || 90,
      default_mode: cfg.value.default_mode,
      proactive_enabled: !!cfg.value.proactive_enabled,
    })
    ok.value = '已保存'
    setTimeout(() => { ok.value = '' }, 2000)
  } catch (e) {
    err.value = '保存失败：' + e.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="ac">
    <h3 class="ac-title">🤖 数字人配置</h3>

    <div v-if="loading" class="ac-loading">加载中…</div>
    <p v-else-if="err && !cfg" class="ac-err">{{ err }}</p>

    <template v-if="cfg">
      <div class="ac-field">
        <label>欢迎语</label>
        <textarea v-model="cfg.welcome_text" rows="2" placeholder="你好呀！我是小灵…"></textarea>
      </div>

      <div class="ac-field">
        <label>人设风格</label>
        <select v-model="cfg.persona">
          <option value="professional-friendly">专业友好</option>
          <option value="warm-welcoming">热情亲切</option>
          <option value="brief-precise">简洁干练</option>
        </select>
      </div>

      <div class="ac-field">
        <label>回答长度</label>
        <select v-model="cfg.reply_length">
          <option value="short">简短</option>
          <option value="normal">适中</option>
          <option value="detailed">详细</option>
        </select>
      </div>

      <div class="ac-field">
        <label>空闲断开（秒）</label>
        <input v-model.number="cfg.idle_disconnect_seconds" type="number" min="0" max="3600" />
      </div>

      <div class="ac-field">
        <label>默认模式</label>
        <select v-model="cfg.default_mode">
          <option value="qa">问答模式</option>
          <option value="tour">讲解模式</option>
        </select>
      </div>

      <div class="ac-field check">
        <label>
          <input v-model="cfg.proactive_enabled" type="checkbox" />
          启用主动提醒（伴游）
        </label>
      </div>

      <div class="ac-actions">
        <p v-if="ok" class="ac-ok">{{ ok }}</p>
        <button class="ac-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '💾 保存' }}</button>
      </div>
      <p v-if="err" class="ac-err">{{ err }}</p>
    </template>
  </div>
</template>

<style scoped>
.ac { padding: 4px 8px 12px; max-width: 460px; }
.ac-title { margin: 0 0 12px; font-size: 16px; color: #16324A; }
.ac-loading { color: #8aa0b5; padding: 30px 0; text-align: center; font-size: 13px; }
.ac-field { margin-bottom: 12px; }
.ac-field label { display: block; font-size: 12px; font-weight: 700; color: #3A5268; margin-bottom: 5px; }
.ac-field textarea, .ac-field select, .ac-field input[type=number] {
  width: 100%; box-sizing: border-box; border: 1px solid #D8E3EC; border-radius: 8px;
  padding: 8px 10px; font-size: 12px; outline: none; background: #fff; color: #16324A;
}
.ac-field textarea:focus, .ac-field select:focus, .ac-field input:focus { border-color: #2385BB; }
.ac-field.check label { display: flex; align-items: center; gap: 8px; font-weight: 400; }
.ac-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.ac-btn {
  border: none; background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff;
  font-size: 13px; font-weight: 700; border-radius: 8px; padding: 8px 20px; cursor: pointer;
}
.ac-btn:disabled { opacity: .5; cursor: wait; }
.ac-ok { color: #2FA878; font-size: 12px; font-weight: 700; margin: 0; }
.ac-err { color: #d9534f; font-size: 12px; }
</style>
