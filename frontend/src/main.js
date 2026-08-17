import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles/main.css'

// TASK-11：Admin 后台与前台共用同一入口，按路径 /admin 分发（不引入 Vue Router）
// Admin 懒加载：echarts 等依赖不进前台首屏 chunk
async function boot() {
  const isAdmin = location.pathname.startsWith('/admin')
  if (isAdmin) {
    const { default: AdminApp } = await import('./admin/AdminApp.vue')
    createApp(AdminApp).mount('#app')
  } else {
    createApp(App).mount('#app')
  }
}
boot()
