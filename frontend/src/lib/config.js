// 部署时前后端同源，使用相对路径；本地开发可设置 VITE_API_BASE=http://localhost:8788
export const API_BASE = import.meta.env.VITE_API_BASE || "";

export function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
