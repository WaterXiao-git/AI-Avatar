// 兜底数据：与 backend/data/*.json 保持一致，后端未启动时前端仍可正常演示
// 数据来源：《灵山胜境 景点结构化数据集》《灵山胜境：历史、文化、景点特色与个性化游览指南》
// 参考图一 1:1：景点卡片带圆形图标（5 张），路线卡片带实景照片（6 张）

export const FALLBACK_ATTRACTIONS = [
  {
    id: 'ling-dashan-fo', name: '灵山大佛',
    desc: '世界最高露天青铜释迦牟尼立像',
    intro: '通高88米、总高101.5米，耗铜725吨。右手施无畏印、左手施与愿印；登216级登云道可抱佛脚，俯瞰太湖全景。',
    tag: '必打卡地标', openTime: '8:00-17:00（冬季至16:30）', showTime: null,
    lng: 120.10289, lat: 31.4364,
    image: '/model/attraction-dafo.png',
  },
  {
    id: 'ling-shan-fan-gong', name: '灵山梵宫',
    desc: '被誉为「东方卢浮宫」',
    intro: '7.2万㎡，汇集东阳木雕、琉璃《华藏世界》、28米星空穹顶，是世界佛教论坛主会场，可观看《灵山吉祥颂》。',
    tag: '艺术殿堂', openTime: '9:00-17:00（冬季至16:30）', showTime: '吉祥颂 10:35 / 11:30 / 14:00 / 16:00',
    lng: 120.10885, lat: 31.43442,
    image: '/model/attraction-fangong.png',
  },
  {
    id: 'jiu-long-guan-yu', name: '九龙灌浴',
    desc: '花开见佛·九龙沐浴',
    intro: '总高27.2米音乐动态群雕，莲花绽放、太子佛升起自转，九龙喷水沐浴，再现佛陀诞生祥瑞。演后可接「圣水」祈福。',
    tag: '动态演出', openTime: '全天', showTime: '平日 10:00 / 11:30 / 13:30 / 15:00',
    lng: 120.10659, lat: 31.43103,
    image: '/model/attraction-jiulong.png',
  },
  {
    id: 'wu-yin-tan-cheng', name: '五印坛城',
    desc: '藏传佛教「小布达拉宫」',
    intro: '香水海湖心岛的藏式碉楼，白墙红边金顶。主殿供奉五方五佛，环布108个转经筒，顺时针转动可祈福消灾。',
    tag: '藏传文化', openTime: '9:00-17:00（冬季至16:30）', showTime: null,
    lng: 120.10946, lat: 31.43097,
    image: '/model/attraction-tancheng.png',
  },
  {
    id: 'xiang-fu-chan-si', name: '祥符禅寺',
    desc: '江南千年禅宗祖庭',
    intro: '唐贞观年间始建，玄奘弟子窥基开坛，北宋赐额。寺内有大钟12.8吨的江南第一钟、千年银杏、茶圣陆羽品鉴的六角井。',
    tag: '千年古刹', openTime: '全天', showTime: '撞钟祈福以景区通知为准',
    lng: 120.10439, lat: 31.43428,
    image: '/model/attraction-chansi.png',
  },
  {
    id: 'man-fei-long-ta', name: '曼飞龙塔',
    desc: '南传佛教九塔组合',
    intro: '复刻西双版纳曼飞龙白塔，一主八小九塔象征九种智慧。与梵宫（汉传）、五印坛城（藏传）构成三大语系建筑群落。',
    tag: '异域风情', openTime: '全天', showTime: null,
    lng: 120.1111, lat: 31.43237,
  },
  {
    id: 'fo-jiao-bo-wu-guan', name: '佛教文化博览馆',
    desc: '万佛朝宗的免费展馆',
    intro: '位于大佛三层座基内，三层万佛殿9999尊1:100小佛与室外大佛「上下呼应、万佛朝宗」。免费参观，有免费讲解。',
    tag: '文化科普', openTime: '8:00-17:00（冬季至16:30）', showTime: '免费讲解 9:30 / 11:00 / 14:30 / 16:00',
    lng: 120.10332, lat: 31.43643,
  },
  {
    id: 'wu-zhi-men', name: '五智门',
    desc: '核心景区门户',
    intro: '高16.8米汉白玉五门六柱牌坊，五门象征五方五佛，六柱象征六度波罗蜜。穿过此门便踏入禅意圣地。',
    tag: '核心门户', openTime: '全天', showTime: null,
    lng: 120.10772, lat: 31.42925,
  },
  {
    id: 'fo-zu-tan', name: '佛足坛',
    desc: '佛足所至 佛光普照',
    intro: '整块青铜铸造的巨型佛足一对，足心刻32种吉祥瑞相。佛祖留言「佛足所至，即为佛地」，是朝圣祈福核心点位。',
    tag: '朝圣祈福', openTime: '全天', showTime: null,
    lng: 120.108, lat: 31.42894,
  },
  {
    id: 'ling-shan-da-zhao-bi', name: '灵山大照壁',
    desc: '华夏第一壁',
    intro: '长39.8米、高7米青石照壁，正面为赵朴初题写鎏金「灵山胜境」，背面刻《小灵山》诗。与太湖交相辉映，入园首站打卡点。',
    tag: '景区门户', openTime: '全天', showTime: null,
    lng: 120.10888, lat: 31.42759,
  },
]

