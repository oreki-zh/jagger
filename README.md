# Animation Display

中国财富出版社 Logo 动效选集，共两辑十八种动画。全部动画均使用最新的 `high-resolution-reference.svg`（3551 × 427），统一输出 1080 × 320、4.5 秒、60 fps 视频母版。旧 `svg_version.svg` 保留作历史素材。

[打开动画展示网站](https://jagger-eight.vercel.app/)

**VOL. 01 经典选集**：卷曲展开、书页翻转、逐字跃入、圆心扩展、切片汇聚、印迹显影、像素聚合、对开揭幕、景深聚焦。

**VOL. 02 Claude Opus 5.5 选集**（编号 10–18，由 Claude Opus 5.5 设计并编写渲染代码，见 `scripts/opus_styles.py`）：光束扫描、波浪浮现、印章落定、逐字打印、粒子凝聚、百叶开合、水墨晕染、红线托起、立体旋入。

## 本地预览

```sh
npm start
```

打开 http://localhost:4173。网站无需安装前端依赖，也无需构建。

## 目录与 GitHub 部署

- `site/`：完整静态网站，含 HTML、CSS、JavaScript 和全部可下载素材。
- `site/manifest.json`：动画名称、媒体路径和真实文件大小。
- `site/manifest.js`：相同数据供页面直接加载，支持普通静态托管。
- `site/media/`：十八套 MP4、50 fps GIF、预览图和全部素材 ZIP；保留旧兼容 GIF 地址供已有链接使用。
- `scripts/render_collection.py`：使用 Anthropic `slack-gif-creator` 的帧合成、缓动与调色板功能渲染动画。
- `scripts/opus_styles.py`：第二辑九种动画的渲染函数，与第一辑共用画布、源图与时间轴。
- `output/`：本地此前的试作版本（不提交到仓库）；展示页仅使用 `site/media/`。

仓库：[oreki-zh/jagger](https://github.com/oreki-zh/jagger)。`.github/workflows/pages.yml` 通过 GitHub Actions 将 `site/` 目录发布到 GitHub Pages；推送到 `main` 的网站变更会触发部署。也可直接把 `site/` 作为任意静态托管的发布目录。所有页面资源均为相对路径，适用于仓库子路径。

Vercel 导入仓库时使用仓库根目录。`vercel.json` 将框架设为 Other，跳过安装与构建，直接发布 `site/`。渲染工具和本地开发服务器不会作为线上服务运行。

## 帧率说明

每个 MP4 都有 270 帧，精确 60 fps，时长 4.5 秒。

GIF 使用固定 20 毫秒间隔，直接按 50 fps 渲染，共 225 个采样时刻、4.5 秒。GIF 的时间精度为 10 毫秒，无法可靠表达 60 或 120 fps；短于 20 毫秒的帧可能被浏览器延长，反而播放迟缓。因此不再提供原来的 10/20 毫秒交替版本。`*-compatible.gif` 保留为相同新版 GIF 的别名，ZIP 中每款仅含一份 GIF 和一份 MP4。默认网页预览播放 60 fps MP4；GIF 标签展示实际导出文件。

系统开启“减少动态效果”时，首次进入显示静态画面；用户主动播放、切换特效或返回视频预览时正常播放，不再被加载事件强制暂停在 2.20 秒。

GIF 中连续静止帧可能合并成一帧并累计延迟，停留时间不变。

## 重新渲染

安装用户指定的 skill：

```sh
npx skills add https://github.com/anthropics/skills --skill slack-gif-creator --agent codex --global --yes
python3 -m venv .venv
.venv/bin/pip install -r requirements-render.txt
npm install
GIF_SKILL_PATH="$HOME/.agents/skills/slack-gif-creator" SHARP_MODULE="$PWD/node_modules/sharp" .venv/bin/python scripts/render_collection.py
```

系统需有 Node.js 20+、Python 3.12+ 与 FFmpeg。渲染脚本可通过 `GIF_SKILL_PATH` 和 `SHARP_MODULE` 配置依赖路径；页面预览与部署不需要这些渲染依赖。已有完整素材且源 SVG 和渲染版本未变化时，可传入 `--styles ink mosaic shutter focus` 仅重新渲染指定风格；替换源 SVG 后必须重新生成全部十八款。传入 `--contact DIR` 可为指定风格输出关键帧对照图而不改动网站。脚本同步更新网站 SVG、预览图、清单与下载包，并由素材哈希和渲染版本共同标记缓存版本。仅调整 GIF 时可用 `--gif-only` 从 SVG 按 50 fps 重新生成全部 GIF，保留同源视频。

缓动与 GIF 工具来自 [Anthropic slack-gif-creator](https://github.com/anthropics/skills/tree/main/skills/slack-gif-creator)。为了保留 4.5 秒时长，导出代码在该 skill 的帧合成和全局调色板功能之外，增加了 GIF 百分之一秒时序适配。

## 验证

启动本地服务器后：

```sh
npm install
npx playwright install chromium
npm run test:browser
.venv/bin/python tests/verify_media.py
```

可以通过 `BASE_URL=https://oreki-zh.github.io/jagger/ npm run test:browser` 验证已部署站点。测试包括十八种风格切换、两辑分组、全部素材地址、播放控制、实际下载、手机布局、键盘操作与减少动态效果设置下主动播放、所有风格播放越过 2.20 秒、完整循环和延迟加载。

## 设计参考

通过 Lazyweb 检索 Frame.io 的资产预览界面与 Vimeo 的视频库布局，采用大预览、相邻下载区、底部可切换缩略图的结构：[参考集合](https://www.lazyweb.com/agentic-search/07081a7c-4b09-4e2d-a148-33f00d334c0e)。
