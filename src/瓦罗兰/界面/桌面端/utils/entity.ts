/**
 * 通用实体引用解析与格式化工具函数
 * 确保各处不再暴露内部原始 ID (如 char_xxx, loc_xxx, acc_xxx)
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PRESET_CHARACTER_NAMES: Record<string, string> = {
  ahri: '阿狸',
  caitlyn: '凯特琳',
  vi: '蔚',
  jinx: '金克丝',
  seraphine: '萨勒芬妮',
  akali: '阿卡丽',
  evelynn: '伊芙琳',
  kaisa: '卡莎',
  lux: '拉克丝',
  gwen: '格温',
  zoe: '佐伊',
  vex: '薇古丝',
  syndra: '辛德拉',
  morgana: '莫甘娜',
  kayle: '凯尔',
  leona: '蕾欧娜',
  diana: '黛安娜',
  irelia: '艾瑞莉娅',
  sona: '娑娜',
  yuumi: '悠米',
  nami: '娜美',
  lillia: '莉莉娅',
  neeko: '妮蔻',
  senna: '赛娜',
  ashe: '艾希',
  sejuani: '瑟庄妮',
  lissandra: '丽桑卓',
  fiora: '菲奥娜',
  riven: '锐雯',
  samira: '莎弥拉',
  zeri: '泽丽',
  briar: '贝蕾亚',
  mel: '梅尔',
  ambessa: '安蓓萨',
  renata: '烈娜塔',
  camille: '卡蜜尔',
  ori: '奥莉安娜',
  orianna: '奥莉安娜',
  vayne: '薇恩',
  quinn: '奎因',
  poppy: '波比',
  tristana: '崔丝塔娜',
  lulu: '璐璐',
  annie: '安妮',
  katarina: '卡特琳娜',
  cassiopeia: '卡西奥佩娅',
  leblanc: '乐芙兰',
  elise: '伊莉丝',
  shyvana: '希瓦娜',
  nidalee: '奈德丽',
  zyra: '婕拉',
  taliyah: '塔莉垭',
  sivir: '希维尔',
  kalista: '卡莉丝塔',
  illaoi: '俄洛伊',
  rekk: '艾克',
  jayce: '杰斯',
  viktor: '维克托',
  ezreal: '伊泽瑞尔',
  sett: '瑟提',
  aphelios: '厄斐琉斯',
  kayn: '凯隐',
  yasuo: '亚索',
  yone: '永恩',
  talon: '泰隆',
  zed: '劫',
  shen: '慎',
  viego: '佛耶戈',
  hwei: '彗',
  smolder: '斯莫德',
};

export function resolveCharacterName(state: any, id: string | null | undefined): string {
  if (!id) return '未知人物';
  if (state?.玩家?.id === id) {
    return state.玩家.姓名 || '玩家本人';
  }
  const cleanId = id.replace(/^(task_|char_|opening_|schedule_|cw_)/, '').toLowerCase();

  const char = state?.角色?.[id] || state?.角色?.[cleanId];
  if (char) {
    return char.姓名 || char.基础信息?.姓名 || id;
  }
  if (state?._系统?.角色停用标识?.[id]) return (state._系统.角色停用标识[id].姓名 || id) + '（已停用）';
  if (state?._系统?.角色停用标识?.[cleanId]) return (state._系统.角色停用标识[cleanId].姓名 || cleanId) + '（已停用）';

  if (PRESET_CHARACTER_NAMES[cleanId]) {
    return PRESET_CHARACTER_NAMES[cleanId];
  }
  if (PRESET_CHARACTER_NAMES[id.toLowerCase()]) {
    return PRESET_CHARACTER_NAMES[id.toLowerCase()];
  }
  return id;
}

export const PRESET_LOCATION_NAMES: Record<string, string> = {
  riverside_riverwalk: '谐振中央广场',
  riverside_yunhui: '瓦罗兰联合商务中心',
  riverside_international_hotel: '谐振国际酒店',
  riverside_jinyao_gym: '金曜高端健身俱乐部',
  oldtown_old_street: '迷途街角',
  oldtown_vegetable_market: '旧城便民集市',
  oldtown_community_hall: '旧城邻里会馆',
  oldtown_lianchi_bathhouse: '旧城公共汤屋',
  oldtown_tingyu_courtyard: '听雨花园宅',
  cutie_cafe: '咖啡甜心',
  university_book_street: '符文书街',
  university_library: '瓦罗兰公共图书馆',
  university_university: '战斗学院',
  university_student_dorms: '战斗学院学生生活区',
  university_weapon_hall: '神之武器谐振礼堂',
  residential_plaza: '市民艺文广场',
  residential_sports_park: '晨光运动公园',
  residential_service_station: '瓦罗兰便民服务中心',
  residential_jijing_club: '极境女子综合搏击俱乐部',
  residential_wen_residence: '艺文区花园宅',
  residential_cafe_street: '旧唱片咖啡街',
  residential_boxing_gym: '极境综合搏击训练馆',
  market_market: '万国商贸街',
  market_grocery_street: '旧工坊杂货街',
  market_craft_court: '符文工坊手创院',
  lingyou_animal_base: '灵佑动物保育基地',
  qinghe_base_sunroom: '灵佑基地暖阳玻璃阳光房',
  qinghe_base_dorm_a: '灵佑基地员工宿舍A栋',
  qinghe_market_feed_store: '青禾便民饲料与草药杂货店',
  coast_seawall: '瓦罗兰港湾海堤',
  coast_sports_center: '港湾水上运动中心',
  coast_resort: '夏湾滨海度假酒店',
  coast_seaview_apartments: '港湾瞰海公寓',
  coast_seaview_manor: '夏湾私人度假庄园',
  coast_yoga_house: '听涛瑜伽生活馆',
  demacia_city: '德玛西亚白色城邦',
  crownguard_estate: '冕卫家族庄园',
  noxus_trade_port: '诺克萨斯工业通商区',
  glasc_industries: '戈拉斯克工业总部',
  freljord_dome: '弗雷尔卓德生态穹顶',
  true_ice_seal: '臻冰封印',
  kda_stadium: 'K/DA巨蛋体育场',
  lotus_hot_spring: '莲华温泉',
  piltover_research: '皮尔特沃夫科研街区',
  zaun_market: '祖安炼金市集',
  break_rules_club: '无视规则俱乐部',
  bilgewater_port: '比尔吉沃特贸易港',
  summer_coast: '夏日海岸线',
  ocean_song_island: '海之歌移动生态浮岛',
  shurima_zone: '恕瑞玛经济特区',
  targon_foothills: '巨神峰山脚教派区',
  celestial_realm: '巨神峰星灵领域',
  black_mist_boundary: '暗影岛黑雾边界',
  bandle_passage: '班德尔维度入口',
};

export function resolveLocationName(state: any, id: string | null | undefined): string {
  if (!id) return '未知地点';
  const loc = state?.地点?.[id];
  if (loc && loc.名称) {
    return loc.名称;
  }
  if (PRESET_LOCATION_NAMES[id]) {
    return PRESET_LOCATION_NAMES[id];
  }
  return id;
}

export function resolveAccountName(state: any, id: string | null | undefined): string {
  if (!id) return '未知账号';
  const acc = state?.手机?.账号?.[id];
  if (acc) {
    const nick = acc.昵称 || acc.账号名 || '';
    const plat = acc.平台 ? ` (${acc.平台})` : '';
    return (nick ? `${nick}${plat}` : id);
  }
  return id;
}

export function resolveOrganizationName(state: any, id: string | null | undefined): string {
  if (!id) return '未知组织';
  const org = state?.组织?.[id];
  if (org) {
    return org.名称 || id;
  }
  return id;
}

export function resolveEntityName(state: any, id: string | null | undefined): string {
  if (!id) return '未知';
  if (state?.玩家?.id === id) return state.玩家.姓名 || '玩家本人';
  if (state?.角色?.[id]) return state.角色[id].姓名 || state.角色[id].基础信息?.姓名 || id;
  if (state?._系统?.角色停用标识?.[id]) return (state._系统.角色停用标识[id].姓名 || id) + '（已停用）';
  if (state?.地点?.[id]) return state.地点[id].名称 || id;
  if (state?.手机?.账号?.[id]) return state.手机.账号[id].昵称 || state.手机.账号[id].账号名 || id;
  if (state?.组织?.[id]) return state.组织[id].名称 || id;
  return id;
}

export function formatGoldAmount(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '金额未定';
  return `${(cents / 100).toFixed(2)} 金币`;
}

// 兼容旧组件导入；余额仍按百分之一金币的整数单位记账。
export const formatCentsToYuan = formatGoldAmount;

export function formatTimeObj(time: any): string {
  if (!time || typeof time !== 'object') return '时间未定';
  const { 年, 月, 日, 时, 分 } = time;
  if (年 == null || 月 == null || 日 == null) return '时间未定';
  const timePart = 时 != null ? ` ${时}:${String(分 ?? 0).padStart(2, '0')}` : '';
  return `${年}年${月}月${日}日${timePart}`;
}

export function formatTimeRange(start: any, end: any): string {
  if (!start && !end) return '时段未知';
  if (start && !end) return `${formatTimeObj(start)} 起`;
  if (!start && end) return `至 ${formatTimeObj(end)}`;
  return `${formatTimeObj(start)} ~ ${formatTimeObj(end)}`;
}
