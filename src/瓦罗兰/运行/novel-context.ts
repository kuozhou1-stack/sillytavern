import type { State } from './core';
import geography from './world-geography.json';

// Request summary of the maintained 常驻/时代与生活、城市空间、异常入侵阶段、组织与净化节点.
// Region names/functions come from the existing district YAML derivative, not saved NPC/location records.
export const novelPublicSetting =
  '瓦罗兰市是魔法、科技和多种族共存的现代都市，六个城市生活区各有功能；市外各独立文明与班德尔口袋维度保留自身特征。' +
  '演艺与音乐、学院学习研究、符文工艺与炼金、商贸航运、社区生活、文明交流和异空间探索均可成为主题；装备、魔法设施与科技依现有设定发挥作用。' +
  'K/DA、真实伤害与心之钢以演艺合作为公开活动。多所独立战斗学院共用悬空园区，不是同校分院；守护与救援组织各有职责，不默认统一指挥、固定同盟或共享全部情报。' +
  '周边文明不是市内街区；悬空园区、双生城市上下层与跨维度通路有实际接驳或入口条件。班德尔没有固定现实入口；里世界可依附现实地点，越界、通行与返回依具体条件。' +
  '虚空、暗星、星之吞噬者、恶魔等威胁各有来源与作用方式，不统一写成情绪产生的精神污染。' +
  '整体异常入侵度0–9为潜伏、10–29为预警、30–59为高危、60–89为危机、90–100为全面崩溃；从日常与局部调查逐步转向救援、封锁应对、撤离和战斗等主题。' +
  '阶段说明整体局势，具体地区和事件依已提供事实；未知不默认平静或灾变。世界观背景不等于玩家知情，不据此给玩家添加身份、能力、已知地点或既往经历。' +
  '日常金币与奇遇蓝色精粹独立；商品效果以其具体描述为准。';

const districts = geography.districts.map(({ id, name, scope, role }) => ({ id, 名称: name, 地理层级: scope, 功能: role }));

/** The refresh request receives exactly two saved context scalars plus the public district directory. */
export function novelCreationContext(state: State) {
  const placeId = state.玩家.当前状态.当前地点id;
  const districtId = placeId ? state.地点[placeId]?.片区id : null;
  return {
    当前地区id: districts.find(district => district.id === districtId)?.id ?? null,
    异常入侵度: state.世界.异常入侵度,
    地区目录: districts,
  };
}
