# Yizhou Lu — Personal Homepage

深空暗色 + 3D 星座粒子 + 编辑部式排版的个人学术主页。
**全站内容由一个 `content.md` 驱动**：改 Markdown，页面自动渲染，无需构建步骤，直接部署在 GitHub Pages。

## 本地预览

内容通过 `fetch` 加载，需要一个本地服务器（直接双击 `index.html` 会因浏览器安全策略加载失败）：

- **方式一**：双击根目录的 `preview.command`（自动起服务并打开浏览器）
- **方式二**：终端运行

```bash
python3 -m http.server 4173
# 然后访问 http://localhost:4173
```

## 怎么改内容（只需要编辑 `content.md`）

### 1. 站点配置（文件顶部 `---` 之间）

```yaml
name: Yizhou Lu                  # 巨型标题 & 导航 monogram
kicker: Undergraduate Researcher · ...   # 名字上方的小字
tagline: Toward a *predictive* science ...  # 名字下方斜体句，*词* 会变成强调色
status: Open to PhD positions · Fall 2027   # 状态胶囊（核心 CTA）
email: you@example.com
scholar: https://scholar.google.com/...
github: https://github.com/...
# cv: assets/cv/YizhouLu_CV.pdf  # 把 PDF 放进 assets/cv/ 后取消注释，CV 按钮自动出现
keywords: A · B · C              # 跑马灯关键词，用 · 分隔
```

`#` 开头的行是注释，会被忽略。

### 2. 章节

每个 `## 标题` 是一个章节，`@type` 决定渲染样式：

| `@type` | 用途 | 写法 |
|---|---|---|
| `about` | 自我介绍 | 普通段落；`> 引用` 会渲染成强调框；`@photo:` 指定照片 |
| `news` | 动态列表 | `- **May 2026** — 内容`；`@visible: 5` 控制默认显示条数，其余折叠 |
| `timeline` | 教育/经历 | `### 机构名` + `- logo:` `- role:` `- host:` `- period:` |
| `publications` | 论文 | `### 论文标题` + `- authors:` `- venue:` `- links:`；`@note:` 显示脚注 |
| `columns` | 多栏（奖项/教学/服务） | 每个 `### 栏标题` 一栏，条目用 `- **主体** — 元信息`（`—` 后会渲染成小字） |
| `contact` | 联系 | `@headline:` 大标语 + 一段正文，邮箱/链接自动从站点配置读取 |

其他指令：`@nav: no`（不出现在导航栏）、`@id: xxx`（自定义锚点）。

### 3. 行内语法

`**加粗**`、`*斜体*`、`` `代码` ``、`[文字](链接)`，注释用 `<!-- ... -->`。
论文作者中的等贡献星号直接写 `*` 即可（如 `**Yizhou Lu***`），不会被误识别为斜体。

### 4. 常见操作

- **加一条 News**：在 `## News` 下加一行 `- **Month Year** — 内容`
- **加一篇论文**：复制 `## Publications` 里的注释模板改一改
- **加一段经历**：在 `## Experience` 下复制一个 `###` 块
- **启用 CV 按钮**：PDF 放入 `assets/cv/`，frontmatter 取消 `cv:` 注释

## 技术说明

| 文件 | 职责 |
|---|---|
| `content.md` | 全站内容（你唯一需要日常编辑的文件） |
| `index.html` | 静态骨架 + SEO meta |
| `assets/css/site.css` | 设计系统（暗色主题、排版、响应式） |
| `assets/js/content.js` | Markdown 解析 + 渲染（零依赖） |
| `assets/js/constellation.js` | Hero 3D 星座粒子背景（零依赖 Canvas） |
| `assets/js/motion.js` | 滚动动效（GSAP + ScrollTrigger + Lenis，CDN 加载失败时自动降级为静态页面） |

动效全部尊重系统的"减弱动态效果"设置；移动端自动关闭鼠标视差/倾斜效果。

## 部署

推到 GitHub 即可（仓库 Settings → Pages → Deploy from a branch → `main` / root）。
`.nojekyll` 已添加，跳过 Jekyll 构建。

## License

[MIT](LICENSE.md)
