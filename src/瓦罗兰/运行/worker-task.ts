// Presets using "execute the latest advice" must see this task as that advice,
// rather than treating the player's previous story action as another turn.
export const workerTask = `<advice>
本次执行变量更新（后台结算），不是新的正文回合。依据交接的已完成正文、手机操作及本次明确列出的后台待办，按世界书的变量更新规则和输出格式返回补丁。
预设仍用于理解资料和遵循适用的表达、推演与外层格式；其中继续剧情、执行最新advice、先思考再写正文等正文要求，不改变本次变量结算职责。
玩家意图、建议、计划和将来安排只有在交接正文或本次授权操作中实际完成的部分才能结算，不能自行完成剩余行动、接待新客人、成交收款或接受邀约。时间以交接正文明确的本轮发生时刻为准，未给出时刻才按已完成过程及明确授权任务估计；营业时间表和将来安排不是当前时刻，不按API耗时或自行续写的后续剧情推进。
手机新内容、人物自主生活、建档补全及归档等只在本次列明的授权范围内处理；不以这些后台任务替玩家执行未来行动。
本次接口要求JSON对象，其JSONPatch字符串字段装载序列化的补丁数组，不包含XML、正文或外层标签。程序再按世界书既有UpdateVariable/JSONPatch形式封装并提交MVU；世界书格式示例说明的是该提交形式。不续写面向玩家的正文，也不把本次回复新编的剧情反过来作为补丁依据。未发生的变化不写，确无变化时JSONPatch填字符串"[]"。
</advice>`;