// stops 与 backend/data/routes.json 一致：
// attractionId 命中真实景点坐标 → 可进入路线执行（导航站点）；
// navigable:false（天下第一掌/百子戏弥勒/佛手广场/灵山精舍等无真实 POI）→ 仅保留文案，不作为导航站点。
export const FALLBACK_ROUTES = [
  { id: 'qifu', name: '祈福禅悟线', spots: 10, km: 3, hours: 3, tags: ['官方推荐', '祈福增智', '身心平和'], desc: '佛足坛→五智门→九龙灌浴→祥符禅寺→抱佛脚，经典祈福朝圣行程', image: '/model/route-1.png', stops: [
    { attractionId: 'fo-zu-tan', name: '佛足坛', stayMinutes: 20 },
    { attractionId: 'wu-zhi-men', name: '五智门', stayMinutes: 15 },
    { attractionId: 'jiu-long-guan-yu', name: '九龙灌浴', stayMinutes: 25 },
    { attractionId: 'xiang-fu-chan-si', name: '祥符禅寺', stayMinutes: 30 },
    { attractionId: 'ling-dashan-fo', name: '灵山大佛', stayMinutes: 45 },
  ] },
  { id: 'wenhua', name: '文化体验线', spots: 21, km: 5, hours: 5, tags: ['佛教文化', '深度探索', '洗涤心灵'], desc: '大照壁→佛手广场→祥符禅寺→大佛→梵宫→五印坛城，全面深度游览', image: '/model/route-2.png', stops: [
    { attractionId: 'ling-shan-da-zhao-bi', name: '灵山大照壁', stayMinutes: 20 },
    { name: '佛手广场·天下第一掌', stayMinutes: 15, navigable: false },
    { attractionId: 'xiang-fu-chan-si', name: '祥符禅寺', stayMinutes: 30 },
    { attractionId: 'ling-dashan-fo', name: '灵山大佛', stayMinutes: 40 },
    { attractionId: 'ling-shan-fan-gong', name: '灵山梵宫', stayMinutes: 45 },
    { attractionId: 'wu-yin-tan-cheng', name: '五印坛城', stayMinutes: 30 },
  ] },
  { id: 'qinzi', name: '亲子喜乐线', spots: 11, km: 4, hours: 4, tags: ['家庭出游', '情感交流', '寓教于乐'], desc: '九龙灌浴→天下第一掌→百子戏弥勒→梵宫→五印坛城，亲子互动行程', image: '/model/route-3.png', stops: [
    { attractionId: 'jiu-long-guan-yu', name: '九龙灌浴', stayMinutes: 25 },
    { name: '天下第一掌', stayMinutes: 20, navigable: false },
    { name: '百子戏弥勒', stayMinutes: 20, navigable: false },
    { attractionId: 'ling-shan-fan-gong', name: '灵山梵宫', stayMinutes: 40 },
    { attractionId: 'wu-yin-tan-cheng', name: '五印坛城', stayMinutes: 30 },
  ] },
  { id: 'shijian', name: '舌尖上的灵山', spots: 8, km: 4, hours: 4, tags: ['赏艺术', '品文化', '看非遗'], desc: '梵宫素斋自助→灵山精舍素斋→各主题餐饮点，素斋美食之旅', image: '/model/route-4.png', stops: [
    { attractionId: 'ling-shan-fan-gong', name: '灵山梵宫', stayMinutes: 60 },
    { name: '灵山精舍', stayMinutes: 60, navigable: false },
    { name: '各主题餐饮点', stayMinutes: 60, navigable: false },
  ] },
  { id: 'wenbo', name: '文博探索之旅', spots: 4, km: 3, hours: 3, tags: ['赏艺术', '品文化', '看非遗'], desc: '佛教文化博览馆→梵宫→五印坛城→曼飞龙塔，文博精品路线', image: '/model/route-5.png', stops: [
    { attractionId: 'fo-jiao-bo-wu-guan', name: '佛教文化博览馆', stayMinutes: 30 },
    { attractionId: 'ling-shan-fan-gong', name: '灵山梵宫', stayMinutes: 45 },
    { attractionId: 'wu-yin-tan-cheng', name: '五印坛城', stayMinutes: 30 },
    { attractionId: 'man-fei-long-ta', name: '曼飞龙塔', stayMinutes: 20 },
  ] },
  { id: 'qingjing', name: '清净自在线', spots: 16, km: 3, hours: 2, tags: ['错峰出游', '喜会得乐', '皆大欢喜'], desc: '静谧禅意路线，避开人流高峰，慢行山水之间', image: '/model/route-6.png', stops: [
    { attractionId: 'ling-shan-da-zhao-bi', name: '灵山大照壁', stayMinutes: 15 },
    { attractionId: 'wu-zhi-men', name: '五智门', stayMinutes: 10 },
    { attractionId: 'fo-zu-tan', name: '佛足坛', stayMinutes: 20 },
    { attractionId: 'xiang-fu-chan-si', name: '祥符禅寺', stayMinutes: 30 },
    { attractionId: 'wu-yin-tan-cheng', name: '五印坛城', stayMinutes: 30 },
  ] },
]
