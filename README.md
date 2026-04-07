# Searchbar / 搜索吧

[English](#english) | [中文](#中文)

Searchbar is an Edge extension for switching between search engines faster, without manually copying keywords from one site to another.

搜索吧是一个 Edge 扩展，让你在不同搜索引擎之间更快切换，不用反复复制关键词。

---

## English

### Store short description
Quickly switch search engines with support for custom engines.

### Store-style introduction
Searchbar helps you move between search engines with fewer clicks and less repeated typing.

It adds a compact popup in the toolbar and a floating switcher on supported search pages, so you can reuse the current keyword, jump to another engine, and keep searching without breaking your flow.

#### Highlights
- Switch between built-in search engines in one click
- Add your own custom search engines with URL templates
- Reuse the current page keyword when jumping to another engine
- Search directly from the toolbar popup
- Reorder engines and remove the ones you do not need
- Supports both Chinese and English interface text

#### Built-in engines
The current extracted version includes built-in support for:
- Google
- Bing
- Bilibili
- Xiaohongshu
- Douyin
- YouTube
- Baidu
- Douban
- WeChat search
- Zhihu
- DuckDuckGo
- The Pirate Bay
- RARBG
- Bing Dictionary

#### Good for
- People comparing results across multiple search engines
- Users who often switch between web search and site search
- Anyone who wants a faster alternative to manual copy and paste

### GitHub project overview
This repository contains the extracted source of the published Edge extension **Searchbar**.

#### Main features
- Toolbar popup for direct keyword search
- Floating in-page search engine switcher
- Built-in plus custom engine support
- Drag-and-drop engine ordering
- Built-in engine visibility management
- Localized interface with English and Simplified Chinese
- Sync storage support for user-defined engine settings

#### How it works
Searchbar detects the keyword on the current search page, then builds the target search URL for another engine. If no keyword is detected, it prompts for one so you can continue searching immediately.

#### Installation for development
1. Clone this repository.
2. Open `edge://extensions/` in Microsoft Edge.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.

#### Project structure
- `manifest.json`: extension manifest
- `src/js/background.js`: background service worker
- `src/js/content.js`: floating panel and in-page interactions
- `src/js/utils.js`: search engine definitions and helpers
- `src/popup/`: popup UI
- `_locales/`: localization resources
- `icons/`: extension icons

#### Screenshots
Screenshot placeholders can be added later in `docs/`.

Suggested captures:
- Toolbar popup
- Floating switcher on a search page
- Search engine manager panel

#### Notes
- Current extracted version: **1.6.0**
- This repository is based on the installed extension files currently available on the local machine
- See `CONTRIBUTING.md` and `CHANGELOG.md` for project maintenance details

---

## 中文

### 商店简短介绍
轻松切换搜索引擎，支持自定义搜索引擎。

### 商店风格介绍
搜索吧帮你在不同搜索引擎之间更快跳转，减少重复输入和复制粘贴。

它提供了一个工具栏弹窗，以及一个在搜索页面中可用的浮动切换面板。你可以复用当前页面关键词，快速切换到另一个搜索引擎，尽量不中断搜索流程。

#### 功能亮点
- 一键切换内置搜索引擎
- 支持通过 URL 模板添加自定义搜索引擎
- 切换时自动复用当前页面关键词
- 支持从工具栏弹窗直接输入关键词搜索
- 支持拖拽排序、删除不需要的引擎
- 支持中文和英文界面

#### 当前内置引擎
当前提取版本内置支持：
- Google
- Bing
- 哔哩哔哩
- 小红书
- 抖音
- YouTube
- 百度
- 豆瓣
- 微信搜索
- 知乎
- DuckDuckGo
- The Pirate Bay
- RARBG
- 必应词典

#### 适合谁用
- 经常对比多个搜索引擎结果的人
- 会在通用搜索和站内搜索之间来回切换的人
- 想减少手动复制关键词操作的人

### GitHub 项目说明
这个仓库保存的是已发布 Edge 扩展 **搜索吧** 的源码提取版本。

#### 主要功能
- 工具栏弹窗快速搜索
- 页面内浮动搜索引擎切换器
- 支持内置引擎和自定义引擎
- 支持拖拽排序
- 支持管理内置引擎显示状态
- 支持中英文本地化
- 用户自定义设置可通过同步存储保存

#### 工作方式
搜索吧会先识别当前搜索页面里的关键词，然后拼接目标搜索引擎的搜索链接。如果没识别到关键词，就会弹出输入框，让你继续搜索。

#### 开发安装方法
1. 克隆本仓库
2. 在 Microsoft Edge 中打开 `edge://extensions/`
3. 打开 **开发人员模式**
4. 点击 **加载解压缩的扩展**
5. 选择本仓库目录

#### 项目结构
- `manifest.json`：扩展清单
- `src/js/background.js`：后台 service worker
- `src/js/content.js`：浮动面板和页面交互逻辑
- `src/js/utils.js`：搜索引擎定义与辅助函数
- `src/popup/`：弹窗界面
- `_locales/`：多语言文案
- `icons/`：扩展图标

#### 截图说明
后续可以把项目截图放到 `docs/` 目录中。

建议补充：
- 工具栏弹窗截图
- 搜索页浮动切换器截图
- 搜索引擎管理面板截图

#### 备注
- 当前提取版本：**1.6.0**
- 当前仓库基于本机已安装扩展文件整理而来
- 项目维护说明可见 `CONTRIBUTING.md` 和 `CHANGELOG.md`
