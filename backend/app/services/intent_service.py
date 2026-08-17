"""轻量 Intent 分类（P0-13）：纯规则关键词，不调 LLM，毫秒级。

用于给 interaction 打 intent 标签（分析用），也帮助 fact_service 决定注入哪些结构化事实。
意图定义（与前端/后端约定保持一致）：
  ticket      门票/价格/免票/半价/联票
  transport   交通/观光车/停车/如何到达
  open_time   开放时间/几点开门/营业时间
  show        演出/场次/吉祥颂/九龙灌浴
  weather     天气/温度/下雨/热/冷
  facility    卫生间/餐厅/餐饮/出口/游客中心/急救/母婴/停车（设施位置）
  route       路线/怎么玩/行程/推荐
  attraction  景点详情/介绍/攻略（未命中更具体的）
  nearby      附近/离我最近/多少米
  plan        规划/定制路线/专属
  feedback    反馈/意见/建议/投诉
  greeting    你好/嗨/在吗
  other       兜底

同一条问题可能命中多个意图，按优先级返回最具体的一个。
"""
import re

# (intent, [关键词])
_RULES = [
    ("ticket", ["门票", "票价", "多少钱", "价格", "收费", "免票", "半价", "联票", "学生票", "儿童票", "老人票", "优惠"]),
    ("transport", ["怎么去", "怎么到", "交通", "地铁", "公交", "高铁", "大巴", "班车", "停车费", "停车", "观光车", "景区车", "接驳", "导航"]),
    ("weather", ["天气", "温度", "气温", "下雨", "雨", "雪", "热不热", "冷不冷", "带伞", "湿度", "风力", "台风"]),
    ("show", ["演出", "场次", "几点演", "表演", "喷泉", "吉祥颂", "九龙灌浴", "讲解场", "场"]),
    ("facility", ["卫生间", "厕所", "洗手间", "公厕", "wc", "餐厅", "餐饮", "吃饭", "美食", "小吃", "出口", "大门", "游客中心", "服务中心", "服务台", "急救", "母婴", "医务", "哺乳"]),
    ("nearby", ["附近", "离我", "最近", "多少米", "多远", "旁边"]),
    ("open_time", ["开放时间", "几点开", "几点关", "营业时间", "开门", "关门", "开园", "闭园", "什么时候开放"]),
    ("route", ["路线", "怎么玩", "行程", "安排", "攻略", "推荐", "一日游", "半日", "怎么逛", "顺序"]),
    ("plan", ["规划", "定制", "专属", "生成一条", "安排一下"]),
    ("attraction", ["介绍", "详情", "有什么", "值得看", "好玩", "景点", "拍照", "打卡"]),
    ("feedback", ["反馈", "意见", "建议", "投诉", "不好用", "不满意", "改进"]),
    ("greeting", ["你好", "您好", "嗨", "在吗", "hello", "hi", "早上好", "下午好"]),
]


def _norm(text: str) -> str:
    return (text or "").lower()


def classify_intent(question: str, language: str = "zh-CN") -> str:
    """返回最具体的意图标签（未命中返回 'other'）。"""
    q = _norm(question)
    if not q:
        return "other"
    hits = []
    for intent, keys in _RULES:
        if any(k in q for k in keys):
            hits.append(intent)
    if not hits:
        return "other"
    # 优先级排序：nearby 依赖具体对象，排在 facility/show/attraction 之后；
    # plan 优先于 route（更具体）
    priority = {"ticket": 10, "transport": 9, "weather": 9, "show": 8, "facility": 8,
                "open_time": 7, "plan": 7, "route": 6, "nearby": 5, "attraction": 4,
                "feedback": 3, "greeting": 2, "other": 0}
    hits.sort(key=lambda h: priority.get(h, 0), reverse=True)
    return hits[0]


def intent_label(intent: str) -> str:
    labels = {
        "ticket": "门票", "transport": "交通", "weather": "天气", "show": "演出",
        "facility": "设施", "nearby": "附近", "open_time": "开放时间", "route": "路线",
        "plan": "规划", "attraction": "景点", "feedback": "反馈", "greeting": "问候",
        "other": "其他",
    }
    return labels.get(intent, intent)
