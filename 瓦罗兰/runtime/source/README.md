# 瓦罗兰运行源码

本目录的 source.tar.gz 包含本次运行产物对应的可编辑源码、类型定义、依赖锁定文件、pnpm 工作区配置、构建脚本及许可证。source-manifest.json 记录各源文件的 SHA-256。

## 构建

使用已验证的 pnpm 11.6.0，解压后在根目录执行 pnpm install --frozen-lockfile，然后执行以下命令。Node.js 应支持 TypeScript 类型擦除及 fs.globSync，与当前构建环境相同的版本为 v24.16.0。构建前按 source-manifest.json 的 externalAssets，从各条目的 url 下载独立地图，放到 path 指定的相对路径，并核对 SHA-256。

```powershell
node src/瓦罗兰/工具/构建.mjs --release --output=src/瓦罗兰/发布/重建/dist/瓦罗兰 --catalog-url=https://raw.githubusercontent.com/kuozhou1-stack/sillytavern/aa900a46ccef2f4ecdc9ad2efb353114ea93ffc2/%E7%93%A6%E7%BD%97%E5%85%B0/runtime/%E8%A7%92%E8%89%B2%E8%B5%84%E6%BA%90/index.json
```

## 来源与许可

- 原项目许可证保留在根目录 LICENSE。
- 卡内世界书扫描和预设组装移植自 SillyTavern 1.18.0，固定提交 51ad27fb86d39a3daca3adaa970375c9670c12df。来源地址 https://github.com/SillyTavern/SillyTavern/tree/51ad27fb86d39a3daca3adaa970375c9670c12df 。上游 AGPL 许可证保留在 src/瓦罗兰/运行/generation/SILLYTAVERN-LICENSE.txt，修改范围见对应源文件头。
- 发送适配参考 Tavern Helper 固定提交 b1566767a111348aaa007e0044e786835330f884。来源地址 https://github.com/N0VI028/JS-Slash-Runner/tree/b1566767a111348aaa007e0044e786835330f884 。PolyForm Noncommercial 1.0.0 文本保留在 src/瓦罗兰/运行/generation/TAVERN-HELPER-LICENSE.txt。
- 其余复用声明、版权注释和依赖版本随对应源文件及 pnpm-lock.yaml 保留。运行/地图资源.json 列出世界总图及各地区图幅。源码包和独立地图文件沿用相同的相对路径。

## 请求事件合同

卡内发送使用请求自己的参数，经原生 ChatCompletionService 发送。它跳过共享 CHAT_COMPLETION_SETTINGS_READY 事件，因此依赖该事件修改出站参数的扩展需要另行适配。正文/推理流式事件继续携带 generation_id。卡内完成以本次调用返回为准，停止绑定本卡请求，不广播会清理其他助手请求的公共结束事件。ST-Prompt-Template 1.17.9 的公开求值接口适用于关闭沙盒的出站模板，每次卡内求值有独立数字 runID。沙盒开启时，普通文本照常发送；仍待展开的模板会在模型请求前提示当前接口限制。st-chatu8 3.2.1 的普通自动插图窗口依赖公共结束事件。本卡正文中生成的插图按钮可手动使用；本卡不会主动打开该窗口。
