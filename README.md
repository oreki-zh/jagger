# Animation Display

中国财富出版社 Logo 动效选集。九种动画均使用 `svg_version.svg`，统一 1080 × 320、4.5 秒、60 fps 视频母版。

[打开动画展示网站](https://oreki-zh.github.io/jagger/)

卷曲展开、书页翻转、逐字跃入、圆心扩展、切片汇聚、印迹显影、像素聚合、对开揭幕、景深聚焦。

## 本地预览

```sh
npm start
```

打开 http://localhost:4173。网站无需安装前端依赖，也无需构建。

## 目录与 GitHub 部署

- `site/`：完整静态网站，含 HTML、CSS、JavaScript 和全部可下载素材。
- `site/manifest.json`：动画名称、媒体路径和真实文件大小。
- `site/manifest.js`：相同数据供页面直接加载，支持普通静态托管。
- `site/media/`：九套 MP4、GIF、兼容 GIF、预览图和全部素材 ZIP。
- `scripts/render_collection.py`：使用 Anthropic `slack-gif-creator` 的帧合成、缓动与调色板功能渲染动画。
- `output/`：本地此前的试作版本（不提交到仓库）；展示页仅使用 `site/media/`。

仓库：[oreki-zh/jagger](https://github.com/oreki-zh/jagger)。`.github/workflows/pages.yml` 通过 GitHub Actions 将 `site/` 目录发布到 GitHub Pages；推送到 `main` 的网站变更会触发部署。也可直接把 `site/` 作为任意静态托管的发布目录。所有页面资源均为相对路径，适用于仓库子路径。

## 帧率说明

每个 MP4 都有 270 帧，精确 60 fps，时长 4.5 秒。

GIF 只支持百分之一秒精度，无法使用固定 16.6667 毫秒帧间隔。普通 GIF 使用累计时间四舍五入生成 10/20 毫秒交替延迟，名义平均 60 fps，总编码时长 4.5 秒。部分浏览器会把短延迟延长，实际播放可能偏慢。`*-compatible.gif` 则从母版重新采样为 50 fps（每帧 20 毫秒），保持 4.5 秒，更适合浏览器使用。默认网页预览播放 MP4；GIF 标签可查看导出文件在当前浏览器中的实际效果。

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

系统需有 Node.js 20+、Python 3.12+ 与 FFmpeg。渲染脚本可通过 `GIF_SKILL_PATH` 和 `SHARP_MODULE` 配置依赖路径；页面预览与部署不需要这些渲染依赖。已有完整素材后，可传入 `--styles ink mosaic shutter focus` 仅重新渲染指定风格，保留其余素材并更新清单与下载包。

缓动与 GIF 工具来自 [Anthropic slack-gif-creator](https://github.com/anthropics/skills/tree/main/skills/slack-gif-creator)。为了保留 4.5 秒时长，导出代码在该 skill 的帧合成和全局调色板功能之外，增加了 GIF 百分之一秒时序适配。

## 验证

启动本地服务器后：

```sh
npm install
npx playwright install chromium
npm run test:browser
.venv/bin/python tests/verify_media.py
```

可以通过 `BASE_URL=https://oreki-zh.github.io/jagger/ npm run test:browser` 验证已部署站点。测试包括九种风格切换、全部素材地址、播放控制、实际下载、手机布局、键盘操作与减少动态效果设置。

## 设计参考

通过 Lazyweb 检索 Frame.io 的资产预览界面与 Vimeo 的视频库布局，采用大预览、相邻下载区、底部可切换缩略图的结构：[参考集合](https://www.lazyweb.com/agentic-search/07081a7c-4b09-4e2d-a148-33f00d334c0e)。
