// stat_data 结构。唯一事实来源；解析不执行归档、随机初始化或网络请求。
// null 表示未知；所有 _ 前缀字段及其后代由程序维护。
export const Schema = z
  .object({
    世界: z
      .object({
        基础信息: z
          .object({
            国家: z.string().nullable().prefault(null),
            城市id: z.string().prefault('valoran'),
            城市名称: z.string().prefault('瓦罗兰市'),
            时区: z.literal('Asia/Shanghai').prefault('Asia/Shanghai'),
          })
          .prefault({}),
        异常入侵度: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>())
          .transform(value => _.clamp(value, 0, 100))
          .nullable()
          .prefault(null),
        当前时间: z
          .record(
            z.enum(['年', '月', '日', '时', '分']),
            z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
          )
          .refine(
            t =>
              t.年 >= 1 &&
              t.年 <= 9999 &&
              t.月 >= 1 &&
              t.月 <= 12 &&
              t.日 >= 1 &&
              t.时 >= 0 &&
              t.时 <= 23 &&
              t.分 >= 0 &&
              t.分 <= 59 &&
              t.日 <=
                (t.月 === 2
                  ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                    ? 29
                    : 28
                  : [4, 6, 9, 11].includes(t.月)
                    ? 30
                    : 31),
            { message: '无效公历日期，不自动跳日' },
          )
          .nullable()
          .prefault(null),
        开局时间: z
          .record(
            z.enum(['年', '月', '日', '时', '分']),
            z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
          )
          .refine(
            t =>
              t.年 >= 1 &&
              t.年 <= 9999 &&
              t.月 >= 1 &&
              t.月 <= 12 &&
              t.日 >= 1 &&
              t.时 >= 0 &&
              t.时 <= 23 &&
              t.分 >= 0 &&
              t.分 <= 59 &&
              t.日 <=
                (t.月 === 2
                  ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                    ? 29
                    : 28
                  : [4, 6, 9, 11].includes(t.月)
                    ? 30
                    : 31),
            { message: '无效公历日期，不自动跳日' },
          )
          .nullable()
          .prefault(null),
        片区: z
          .record(
            z.string().describe('片区id'),
            z
              .object({
                名称: z.string().nullable().prefault(null),
                功能: z.string().nullable().prefault(null),
                方位: z.string().nullable().prefault(null),
                地图中心: z
                  .object({
                    x: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>())
                      .nullable()
                      .prefault(null),
                    y: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>())
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              })
              .prefault({}),
          )
          .prefault({}),
        天气: z
          .object({
            天气状况: z.string().nullable().prefault(null),
            气温: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>())
              .nullable()
              .prefault(null),
            风况: z.string().nullable().prefault(null),
            适用区域: z.string().nullable().prefault(null),
            生效时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
            _上次检查时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
          })
          .prefault({}),
        当前场景: z
          .object({
            场景id: z.string().nullable().prefault(null),
            在场人物: z.array(z.string()).prefault([]),
            正在进行的事: z.string().nullable().prefault(null),
            环境状态: z.string().nullable().prefault(null),
            未完事项: z
              .record(
                z.string().describe('事项id'),
                z
                  .object({
                    内容: z.string().nullable().prefault(null),
                    关联约定id: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            _上次更新场景时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
          })
          .prefault({}),
        城市日程: z
          .record(
            z.string().describe('日程id'),
            z
              .object({
                名称: z.string().nullable().prefault(null),
                类型: z.string().nullable().prefault(null),
                起始时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                结束时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                地点id: z.string().nullable().prefault(null),
                适用范围: z.string().nullable().prefault(null),
                公开信息: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        天气预报: z
          .record(
            z.string().describe('预报id'),
            z
              .object({
                预测内容: z.string().nullable().prefault(null),
                起始时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                结束时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                发布时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                适用范围: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
      })
      .prefault({}),
    玩家: z
      .object({
        id: z.string().nullable().prefault(null),
        姓名: z.string().nullable().prefault(null),
        种族: z.string().nullable().prefault(null),
        称呼: z.string().nullable().prefault(null),
        性别: z.string().nullable().prefault(null),
        年龄: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().nonnegative())
          .nullable()
          .prefault(null),
        背景: z
          .record(
            z.enum(['成长背景', '家庭背景', '教育经历', '重要过往', '当前生活背景']),
            z.string().nullable().prefault(null),
          )
          .prefault({}),
        身份: z
          .object({
            身份: z.string().nullable().optional(),
            // 仅接收旧存档输入；解析后移除旧键，派生提示词不包含此兼容字段。
            当前职业: z.string().nullable().optional().meta({ deprecated: true }),
            社会身份: z.string().nullable().prefault(null),
            工作或就读单位: z.string().nullable().prefault(null),
            组织id: z.array(z.string()).prefault([]),
          })
          .transform(({ 当前职业, ...profile }) => ({
            ...profile,
            身份: profile.身份 === undefined ? 当前职业 ?? null : profile.身份,
          }))
          .prefault({}),
        外貌: z
          .object({
            身高: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().nonnegative())
              .nullable()
              .prefault(null),
            体重: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().nonnegative())
              .nullable()
              .prefault(null),
            体型: z.string().nullable().prefault(null),
            面容: z.string().nullable().prefault(null),
            发型: z.string().nullable().prefault(null),
            显著特征: z.string().nullable().prefault(null),
            整体外貌描述: z.string().nullable().prefault(null),
          })
          .prefault({}),
        当前状态: z
          .object({
            当前地点id: z.string().nullable().prefault(null),
            正在进行的行动: z.string().nullable().prefault(null),
            今日穿搭: z.string().nullable().prefault(null),
            身体状态: z.string().nullable().prefault(null),
            饱食度: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().transform(value => _.clamp(value, 0, 100)))
              .nullable()
              .prefault(null),
            水分值: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().transform(value => _.clamp(value, 0, 100)))
              .nullable()
              .prefault(null),
            体力值: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().transform(value => _.clamp(value, 0, 100)))
              .nullable()
              .prefault(null),
          })
          .prefault({}),
        生活: z
          .object({
            住处id: z.string().nullable().prefault(null),
            工作地点id: z.array(z.string()).prefault([]),
            常去地点id: z.array(z.string()).prefault([]),
            日常活动: z.string().nullable().prefault(null),
            联系方式: z.array(z.string()).prefault([]),
            目标: z
              .record(
                z.string().describe('目标id'),
                z
                  .object({
                    内容: z.string().nullable().prefault(null),
                    进展: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            约定: z.array(z.string()).prefault([]),
          })
          .prefault({}),
        技能栏: z
          .record(
            z.string().describe('技能id'),
            z
              .object({
                名称: z.string().nullable().prefault(null),
                品质: z.string().nullable().prefault(null),
                描述: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        已知信息: z
          .object({
            已认识人物: z
              .record(
                z.string().describe('人物id'),
                z
                  .object({
                    称呼: z.string().nullable().prefault(null),
                    已知资料: z.string().nullable().prefault(null),
                    上次已知地点id: z.string().nullable().prefault(null),
                    位置获知时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    已明确不在场: z.boolean().prefault(false),
                    来源: z
                      .object({
                        方式: z
                          .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                          .prefault('未设定'),
                        说明: z.string().nullable().prefault(null),
                        人物id: z.string().nullable().prefault(null),
                        记录id: z.string().nullable().prefault(null),
                        获得时间: z
                          .record(
                            z.enum(['年', '月', '日', '时', '分']),
                            z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().int()),
                          )
                          .refine(
                            t =>
                              t.年 >= 1 &&
                              t.年 <= 9999 &&
                              t.月 >= 1 &&
                              t.月 <= 12 &&
                              t.日 >= 1 &&
                              t.时 >= 0 &&
                              t.时 <= 23 &&
                              t.分 >= 0 &&
                              t.分 <= 59 &&
                              t.日 <=
                                (t.月 === 2
                                  ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                    ? 29
                                    : 28
                                  : [4, 6, 9, 11].includes(t.月)
                                    ? 30
                                    : 31),
                            { message: '无效公历日期，不自动跳日' },
                          )
                          .nullable()
                          .prefault(null),
                      })
                      .prefault({}),
                  })
                  .prefault({}),
              )
              .prefault({}),
            已知地点: z
              .record(
                z.string().describe('地点id'),
                z
                  .object({
                    方式: z
                      .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                      .prefault('未设定'),
                    说明: z.string().nullable().prefault(null),
                    人物id: z.string().nullable().prefault(null),
                    记录id: z.string().nullable().prefault(null),
                    获得时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            已知账号: z
              .record(
                z.string().describe('账号id'),
                z
                  .object({
                    方式: z
                      .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                      .prefault('未设定'),
                    说明: z.string().nullable().prefault(null),
                    人物id: z.string().nullable().prefault(null),
                    记录id: z.string().nullable().prefault(null),
                    获得时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            获知事项: z
              .record(
                z.string().describe('认知id'),
                z
                  .object({
                    内容: z.string().nullable().prefault(null),
                    性质: z.enum(['事实', '推测', '误解', '未确认']).prefault('未确认'),
                    来源: z
                      .object({
                        方式: z
                          .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                          .prefault('未设定'),
                        说明: z.string().nullable().prefault(null),
                        人物id: z.string().nullable().prefault(null),
                        记录id: z.string().nullable().prefault(null),
                        获得时间: z
                          .record(
                            z.enum(['年', '月', '日', '时', '分']),
                            z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().int()),
                          )
                          .refine(
                            t =>
                              t.年 >= 1 &&
                              t.年 <= 9999 &&
                              t.月 >= 1 &&
                              t.月 <= 12 &&
                              t.日 >= 1 &&
                              t.时 >= 0 &&
                              t.时 <= 23 &&
                              t.分 >= 0 &&
                              t.分 <= 59 &&
                              t.日 <=
                                (t.月 === 2
                                  ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                    ? 29
                                    : 28
                                  : [4, 6, 9, 11].includes(t.月)
                                    ? 30
                                    : 31),
                            { message: '无效公历日期，不自动跳日' },
                          )
                          .nullable()
                          .prefault(null),
                      })
                      .prefault({}),
                    对象id: z.string().nullable().prefault(null),
                    分享范围: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
          })
          .prefault({}),
        个人记录: z
          .object({
            个人备忘: z
              .record(
                z.string().describe('备忘id'),
                z
                  .object({
                    内容: z.string().nullable().prefault(null),
                    关联事项id: z.array(z.string()).prefault([]),
                  })
                  .prefault({}),
              )
              .prefault({}),
            重要经历: z
              .record(
                z.string().describe('经历id'),
                z
                  .object({
                    日期说明: z.string().nullable().prefault(null),
                    日期精度: z.enum(['日', '月', '年', '未知']).prefault('未知'),
                    经历: z.string().nullable().prefault(null),
                    来源事件id: z.array(z.string()).prefault([]),
                    来源存档id: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
          })
          .prefault({}),
        物品栏: z
          .record(
            z.string().describe('物品id'),
            z
              .looseObject({
                名称: z.string().nullable().prefault(null),
                类别: z.string().nullable().prefault(null),
                单位: z.string().nullable().prefault(null),
                描述: z.string().nullable().prefault(null),
                状态: z.string().nullable().prefault(null),
                数量: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().nonnegative())
                  .nullable()
                  .prefault(null),
                所有者id: z.string().nullable().optional(),
                持有人id: z.string().nullable().optional(),
                存放地点id: z.string().nullable().optional(),
                获得时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                关联事项id: z.array(z.string()).prefault([]),
              })
              .refine(
                raw => {
                  const oldTime =
                    raw.来源 && typeof raw.来源 === 'object' ? (raw.来源 as { 获得时间?: unknown }).获得时间 : null;
                  return (
                    raw.获得时间 !== null ||
                    oldTime == null ||
                    z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null)
                      .safeParse(oldTime).success
                  );
                },
                { message: '旧物品来源中的获得时间必须是有效公历时间', path: ['获得时间'] },
              )
              .transform(raw => {
                const { 来源, 当前可用, ...item } = raw;
                const oldTime = 来源 && typeof 来源 === 'object' ? (来源 as { 获得时间?: unknown }).获得时间 : null;
                if (item.获得时间 === null && oldTime != null)
                  item.获得时间 = z
                    .record(
                      z.enum(['年', '月', '日', '时', '分']),
                      z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                    )
                    .refine(
                      t =>
                        t.年 >= 1 &&
                        t.年 <= 9999 &&
                        t.月 >= 1 &&
                        t.月 <= 12 &&
                        t.日 >= 1 &&
                        t.时 >= 0 &&
                        t.时 <= 23 &&
                        t.分 >= 0 &&
                        t.分 <= 59 &&
                        t.日 <=
                          (t.月 === 2
                            ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                              ? 29
                              : 28
                            : [4, 6, 9, 11].includes(t.月)
                              ? 30
                              : 31),
                      { message: '无效公历日期，不自动跳日' },
                    )
                    .nullable()
                    .prefault(null)
                    .parse(oldTime);
                return _.pick(item, [
                  '名称',
                  '类别',
                  '单位',
                  '描述',
                  '状态',
                  '数量',
                  '所有者id',
                  '持有人id',
                  '存放地点id',
                  '获得时间',
                  '关联事项id',
                ] as const);
              })
              .prefault({}),
          )
          .transform(items => _.pickBy(items, item => item.类别 !== '消耗品' || item.数量 !== 0))
          .prefault({}),
        资金: z
          .looseObject({
            余额分: z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
              .nullable()
              .optional(),
            交易: z
              .record(
                z.string().describe('交易id'),
                z
                  .object({
                    事件id: z.string().nullable().prefault(null),
                    时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    类型: z.enum(['收入', '支出', '内部转账', '退款']).prefault('支出'),
                    金额分: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .nullable()
                      .prefault(null),
                    对方id: z.string().nullable().prefault(null),
                    用途: z.string().nullable().prefault(null),
                    状态: z.enum(['待结', '已完成', '取消']).prefault('待结'),
                    _提交id: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            未结事项: z
              .record(
                z.string().describe('事项id'),
                z
                  .object({
                    类型: z.string().nullable().prefault(null),
                    金额分: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .nullable()
                      .prefault(null),
                    对方id: z.string().nullable().prefault(null),
                    条件: z.string().nullable().prefault(null),
                    状态: z.enum(['未结', '已结', '取消']).prefault('未结'),
                    关联交易id: z.array(z.string()).prefault([]),
                  })
                  .prefault({}),
              )
              .prefault({}),
          })
          .prefault({})
          .refine(
            funds => {
              if (funds.余额分 !== undefined) return true;
              const accounts = funds.账户;
              if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return true;
              const result = z
                .record(
                  z.string(),
                  z.object({
                    余额分: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
                      .nullable()
                      .prefault(null),
                  }),
                )
                .safeParse(accounts);
              if (!result.success) return false;
              const balances = Object.values(result.data).map(account => account.余额分);
              return (
                balances.some(value => value === null) ||
                Number.isSafeInteger(balances.reduce<number>((sum, value) => sum + value!, 0))
              );
            },
            { message: '旧账户余额必须是非负安全整数分或 null，明确余额的合计也须在安全整数范围内', path: ['账户'] },
          )
          .transform(funds => {
            if (funds.余额分 !== undefined) return { 余额分: funds.余额分, 交易: funds.交易, 未结事项: funds.未结事项 };
            const accounts = funds.账户;
            const balances =
              accounts && typeof accounts === 'object' && !Array.isArray(accounts)
                ? Object.values(accounts).map(
                    account =>
                      z
                        .object({
                          余额分: z
                            .union([z.number(), z.string().trim().min(1)])
                            .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
                            .nullable()
                            .prefault(null),
                        })
                        .parse(account).余额分,
                  )
                : [];
            const total =
              balances.length && balances.every(value => value !== null)
                ? balances.reduce<number>((sum, value) => sum + value!, 0)
                : null;
            const balance = funds.余额分 === undefined ? total : funds.余额分;
            return { 余额分: balance, 交易: funds.交易, 未结事项: funds.未结事项 };
          }),
      })
      .prefault({}),
    角色: z
      .record(
        z.string().describe('人物id'),
        z
          .intersection(
            z.object({
              姓名: z.string().nullable().prefault(null),
              性别: z.string().nullable().prefault(null),
              种族: z.string().nullable().prefault(null),
              当前形态: z.string().nullable().prefault(null),
              年龄: z
                .union([z.number(), z.string().trim().min(1)])
                .pipe(z.coerce.number<string | number>().int().nonnegative())
                .nullable()
                .prefault(null),
              身份: z.string().nullable().prefault(null),
              组织id: z.array(z.string()).prefault([]),
              简介: z.string().nullable().prefault(null),
              关系网: z
                .record(
                  z.string().describe('对象人物id'),
                  z
                    .object({
                      姓名: z.string().nullable().optional(),
                      好感度: z
                        .union([z.number(), z.string().trim().min(1)])
                        .pipe(z.coerce.number<string | number>())
                        .transform(v => _.clamp(v, -100, 100))
                        .nullable()
                        .prefault(null),
                      信任度: z
                        .union([z.number(), z.string().trim().min(1)])
                        .pipe(z.coerce.number<string | number>())
                        .transform(v => _.clamp(v, -100, 100))
                        .nullable()
                        .prefault(null),
                      关系: z.string().nullable().prefault(null),
                      关系备注: z.string().nullable().prefault(null),
                      来源事件id: z.array(z.string()).prefault([]),
                      当前定位: z.string().nullable().prefault(null),
                      防御姿态: z.string().nullable().prefault(null),
                      破壁阶段: z
                        .union([z.number(), z.string().trim().min(1)])
                        .pipe(z.coerce.number<string | number>().int())
                        // 0 保留旧档的未记录私人交集；越界旧值转未知，不夹到最高阶段制造关系事实。
                        .transform(value => (value >= 0 && value <= 5 ? value : null))
                        .nullable()
                        .prefault(null),
                      已知私密: z.array(z.string()).prefault([]),
                    })
                    .prefault({}),
                )
                .prefault({}),
              认知: z
                .record(
                  z.string().describe('认知id'),
                  z
                    .object({
                      内容: z.string().nullable().prefault(null),
                      性质: z.enum(['事实', '推测', '误解', '未确认']).prefault('未确认'),
                      来源: z
                        .object({
                          方式: z
                            .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                            .prefault('未设定'),
                          说明: z.string().nullable().prefault(null),
                          人物id: z.string().nullable().prefault(null),
                          记录id: z.string().nullable().prefault(null),
                          获得时间: z
                            .record(
                              z.enum(['年', '月', '日', '时', '分']),
                              z
                                .union([z.number(), z.string().trim().min(1)])
                                .pipe(z.coerce.number<string | number>().int()),
                            )
                            .refine(
                              t =>
                                t.年 >= 1 &&
                                t.年 <= 9999 &&
                                t.月 >= 1 &&
                                t.月 <= 12 &&
                                t.日 >= 1 &&
                                t.时 >= 0 &&
                                t.时 <= 23 &&
                                t.分 >= 0 &&
                                t.分 <= 59 &&
                                t.日 <=
                                  (t.月 === 2
                                    ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                      ? 29
                                      : 28
                                    : [4, 6, 9, 11].includes(t.月)
                                      ? 30
                                      : 31),
                              { message: '无效公历日期，不自动跳日' },
                            )
                            .nullable()
                            .prefault(null),
                        })
                        .prefault({}),
                      对象id: z.string().nullable().prefault(null),
                      分享范围: z.string().nullable().prefault(null),
                    })
                    .prefault({}),
                )
                .prefault({}),
              当前状态: z.string().nullable().prefault(null),
              当前地点id: z.string().nullable().prefault(null),
              生活: z
                .looseObject({
                  住处id: z.string().nullable().prefault(null),
                  工作地点id: z.array(z.string()).prefault([]),
                  常去地点id: z.array(z.string()).prefault([]),
                  日常活动: z.string().nullable().prefault(null),
                  联系方式: z.array(z.string()).prefault([]),
                  目标: z
                    .record(
                      z.string().describe('目标id'),
                      z
                        .object({
                          内容: z.string().nullable().prefault(null),
                          进展: z.string().nullable().prefault(null),
                        })
                        .prefault({}),
                    )
                    .prefault({}),
                  约定: z.array(z.string()).prefault([]),
                })
                .prefault({}),
              重要记录: z
                .record(
                  z.string().describe('记录id'),
                  z
                    .object({
                      内容: z.string().nullable().prefault(null),
                      事件id: z.string().nullable().prefault(null),
                      约定id: z.string().nullable().prefault(null),
                    })
                    .prefault({}),
                )
                .prefault({}),
              _管理: z
                .object({
                  升格: z.boolean().prefault(false),
                  版本: z
                    .union([z.number(), z.string().trim().min(1)])
                    .pipe(z.coerce.number<string | number>().int().nonnegative())
                    .prefault(0),
                  来源档案id: z.string().nullable().prefault(null),
                  恢复说明: z.string().nullable().prefault(null),
                })
                .prefault({}),
            }),
            z.discriminatedUnion('层级', [
              z.object({
                层级: z.literal('主要'),
                外貌: z
                  .object({
                    身高: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().nonnegative())
                      .nullable()
                      .prefault(null),
                    体重: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().nonnegative())
                      .nullable()
                      .prefault(null),
                    整体体型: z.string().nullable().prefault(null),
                    三围信息: z
                      .object({
                        胸围: z
                          .union([z.number(), z.string().trim().min(1)])
                          .pipe(z.coerce.number<string | number>().nonnegative())
                          .nullable()
                          .prefault(null),
                        腰围: z
                          .union([z.number(), z.string().trim().min(1)])
                          .pipe(z.coerce.number<string | number>().nonnegative())
                          .nullable()
                          .prefault(null),
                        臀围: z
                          .union([z.number(), z.string().trim().min(1)])
                          .pipe(z.coerce.number<string | number>().nonnegative())
                          .nullable()
                          .prefault(null),
                      })
                      .prefault({}),
                    罩杯: z.string().nullable().prefault(null),
                    详细外表: z.string().nullable().prefault(null),
                    今日穿搭: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
                性格: z
                  .record(
                    z.enum(['里性格', '表性格', '爱好', '厌恶', '小习惯', '语言习惯']),
                    z.string().nullable().prefault(null),
                  )
                  .prefault({}),
                即时状态: z
                  .object({
                    心境基调: z.string().nullable().prefault(null),
                    生理状态: z.string().nullable().prefault(null),
                    注意力重心: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
                专属标识: z
                  .object({
                    身体印记: z.array(z.string()).prefault([]),
                    随身信物: z.array(z.string()).prefault([]),
                    感官特征: z.string().nullable().prefault(null),
                    破防弱点: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
                网络倾向: z
                  .record(
                    z.string().describe('平台或账号id，通用用通用'),
                    z
                      .record(
                        z.enum(['网络身份', '常用平台', '发布偏好', '活跃习惯', '互动风格', '公开边界']),
                        z.string().nullable().prefault(null),
                      )
                      .prefault({}),
                  )
                  .prefault({ 通用: {} }),
                性特征适用: z.boolean().nullable().prefault(null),
                性特征: z
                  .object({
                    奶子信息: z.string().nullable().prefault(null),
                    蜜穴信息: z.string().nullable().prefault(null),
                    其他: z
                      .string()
                      .describe('特殊性癖、身体异常敏感带、特殊生理体质（如溢乳、极敏、潮吹）、玩法偏好或私密扩充说明')
                      .nullable()
                      .prefault(null),
                    性经验: z
                      .object({
                        性次数: z
                          .object({
                            确数: z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().int().nonnegative())
                              .nullable()
                              .prefault(null),
                            概数说明: z.string().nullable().prefault(null),
                            已知新增说明: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                        性人群: z.string().nullable().prefault(null),
                        依据事件id: z.array(z.string()).prefault([]),
                      })
                      .prefault({}),
                  })
                  .prefault({})
                  .optional(),
                经历: z
                  .object({
                    人生经历: z
                      .record(
                        z.string().describe('经历id'),
                        z
                          .object({
                            日期说明: z.string().nullable().prefault(null),
                            日期精度: z.enum(['日', '月', '年', '未知']).prefault('未知'),
                            经历: z.string().nullable().prefault(null),
                            来源事件id: z.array(z.string()).prefault([]),
                            来源存档id: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                    最近经历: z
                      .record(
                        z.string().describe('经历id'),
                        z
                          .object({
                            日期说明: z.string().nullable().prefault(null),
                            日期精度: z.enum(['日', '月', '年', '未知']).prefault('未知'),
                            经历: z.string().nullable().prefault(null),
                            来源事件id: z.array(z.string()).prefault([]),
                            来源存档id: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                    生活摘要: z
                      .record(
                        z.string().describe('摘要id'),
                        z
                          .object({
                            起始日期说明: z.string().nullable().prefault(null),
                            结束日期说明: z.string().nullable().prefault(null),
                            经历: z.string().nullable().prefault(null),
                            覆盖记录id: z.array(z.string()).prefault([]),
                            重要事项id: z.array(z.string()).prefault([]),
                            来源存档id: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                    阶段概述: z
                      .record(
                        z.string().describe('摘要id'),
                        z
                          .object({
                            起始日期说明: z.string().nullable().prefault(null),
                            结束日期说明: z.string().nullable().prefault(null),
                            经历: z.string().nullable().prefault(null),
                            覆盖记录id: z.array(z.string()).prefault([]),
                            重要事项id: z.array(z.string()).prefault([]),
                            来源存档id: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                    _待归档经历: z
                      .record(
                        z.string().describe('经历id'),
                        z
                          .object({
                            日期说明: z.string().nullable().prefault(null),
                            日期精度: z.enum(['日', '月', '年', '未知']).prefault('未知'),
                            经历: z.string().nullable().prefault(null),
                            来源事件id: z.array(z.string()).prefault([]),
                            来源存档id: z.string().nullable().prefault(null),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                  })
                  .prefault({}),
                _更新循环: z
                  .object({
                    当前计数: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                    更新阈值: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().positive())
                      .prefault(5),
                    使用统一阈值: z.boolean().prefault(true),
                    上次更新变量时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    待处理任务id: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              }),
              z.object({
                层级: z.literal('次要'),
                外貌: z
                  .object({
                    身高: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().nonnegative())
                      .nullable()
                      .prefault(null),
                    体重: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().nonnegative())
                      .nullable()
                      .prefault(null),
                    整体体型: z.string().nullable().prefault(null),
                    详细外表: z.string().nullable().prefault(null),
                    今日穿搭: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
                性格: z.string().nullable().prefault(null),
                专属标识: z
                  .object({
                    身体印记: z.array(z.string()).prefault([]),
                    随身信物: z.array(z.string()).prefault([]),
                    感官特征: z.string().nullable().prefault(null),
                    破防弱点: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              }),
            ]),
          )
          .transform(data => {
            const legacySocial = data.生活.近期社交交集;
            if (Array.isArray(legacySocial))
              legacySocial.forEach((entry, index) => {
                if (!entry || typeof entry !== 'object') return;
                const content = [entry.与, entry.时间, entry.交集事项]
                  .filter(value => typeof value === 'string' && value.trim())
                  .join(' · ');
                if (content && !Object.values(data.重要记录).some(record => record.内容 === content)) {
                  let key = 'legacy_social_' + index;
                  while (data.重要记录[key]) key += '_';
                  data.重要记录[key] = { 内容: content, 事件id: null, 约定id: null };
                }
              });
            data.生活 = _.pick(data.生活, [
              '住处id',
              '工作地点id',
              '常去地点id',
              '日常活动',
              '联系方式',
              '目标',
              '约定',
            ] as const);

            if (data.层级 === '主要') {
              const applicable =
                data.性别 !== '男' &&
                data.性别 !== '男性' &&
                (data.性特征适用 === true ||
                  (data.性特征适用 !== false && (data.性别 === '女' || data.性别 === '女性')));
              if (!applicable) delete data.性特征;
              else
                data.性特征 ??= {
                  奶子信息: null,
                  蜜穴信息: null,
                  其他: null,
                  性经验: { 性次数: { 确数: null, 概数说明: null, 已知新增说明: null }, 性人群: null, 依据事件id: [] },
                };
              if (data.性别 === '男' || data.性别 === '男性') {
                if (data.外貌) {
                  delete (data.外貌 as Partial<typeof data.外貌>).三围信息;
                  delete (data.外貌 as Partial<typeof data.外貌>).罩杯;
                }
              }
            }
            return data;
          }),
      )
      .prefault({}),
    地点: z
      .record(
        z.string().describe('地点id'),
        z
          .object({
            名称: z.string().nullable().prefault(null),
            片区id: z.string().nullable().prefault(null),
            上级地点id: z.string().nullable().prefault(null),
            类型: z.string().nullable().prefault(null),
            简介: z.string().nullable().prefault(null),
            室内外: z.enum(['室内', '室外', '混合', '未知']).prefault('未知'),
            地图位置: z
              .object({
                x: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>())
                  .nullable()
                  .prefault(null),
                y: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>())
                  .nullable()
                  .prefault(null),
                精度: z.enum(['地点', '片区', '未知']).prefault('未知'),
              })
              .prefault({}),
            常规开放时间: z.string().nullable().prefault(null),
            进入条件: z.string().nullable().prefault(null),
            动态状态: z
              .record(
                z.string().describe('状态id'),
                z
                  .object({
                    说明: z.string().nullable().prefault(null),
                    生效时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    结束时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            关联人物: z.record(z.string().describe('人物id'), z.string().nullable().prefault(null)).prefault({}),
          })
          .prefault({}),
      )
      .prefault({}),
    约定: z
      .record(
        z.string().describe('约定id'),
        z
          .object({
            参与者: z
              .record(
                z.string().describe('人物id'),
                z
                  .object({
                    称呼: z.string().nullable().prefault(null),
                    响应: z.enum(['拟议', '待确认', '接受', '拒绝', '取消']).prefault('待确认'),
                    响应时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            内容: z.string().nullable().prefault(null),
            时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
            时间说明: z.string().nullable().prefault(null),
            地点id: z.string().nullable().prefault(null),
            状态: z.enum(['拟议', '待确认', '已确认', '完成', '取消', '未履行']).prefault('拟议'),
            履行依据事件id: z.array(z.string()).prefault([]),
          })
          .prefault({}),
      )
      .prefault({}),
    事件: z
      .record(
        z.string().describe('事件id'),
        z
          .object({
            起始时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
            结束时间: z
              .record(
                z.enum(['年', '月', '日', '时', '分']),
                z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
              )
              .refine(
                t =>
                  t.年 >= 1 &&
                  t.年 <= 9999 &&
                  t.月 >= 1 &&
                  t.月 <= 12 &&
                  t.日 >= 1 &&
                  t.时 >= 0 &&
                  t.时 <= 23 &&
                  t.分 >= 0 &&
                  t.分 <= 59 &&
                  t.日 <=
                    (t.月 === 2
                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                        ? 29
                        : 28
                      : [4, 6, 9, 11].includes(t.月)
                        ? 30
                        : 31),
                { message: '无效公历日期，不自动跳日' },
              )
              .nullable()
              .prefault(null),
            日期说明: z.string().nullable().prefault(null),
            参与者: z.record(z.string().describe('人物id'), z.string().nullable().prefault(null)).prefault({}),
            事实: z.string().nullable().prefault(null),
            各人可知来源: z
              .record(
                z.string().describe('人物id'),
                z
                  .object({
                    方式: z
                      .enum(['观察', '听说', '阅读', '被告知', '玩家填写', '授权生成', '导入', '事件', '未设定'])
                      .prefault('未设定'),
                    说明: z.string().nullable().prefault(null),
                    人物id: z.string().nullable().prefault(null),
                    记录id: z.string().nullable().prefault(null),
                    获得时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            关联记录id: z.array(z.string()).prefault([]),
            更正自事件id: z.string().nullable().prefault(null),
            _提交id: z.string().nullable().prefault(null),
          })
          .prefault({}),
      )
      .prefault({}),
    组织: z
      .record(
        z.string().describe('组织id'),
        z
          .object({
            名称: z.string().nullable().prefault(null),
            类型: z.string().nullable().prefault(null),
            简介: z.string().nullable().prefault(null),
            场所id: z.array(z.string()).prefault([]),
            已知成员: z
              .record(
                z.string().describe('人物id'),
                z
                  .object({
                    职务: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            活动日程id: z.array(z.string()).prefault([]),
            规则: z.string().nullable().prefault(null),
          })
          .prefault({}),
      )
      .prefault({}),
    手机: z
      .object({
        账号: z
          .record(
            z.string().describe('账号id'),
            z
              .object({
                人物id: z.string().nullable().prefault(null),
                平台: z.enum(['邻信', '微澜']).prefault('邻信'),
                账号名: z.string().nullable().prefault(null),
                昵称: z.string().nullable().prefault(null),
                头像资源: z.string().nullable().prefault(null),
                简介: z.string().nullable().prefault(null),
                公开资料: z
                  .record(z.string().describe('公开字段名'), z.string().nullable().prefault(null))
                  .prefault({}),
              })
              .prefault({}),
          )
          .prefault({}),
        联系人: z
          .record(
            z.string().describe('联系记录id'),
            z
              .object({
                本人账号id: z.string().nullable().prefault(null),
                对方账号id: z.string().nullable().prefault(null),
                备注: z.string().nullable().prefault(null),
                免打扰: z.boolean().prefault(false),
                // Accept the retired value only to migrate old saves; current authoring uses the two active states.
                状态: z
                  .preprocess(value => value === '拉黑' ? '正常' : value, z.enum(['正常', '移除']).prefault('正常'))
                  .meta({ type: 'string', enum: ['正常', '移除'] }),
                建立时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        申请: z
          .record(
            z.string().describe('申请id'),
            z
              .looseObject({
                发起账号id: z.string().nullable().prefault(null),
                目标账号id: z.string().nullable().prefault(null),
                说明: z.string().nullable().prefault(null),
                时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                状态: z.enum(['待处理', '接受', '拒绝', '撤销']).prefault('待处理'),
              })
              .transform(raw => {
                const { 来源, ...application } = raw;
                if (application.说明 === null && 来源 && typeof 来源 === 'object')
                  application.说明 =
                    typeof (来源 as { 说明?: unknown }).说明 === 'string' ? (来源 as { 说明: string }).说明 : null;
                return _.pick(application, ['发起账号id', '目标账号id', '说明', '时间', '状态'] as const);
              })
              .prefault({}),
          )
          .prefault({}),
        关注: z
          .record(
            z.string().describe('关注记录id'),
            z
              .object({
                关注者账号id: z.string().nullable().prefault(null),
                被关注账号id: z.string().nullable().prefault(null),
                建立时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        群: z
          .record(
            z.string().describe('群id'),
            z
              .object({
                名称: z.string().nullable().prefault(null),
                头像资源: z.string().nullable().prefault(null),
                创建者账号id: z.string().nullable().prefault(null),
                公告: z.string().nullable().prefault(null),
                成员: z
                  .record(
                    z.string().describe('账号id'),
                    z
                      .object({
                        群昵称: z.string().nullable().prefault(null),
                        成员区间: z
                          .record(
                            z.string().describe('区间id'),
                            z
                              .object({
                                加入时间: z
                                  .record(
                                    z.enum(['年', '月', '日', '时', '分']),
                                    z
                                      .union([z.number(), z.string().trim().min(1)])
                                      .pipe(z.coerce.number<string | number>().int()),
                                  )
                                  .refine(
                                    t =>
                                      t.年 >= 1 &&
                                      t.年 <= 9999 &&
                                      t.月 >= 1 &&
                                      t.月 <= 12 &&
                                      t.日 >= 1 &&
                                      t.时 >= 0 &&
                                      t.时 <= 23 &&
                                      t.分 >= 0 &&
                                      t.分 <= 59 &&
                                      t.日 <=
                                        (t.月 === 2
                                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                            ? 29
                                            : 28
                                          : [4, 6, 9, 11].includes(t.月)
                                            ? 30
                                            : 31),
                                    { message: '无效公历日期，不自动跳日' },
                                  )
                                  .nullable()
                                  .prefault(null),
                                离开时间: z
                                  .record(
                                    z.enum(['年', '月', '日', '时', '分']),
                                    z
                                      .union([z.number(), z.string().trim().min(1)])
                                      .pipe(z.coerce.number<string | number>().int()),
                                  )
                                  .refine(
                                    t =>
                                      t.年 >= 1 &&
                                      t.年 <= 9999 &&
                                      t.月 >= 1 &&
                                      t.月 <= 12 &&
                                      t.日 >= 1 &&
                                      t.时 >= 0 &&
                                      t.时 <= 23 &&
                                      t.分 >= 0 &&
                                      t.分 <= 59 &&
                                      t.日 <=
                                        (t.月 === 2
                                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                            ? 29
                                            : 28
                                          : [4, 6, 9, 11].includes(t.月)
                                            ? 30
                                            : 31),
                                    { message: '无效公历日期，不自动跳日' },
                                  )
                                  .nullable()
                                  .prefault(null),
                              })
                              .prefault({}),
                          )
                          .prefault({}),
                      })
                      .prefault({}),
                  )
                  .prefault({}),
              })
              .prefault({}),
          )
          .prefault({}),
        会话: z
          .record(
            z.string().describe('会话id'),
            z
              .object({
                类型: z.enum(['私聊', '群聊']).prefault('私聊'),
                参与账号id: z.array(z.string()).prefault([]),
                群id: z.string().nullable().prefault(null),
                _窗口: z
                  .object({
                    _近期id: z.array(z.string()).prefault([]),
                    _细摘要id: z.array(z.string()).prefault([]),
                    _阶段概述id: z.array(z.string()).prefault([]),
                    _已归档覆盖id: z.array(z.string()).prefault([]),
                  })
                  .prefault({}),
                重要事项id: z.array(z.string()).prefault([]),
              })
              .prefault({}),
          )
          .prefault({}),
        原文: z
          .object({
            消息: z
              .record(
                z.string().describe('消息id'),
                z
                  .object({
                    会话id: z.string().nullable().prefault(null),
                    发送账号id: z.string().nullable().prefault(null),
                    发送者称呼: z.string().nullable().prefault(null),
                    故事时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    _顺序: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                    内容块: z
                      .array(
                        z.discriminatedUnion('类型', [
                          z.object({
                            类型: z.literal('文字'),
                            id: z.string(),
                            正文: z.string(),
                          }),
                          z.object({
                            类型: z.literal('图片'),
                            id: z.string(),
                            图片描述: z.string(),
                            拍摄时间: z
                              .record(
                                z.enum(['年', '月', '日', '时', '分']),
                                z
                                  .union([z.number(), z.string().trim().min(1)])
                                  .pipe(z.coerce.number<string | number>().int()),
                              )
                              .refine(
                                t =>
                                  t.年 >= 1 &&
                                  t.年 <= 9999 &&
                                  t.月 >= 1 &&
                                  t.月 <= 12 &&
                                  t.日 >= 1 &&
                                  t.时 >= 0 &&
                                  t.时 <= 23 &&
                                  t.分 >= 0 &&
                                  t.分 <= 59 &&
                                  t.日 <=
                                    (t.月 === 2
                                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                        ? 29
                                        : 28
                                      : [4, 6, 9, 11].includes(t.月)
                                        ? 30
                                        : 31),
                                { message: '无效公历日期，不自动跳日' },
                              )
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('语音'),
                            id: z.string(),
                            转写文字: z.string(),
                            语气描述: z.string().nullable().prefault(null),
                            模拟时长秒: z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().nonnegative())
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('表情'),
                            id: z.string(),
                            表情内容: z.string(),
                          }),
                          z.object({
                            类型: z.literal('视频'),
                            id: z.string(),
                            画面过程描述: z.string(),
                            字幕或声音描述: z.string().nullable().prefault(null),
                            模拟时长秒: z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().nonnegative())
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('位置'),
                            id: z.string(),
                            地点id: z.string(),
                            显示名称: z.string().nullable().prefault(null),
                            附言: z.string().nullable().prefault(null),
                          }),
                          z.object({
                            类型: z.literal('名片'),
                            id: z.string(),
                            账号id: z.string(),
                            附言: z.string().nullable().prefault(null),
                          }),
                          z.object({
                            类型: z.literal('分享'),
                            id: z.string(),
                            目标类型: z.enum(['帖子', '消息', '地点']).prefault('帖子'),
                            目标id: z.string(),
                            附言: z.string().nullable().prefault(null),
                          }),
                        ]),
                      )
                      .prefault([]),
                    回复目标消息id: z.string().nullable().prefault(null),
                    撤回时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    _已投递账号id: z.array(z.string()).prefault([]),
                    _发送状态: z.enum(['待投递', '已投递', '失败']).prefault('待投递'),
                  })
                  .prefault({}),
              )
              .prefault({}),
            帖子: z
              .record(
                z.string().describe('帖子id'),
                z
                  .object({
                    平台: z.enum(['朋友圈', '微澜']).prefault('朋友圈'),
                    发布账号id: z.string().nullable().prefault(null),
                    发布者称呼: z.string().nullable().prefault(null),
                    故事时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    _顺序: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                    内容块: z
                      .array(
                        z.discriminatedUnion('类型', [
                          z.object({
                            类型: z.literal('文字'),
                            id: z.string(),
                            正文: z.string(),
                          }),
                          z.object({
                            类型: z.literal('图片'),
                            id: z.string(),
                            图片描述: z.string(),
                            拍摄时间: z
                              .record(
                                z.enum(['年', '月', '日', '时', '分']),
                                z
                                  .union([z.number(), z.string().trim().min(1)])
                                  .pipe(z.coerce.number<string | number>().int()),
                              )
                              .refine(
                                t =>
                                  t.年 >= 1 &&
                                  t.年 <= 9999 &&
                                  t.月 >= 1 &&
                                  t.月 <= 12 &&
                                  t.日 >= 1 &&
                                  t.时 >= 0 &&
                                  t.时 <= 23 &&
                                  t.分 >= 0 &&
                                  t.分 <= 59 &&
                                  t.日 <=
                                    (t.月 === 2
                                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                        ? 29
                                        : 28
                                      : [4, 6, 9, 11].includes(t.月)
                                        ? 30
                                        : 31),
                                { message: '无效公历日期，不自动跳日' },
                              )
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('语音'),
                            id: z.string(),
                            转写文字: z.string(),
                            语气描述: z.string().nullable().prefault(null),
                            模拟时长秒: z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().nonnegative())
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('表情'),
                            id: z.string(),
                            表情内容: z.string(),
                          }),
                          z.object({
                            类型: z.literal('视频'),
                            id: z.string(),
                            画面过程描述: z.string(),
                            字幕或声音描述: z.string().nullable().prefault(null),
                            模拟时长秒: z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().nonnegative())
                              .nullable()
                              .prefault(null),
                          }),
                          z.object({
                            类型: z.literal('位置'),
                            id: z.string(),
                            地点id: z.string(),
                            显示名称: z.string().nullable().prefault(null),
                            附言: z.string().nullable().prefault(null),
                          }),
                          z.object({
                            类型: z.literal('名片'),
                            id: z.string(),
                            账号id: z.string(),
                            附言: z.string().nullable().prefault(null),
                          }),
                          z.object({
                            类型: z.literal('分享'),
                            id: z.string(),
                            目标类型: z.enum(['帖子', '消息', '地点']).prefault('帖子'),
                            目标id: z.string(),
                            附言: z.string().nullable().prefault(null),
                          }),
                        ]),
                      )
                      .prefault([]),
                    地点id: z.string().nullable().prefault(null),
                    话题: z.array(z.string()).prefault([]),
                    编辑版本: z
                      .record(
                        z.string().describe('版本id'),
                        z
                          .object({
                            时间: z
                              .record(
                                z.enum(['年', '月', '日', '时', '分']),
                                z
                                  .union([z.number(), z.string().trim().min(1)])
                                  .pipe(z.coerce.number<string | number>().int()),
                              )
                              .refine(
                                t =>
                                  t.年 >= 1 &&
                                  t.年 <= 9999 &&
                                  t.月 >= 1 &&
                                  t.月 <= 12 &&
                                  t.日 >= 1 &&
                                  t.时 >= 0 &&
                                  t.时 <= 23 &&
                                  t.分 >= 0 &&
                                  t.分 <= 59 &&
                                  t.日 <=
                                    (t.月 === 2
                                      ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                        ? 29
                                        : 28
                                      : [4, 6, 9, 11].includes(t.月)
                                        ? 30
                                        : 31),
                                { message: '无效公历日期，不自动跳日' },
                              )
                              .nullable()
                              .prefault(null),
                            内容块: z
                              .array(
                                z.discriminatedUnion('类型', [
                                  z.object({
                                    类型: z.literal('文字'),
                                    id: z.string(),
                                    正文: z.string(),
                                  }),
                                  z.object({
                                    类型: z.literal('图片'),
                                    id: z.string(),
                                    图片描述: z.string(),
                                    拍摄时间: z
                                      .record(
                                        z.enum(['年', '月', '日', '时', '分']),
                                        z
                                          .union([z.number(), z.string().trim().min(1)])
                                          .pipe(z.coerce.number<string | number>().int()),
                                      )
                                      .refine(
                                        t =>
                                          t.年 >= 1 &&
                                          t.年 <= 9999 &&
                                          t.月 >= 1 &&
                                          t.月 <= 12 &&
                                          t.日 >= 1 &&
                                          t.时 >= 0 &&
                                          t.时 <= 23 &&
                                          t.分 >= 0 &&
                                          t.分 <= 59 &&
                                          t.日 <=
                                            (t.月 === 2
                                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                                ? 29
                                                : 28
                                              : [4, 6, 9, 11].includes(t.月)
                                                ? 30
                                                : 31),
                                        { message: '无效公历日期，不自动跳日' },
                                      )
                                      .nullable()
                                      .prefault(null),
                                  }),
                                  z.object({
                                    类型: z.literal('语音'),
                                    id: z.string(),
                                    转写文字: z.string(),
                                    语气描述: z.string().nullable().prefault(null),
                                    模拟时长秒: z
                                      .union([z.number(), z.string().trim().min(1)])
                                      .pipe(z.coerce.number<string | number>().nonnegative())
                                      .nullable()
                                      .prefault(null),
                                  }),
                                  z.object({
                                    类型: z.literal('表情'),
                                    id: z.string(),
                                    表情内容: z.string(),
                                  }),
                                  z.object({
                                    类型: z.literal('视频'),
                                    id: z.string(),
                                    画面过程描述: z.string(),
                                    字幕或声音描述: z.string().nullable().prefault(null),
                                    模拟时长秒: z
                                      .union([z.number(), z.string().trim().min(1)])
                                      .pipe(z.coerce.number<string | number>().nonnegative())
                                      .nullable()
                                      .prefault(null),
                                  }),
                                  z.object({
                                    类型: z.literal('位置'),
                                    id: z.string(),
                                    地点id: z.string(),
                                    显示名称: z.string().nullable().prefault(null),
                                    附言: z.string().nullable().prefault(null),
                                  }),
                                  z.object({
                                    类型: z.literal('名片'),
                                    id: z.string(),
                                    账号id: z.string(),
                                    附言: z.string().nullable().prefault(null),
                                  }),
                                  z.object({
                                    类型: z.literal('分享'),
                                    id: z.string(),
                                    目标类型: z.enum(['帖子', '消息', '地点']).prefault('帖子'),
                                    目标id: z.string(),
                                    附言: z.string().nullable().prefault(null),
                                  }),
                                ]),
                              )
                              .prefault([]),
                          })
                          .prefault({}),
                      )
                      .prefault({}),
                    编辑时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    删除时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            评论: z
              .record(
                z.string().describe('评论id'),
                z
                  .object({
                    帖子id: z.string().nullable().prefault(null),
                    评论账号id: z.string().nullable().prefault(null),
                    评论者称呼: z.string().nullable().prefault(null),
                    故事时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    _顺序: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                    内容块: z
                      .array(
                        z.discriminatedUnion('类型', [
                          z.object({
                            类型: z.literal('文字'),
                            id: z.string(),
                            正文: z.string(),
                          }),
                          z.object({
                            类型: z.literal('表情'),
                            id: z.string(),
                            表情内容: z.string(),
                          }),
                        ]),
                      )
                      .prefault([]),
                    回复目标评论id: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            点赞: z
              .record(
                z.string().describe('点赞id'),
                z
                  .object({
                    账号id: z.string().nullable().prefault(null),
                    内容id: z.string().nullable().prefault(null),
                    时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
            转发: z
              .record(
                z.string().describe('转发id'),
                z
                  .object({
                    账号id: z.string().nullable().prefault(null),
                    原帖id: z.string().nullable().prefault(null),
                    新帖id: z.string().nullable().prefault(null),
                    时间: z
                      .record(
                        z.enum(['年', '月', '日', '时', '分']),
                        z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                      )
                      .refine(
                        t =>
                          t.年 >= 1 &&
                          t.年 <= 9999 &&
                          t.月 >= 1 &&
                          t.月 <= 12 &&
                          t.日 >= 1 &&
                          t.时 >= 0 &&
                          t.时 <= 23 &&
                          t.分 >= 0 &&
                          t.分 <= 59 &&
                          t.日 <=
                            (t.月 === 2
                              ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                ? 29
                                : 28
                              : [4, 6, 9, 11].includes(t.月)
                                ? 30
                                : 31),
                        { message: '无效公历日期，不自动跳日' },
                      )
                      .nullable()
                      .prefault(null),
                    附言: z.string().nullable().prefault(null),
                  })
                  .prefault({}),
              )
              .prefault({}),
          })
          .prefault({}),
        _动态流: z
          .record(
            z.enum(['朋友圈', '微澜']),
            z
              .object({
                _近期id: z.array(z.string()).prefault([]),
                _细摘要id: z.array(z.string()).prefault([]),
                _阶段概述id: z.array(z.string()).prefault([]),
                _已归档覆盖id: z.array(z.string()).prefault([]),
              })
              .prefault({}),
          )
          .prefault({ 朋友圈: {}, 微澜: {} }),
        _归档批次: z
          .record(
            z.string().describe('归档批次id'),
            z
              .object({
                来源类型: z.string().nullable().prefault(null),
                来源id: z.string().nullable().prefault(null),
                覆盖消息id: z.array(z.string()).prefault([]),
                覆盖帖子id: z.array(z.string()).prefault([]),
                覆盖互动id: z.array(z.string()).prefault([]),
                摘要id: z.string().nullable().prefault(null),
                起始时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                结束时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                提交id: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        摘要: z
          .record(
            z.string().describe('摘要id'),
            z
              .object({
                来源类型: z.string().nullable().prefault(null),
                来源id: z.string().nullable().prefault(null),
                层级: z.enum(['细摘要', '阶段概述']).prefault('细摘要'),
                起始时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                结束时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                内容: z.string().nullable().prefault(null),
                覆盖记录id: z.array(z.string()).prefault([]),
                重要事项id: z.array(z.string()).prefault([]),
              })
              .prefault({}),
          )
          .prefault({}),
        _通知: z
          .record(
            z.string().describe('通知id'),
            z
              .object({
                类型: z.string().nullable().prefault(null),
                来源id: z.string().nullable().prefault(null),
                内容id: z.array(z.string()).prefault([]),
                时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                已读: z.boolean().prefault(false),
                免打扰: z.boolean().prefault(false),
              })
              .prefault({}),
          )
          .prefault({}),
        _阅读进度: z
          .record(
            z.string().describe('阅读者账号id'),
            z
              .record(
                z.string().describe('会话或内容流id'),
                z
                  .object({
                    已读内容id: z.array(z.string()).prefault([]),
                    最后阅读消息id: z.string().nullable().prefault(null),
                    最后阅读顺序: z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                  })
                  .prefault({}),
              )
              .prefault({}),
          )
          .prefault({}),
        _待回应: z
          .record(
            z.string().describe('待回应id'),
            z
              .object({
                会话id: z.string().nullable().prefault(null),
                预期回应账号id: z.string().nullable().prefault(null),
                涉及消息id: z.array(z.string()).prefault([]),
                开始等待时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                问题摘要: z.string().nullable().prefault(null),
                状态: z.enum(['等待', '部分回应', '已回应', '取消']).prefault('等待'),
                已覆盖消息id: z.array(z.string()).prefault([]),
              })
              .prefault({}),
          )
          .prefault({}),
        _后台检查位置: z
          .record(
            z.string().describe('会话或内容流id'),
            z
              .object({
                最后检查事件id: z.string().nullable().prefault(null),
                故事时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        _接收侧记录: z
          .record(
            z.string().describe('投递记录id'),
            z
              .object({
                接收账号id: z.string().nullable().prefault(null),
                原内容id: z.string().nullable().prefault(null),
                来源类型: z.string().nullable().prefault(null),
                投递时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                已交付内容: z
                  .array(
                    z.discriminatedUnion('类型', [
                      z.object({
                        类型: z.literal('文字'),
                        id: z.string(),
                        正文: z.string(),
                      }),
                      z.object({
                        类型: z.literal('图片'),
                        id: z.string(),
                        图片描述: z.string(),
                        拍摄时间: z
                          .record(
                            z.enum(['年', '月', '日', '时', '分']),
                            z
                              .union([z.number(), z.string().trim().min(1)])
                              .pipe(z.coerce.number<string | number>().int()),
                          )
                          .refine(
                            t =>
                              t.年 >= 1 &&
                              t.年 <= 9999 &&
                              t.月 >= 1 &&
                              t.月 <= 12 &&
                              t.日 >= 1 &&
                              t.时 >= 0 &&
                              t.时 <= 23 &&
                              t.分 >= 0 &&
                              t.分 <= 59 &&
                              t.日 <=
                                (t.月 === 2
                                  ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                                    ? 29
                                    : 28
                                  : [4, 6, 9, 11].includes(t.月)
                                    ? 30
                                    : 31),
                            { message: '无效公历日期，不自动跳日' },
                          )
                          .nullable()
                          .prefault(null),
                      }),
                      z.object({
                        类型: z.literal('语音'),
                        id: z.string(),
                        转写文字: z.string(),
                        语气描述: z.string().nullable().prefault(null),
                        模拟时长秒: z
                          .union([z.number(), z.string().trim().min(1)])
                          .pipe(z.coerce.number<string | number>().nonnegative())
                          .nullable()
                          .prefault(null),
                      }),
                      z.object({
                        类型: z.literal('表情'),
                        id: z.string(),
                        表情内容: z.string(),
                      }),
                      z.object({
                        类型: z.literal('视频'),
                        id: z.string(),
                        画面过程描述: z.string(),
                        字幕或声音描述: z.string().nullable().prefault(null),
                        模拟时长秒: z
                          .union([z.number(), z.string().trim().min(1)])
                          .pipe(z.coerce.number<string | number>().nonnegative())
                          .nullable()
                          .prefault(null),
                      }),
                      z.object({
                        类型: z.literal('位置'),
                        id: z.string(),
                        地点id: z.string(),
                        显示名称: z.string().nullable().prefault(null),
                        附言: z.string().nullable().prefault(null),
                      }),
                      z.object({
                        类型: z.literal('名片'),
                        id: z.string(),
                        账号id: z.string(),
                        附言: z.string().nullable().prefault(null),
                      }),
                      z.object({
                        类型: z.literal('分享'),
                        id: z.string(),
                        目标类型: z.enum(['帖子', '消息', '地点']).prefault('帖子'),
                        目标id: z.string(),
                        附言: z.string().nullable().prefault(null),
                      }),
                    ]),
                  )
                  .prefault([]),
                当时发送者称呼: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        _地图收藏: z.array(z.string()).prefault([]),
      })
      .prefault({}),
    奇遇系统: z
      .object({
        _启用: z.boolean().prefault(false),
        _系统币: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
          .prefault(0),
        _刷新日期: z.string().nullable().prefault(null),
        _任务记录: z
          .record(
            z.string().describe('任务id'),
            z
              .object({
                状态: z.enum(['进行中', '已领取', '已放弃']).prefault('进行中'),
                定义快照: z.string().prefault(''),
                接取时事件摘要: z.record(z.string().describe('事件id'), z.string()).prefault({}),
                // Legacy metadata is preserved when present, but new tasks need no unused location snapshot.
                接取地点id: z.string().nullable().optional(),
              })
              .prefault({}),
          )
          .prefault({}),
        _商店已购: z
          .record(
            z.string().describe('商品id'),
            z
              .union([z.number(), z.string().trim().min(1)])
              .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
          )
          .prefault({}),
        _商店商品: z
          .record(
            z.string().describe('商品id'),
            z.object({
              名称: z.string().trim().min(1),
              价格: z
                .union([z.number(), z.string().trim().min(1)])
                .pipe(z.coerce.number<string | number>().int().positive().max(Number.MAX_SAFE_INTEGER)),
              类别: z.string().trim().min(1),
              描述: z.string().trim().min(1),
              稀有: z.boolean().prefault(false),
              限购: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
            }),
          )
          .prefault({}),
        _流水: z
          .record(
            z.string().describe('结算id'),
            z
              .object({
                类型: z.enum(['启用赠礼', '任务奖励', '商店购买']).prefault('任务奖励'),
                数额: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(
                    z.coerce.number<string | number>().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
                  )
                  .prefault(0),
                说明: z.string().prefault(''),
                关联id: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
        任务: z
          .record(
            z.string().describe('任务id'),
            z
              .looseObject({
                名称: z.string().prefault(''),
                类型: z.enum(['日常', '探索', '社交', '成长', '奇遇']).prefault('探索'),
                难度: z.enum(['基础', '进阶', '稀有']).prefault('基础'),
                目标: z.string().prefault(''),
                有效日: z.string().nullable().prefault(null),
                进度: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>())
                  .transform(value => _.clamp(Math.round(value), 0, 100))
                  .prefault(0),
                进展说明: z.string().nullable().prefault(null),
                完成依据事件id: z.array(z.string()).prefault([]),
              })
              .transform(raw => {
                const { 说明, ...task } = raw;
                if (typeof 说明 === 'string' && 说明.trim() && !task.目标.includes(说明.trim()))
                  task.目标 = [task.目标, 说明.trim()].filter(Boolean).join('；');
                return _.pick(task, [
                  '名称',
                  '类型',
                  '难度',
                  '目标',
                  '有效日',
                  '进度',
                  '进展说明',
                  '完成依据事件id',
                ] as const);
              })
              .prefault({}),
          )
          .prefault({}),
      })
      .prefault({}),
    _系统: z
      .object({
        格式版本: z.literal('1.0.0').prefault('1.0.0'),
        建档完成: z.boolean().prefault(false),
        存档id: z.string().nullable().prefault(null),
        分支id: z.string().nullable().prefault(null),
        楼层id: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().nonnegative())
          .nullable()
          .prefault(null),
        候选回复id: z.string().nullable().prefault(null),
        数据版本: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().nonnegative())
          .prefault(0),
        稳定序号: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().nonnegative())
          .prefault(0),
        活动写入者id: z.string().nullable().prefault(null),
        默认更新阈值: z
          .union([z.number(), z.string().trim().min(1)])
          .pipe(z.coerce.number<string | number>().int().positive())
          .prefault(5),
        生成密度: z.enum(['少量', '标准', '丰富']).prefault('标准'),
        任务: z
          .record(
            z.string().describe('任务id'),
            z
              .object({
                类别: z
                  .enum([
                    '正文',
                    '私聊',
                    '群聊',
                    '刷新',
                    '生活更新',
                    '升格',
                    '自然融入',
                    '摘要',
                    '导入',
                    '删除',
                    '建档',
                  ])
                  .prefault('正文'),
                触发来源: z.string().nullable().prefault(null),
                目标id: z.array(z.string()).prefault([]),
                目标版本: z
                  .record(
                    z.string().describe('人物id'),
                    z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                  )
                  .prefault({}),
                存档id: z.string().nullable().prefault(null),
                分支id: z.string().nullable().prefault(null),
                楼层id: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().int().nonnegative())
                  .nullable()
                  .prefault(null),
                候选回复id: z.string().nullable().prefault(null),
                输入数据版本: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().int().nonnegative())
                  .prefault(0),
                计数截止点: z
                  .record(
                    z.string().describe('人物id'),
                    z
                      .union([z.number(), z.string().trim().min(1)])
                      .pipe(z.coerce.number<string | number>().int().nonnegative())
                      .prefault(0),
                  )
                  .prefault({}),
                起始时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                截止时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                覆盖记录id: z.array(z.string()).prefault([]),
                状态: z.enum(['排队', '生成中', '待校验', '待提交', '已提交', '失败', '取消', '失效']).prefault('排队'),
                候选结果JSON: z.string().nullable().prefault(null),
                错误: z.string().nullable().prefault(null),
                重试次数: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().int().nonnegative())
                  .prefault(0),
                提交id: z.string().nullable().prefault(null),
                持久保存已确认: z.boolean().prefault(false),
              })
              .prefault({}),
          )
          .prefault({}),
        提交记录: z
          .record(
            z.string().describe('提交id'),
            z
              .object({
                任务id: z.string().nullable().prefault(null),
                事件id: z.array(z.string()).prefault([]),
                数据版本: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().int().nonnegative())
                  .prefault(0),
                状态: z.enum(['待确认', '已写入', '已持久保存']).prefault('待确认'),
                恢复候选JSON: z.string().nullable().prefault(null),
                变更JSON: z.string().optional(),
              })
              .prefault({}),
          )
          .prefault({}),
        资料加载: z.object({
          地点: z.array(z.string()).prefault([]),
          组织: z.array(z.string()).prefault([]),
          地点覆盖: z.record(z.string(), z.enum(['展开', '仅名称'])).prefault({}),
          组织覆盖: z.record(z.string(), z.enum(['展开', '仅名称'])).prefault({}),
          轮候: z.object({
            地点: z.array(z.string()).prefault([]),
            组织: z.array(z.string()).prefault([]),
          }).prefault({}),
          选择依据: z.string().nullable().prefault(null),
          资料版本: z.string().nullable().prefault(null),
        }).prefault({}),
        角色库版本: z.string().nullable().prefault(null),
        角色停用标识: z
          .record(
            z.string().describe('人物id'),
            z
              .object({
                姓名: z.string().nullable().prefault(null),
                版本: z
                  .union([z.number(), z.string().trim().min(1)])
                  .pipe(z.coerce.number<string | number>().int().nonnegative())
                  .prefault(0),
              })
              .prefault({}),
          )
          .prefault({}),
        来源档案: z
          .record(
            z.string().describe('来源档案id'),
            z
              .object({
                人物id: z.string().nullable().prefault(null),
                格式版本: z.string().nullable().prefault(null),
                来源存档id: z.string().nullable().prefault(null),
                导出故事时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                原时间锚点: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                原始快照JSON: z.string().nullable().prefault(null),
                当前融入状态: z.enum(['待融入', '已融入', '失败']).prefault('待融入'),
                资源清单: z
                  .record(
                    z.string().describe('资源id'),
                    z
                      .object({
                        位置: z.string().nullable().prefault(null),
                        已内嵌: z.boolean().prefault(false),
                        缺失: z.boolean().prefault(false),
                      })
                      .prefault({}),
                  )
                  .prefault({}),
              })
              .prefault({}),
          )
          .prefault({}),
        已计轮事件: z
          .record(
            z.string().describe('事件id'),
            z
              .object({
                提交id: z.string().nullable().prefault(null),
                角色id: z.array(z.string()).prefault([]),
              })
              .prefault({}),
          )
          .prefault({}),
        管理更正记录: z
          .record(
            z.string().describe('更正id'),
            z
              .object({
                对象id: z.string().nullable().prefault(null),
                时间: z
                  .record(
                    z.enum(['年', '月', '日', '时', '分']),
                    z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number<string | number>().int()),
                  )
                  .refine(
                    t =>
                      t.年 >= 1 &&
                      t.年 <= 9999 &&
                      t.月 >= 1 &&
                      t.月 <= 12 &&
                      t.日 >= 1 &&
                      t.时 >= 0 &&
                      t.时 <= 23 &&
                      t.分 >= 0 &&
                      t.分 <= 59 &&
                      t.日 <=
                        (t.月 === 2
                          ? t.年 % 400 === 0 || (t.年 % 4 === 0 && t.年 % 100 !== 0)
                            ? 29
                            : 28
                          : [4, 6, 9, 11].includes(t.月)
                            ? 30
                            : 31),
                    { message: '无效公历日期，不自动跳日' },
                  )
                  .nullable()
                  .prefault(null),
                内容: z.string().nullable().prefault(null),
                来源事件id: z.string().nullable().prefault(null),
              })
              .prefault({}),
          )
          .prefault({}),
      })
      .prefault({}),
  })
  .overwrite(data => {
    for (const item of Object.values(data.玩家.物品栏)) {
      if (data.玩家.id && item.所有者id === data.玩家.id) delete item.所有者id;
      if (data.玩家.id && item.持有人id === data.玩家.id) {
        delete item.持有人id;
        delete item.存放地点id;
      }
    }
    for (const person of Object.values(data.角色))
      for (const [id, relation] of Object.entries(person.关系网))
        if ((id === data.玩家.id && data.玩家.姓名) || data.角色[id]?.姓名) delete relation.姓名;
    for (const record of Object.values(data.奇遇系统._任务记录)) {
      // 新快照无需再次 JSON 解析；仅升级仍携带旧说明字段的记录。
      if (!/"说明"\s*:/.test(record.定义快照)) continue;
      try {
        const old = JSON.parse(record.定义快照);
        if (Object.hasOwn(old, '说明')) {
          if (typeof old.说明 === 'string' && old.说明.trim() && !String(old.目标 ?? '').includes(old.说明.trim()))
            old.目标 = [old.目标, old.说明.trim()].filter(Boolean).join('；');
          delete old.说明;
          record.定义快照 = JSON.stringify(old);
        }
      } catch {
        /* 空或既有损坏快照交由原有校验处理。 */
      }
    }
    return data;
  });
