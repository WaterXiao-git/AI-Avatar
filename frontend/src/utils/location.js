// 位置有效性判断（R3-02）：只有「定位确实在运行」且「坐标完整有效」才算实时位置。
// 独立纯函数便于单测——即使旧坐标意外残留，只要定位已关闭就不会冒充当前位置。
export function isLiveLocation(locationActive, loc) {
  return !!locationActive && !!loc && loc.lat != null && loc.lng != null
}

// FIX-FINAL-01：是否允许启用定位（真实 GPS / demo 模拟）。只有「随行讲解」ON 才放行。
// 路线开始/继续不再自动开启定位；定位生命周期完全跟随随行讲解开关，
// 杜绝「UI 显示 OFF 但 GPS 后台在跑」的状态不一致。
export function shouldUseLocation(companionEnabled) {
  return !!companionEnabled
}
