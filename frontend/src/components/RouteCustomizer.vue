<script setup>
import { ref, reactive } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'submit'])

const form = reactive({
  duration: '半天',
  group: '一家人',
  difficulty: '轻松',
  interests: ['祈福'],
})

const durations = ['半天', '全天', '多日']
const groups = ['一家人', '独自', '情侣', '朋友', '带娃']
const difficulties = [
  { key: '轻松', desc: '慢逛不赶路' },
  { key: '标准', desc: '经典全覆盖' },
  { key: '深度', desc: '深度文化游' },
]
const interestOptions = ['祈福', '拍照', '美食', '亲子', '文化']

function toggleInterest(t) {
  const i = form.interests.indexOf(t)
  if (i >= 0) form.interests.splice(i, 1)
  else form.interests.push(t)
}

function submit() {
  if (!form.interests.length) { alert('请至少选择一个兴趣偏好'); return }
  emit('submit', { ...form })
}
</script>

<template>
  <div v-if="open" class="customizer-mask" @click.self="emit('close')">
    <div class="customizer glass-deep">
      <div class="c-head">
        <span class="c-title">✨ 生成专属路线</span>
        <button class="c-close" @click="emit('close')">✕</button>
      </div>
      <p class="c-sub">告诉小景你的喜好，AI 为你定制一条专属游览路线</p>

      <div class="c-group">
        <label class="c-label">游玩时间</label>
        <div class="c-options">
          <button v-for="d in durations" :key="d" class="c-opt" :class="{ on: form.duration === d }" @click="form.duration = d">{{ d }}</button>
        </div>
      </div>

      <div class="c-group">
        <label class="c-label">同行人群</label>
        <div class="c-options">
          <button v-for="g in groups" :key="g" class="c-opt" :class="{ on: form.group === g }" @click="form.group = g">{{ g }}</button>
        </div>
      </div>

      <div class="c-group">
        <label class="c-label">体力难度</label>
        <div class="c-options">
          <button v-for="d in difficulties" :key="d.key" class="c-opt" :class="{ on: form.difficulty === d.key }" @click="form.difficulty = d.key">
            {{ d.key }}<small> · {{ d.desc }}</small>
          </button>
        </div>
      </div>

      <div class="c-group">
        <label class="c-label">兴趣偏好（可多选）</label>
        <div class="c-options">
          <button
            v-for="t in interestOptions"
            :key="t"
            class="c-opt"
            :class="{ on: form.interests.includes(t) }"
            @click="toggleInterest(t)"
          >{{ t }}</button>
        </div>
      </div>

      <button class="c-submit" :disabled="loading" @click="submit">
        {{ loading ? '小景正在规划中…' : '🚀 为我生成专属路线' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.customizer-mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(15, 40, 65, .45);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}
.customizer {
  width: min(460px, 92vw);
  padding: 22px 24px;
  background: rgba(255,255,255,.96);
}
.c-head { display: flex; align-items: center; justify-content: space-between; }
.c-title { font-size: 18px; font-weight: 800; color: #16324A; }
.c-close { border: none; background: none; font-size: 16px; color: #6B7A8D; cursor: pointer; }
.c-sub { font-size: 12px; color: #6B7A8D; margin: 6px 0 16px; }
.c-group { margin-bottom: 16px; }
.c-label { font-size: 13px; font-weight: 700; color: #2A4560; display: block; margin-bottom: 8px; }
.c-options { display: flex; flex-wrap: wrap; gap: 8px; }
.c-opt {
  border: 1.5px solid #C9D9E6; background: #fff; color: #2A4560;
  font-size: 13px; border-radius: 999px; padding: 7px 14px; cursor: pointer;
  transition: all .15s;
}
.c-opt small { color: #9AA7B4; }
.c-opt.on {
  background: linear-gradient(135deg, #2385BB, #4FB0E6);
  border-color: transparent; color: #fff; font-weight: 700;
}
.c-opt.on small { color: #E4F2FB; }
.c-submit {
  width: 100%; border: none; cursor: pointer;
  background: linear-gradient(135deg, #FFB347, #FF7BAC);
  color: #fff; font-size: 15px; font-weight: 800;
  border-radius: 12px; padding: 13px 0; margin-top: 6px;
  box-shadow: 0 6px 18px rgba(255,123,172,.4);
}
.c-submit:disabled { opacity: .6; cursor: wait; }
</style>
