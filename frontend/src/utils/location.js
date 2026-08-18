// 位置有效性判断（R3-02）：只有「定位确实在运行」且「坐标完整有效」才算实时位置。
// 独立纯函数便于单测——即使旧坐标意外残留，只要定位已关闭就不会冒充当前位置。
export function isLiveLocation(locationActive, loc) {
  return !!locationActive && !!loc && loc.lat != null && loc.lng != null
}
