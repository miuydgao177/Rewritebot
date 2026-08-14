# 社媒内容运营创作助手

一个面向小红书内容运营的本地创作助手。

它做三件事：
- 从已登录的 Chrome 小红书页面采集真实可见内容
- 从选中的素材里提炼洞察
- 生成文章二创、视频脚本和运营简报

## 核心能力

- 真实抓取：不使用模拟数据，不用别的平台内容替代小红书结果
- 素材筛选：支持关键词、内容类型、最低点赞数、采集数量
- 素材选择：支持手动勾选素材进入二创池
- 二创生成：支持新故事创作、文章结构重写、攻略/清单整理
- 脚本输出：生成可直接拍摄的视频脚本
- 运营辅助：自动输出主题洞察、素材共性和发布建议

## 工作流

1. 在已登录的 Chrome 里打开小红书搜索页
2. 在本地页面输入关键词并点击搜索
3. 选择需要二创的素材
4. 填写故事设定、文风要求和二创方向
5. 点击生成，得到文章、视频脚本和运营简报

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，然后按需填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek key
DEEPSEEK_MODEL=deepseek-v4-flash

OPENROUTER_API_KEY=你的 OpenRouter key
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free

OPENAI_API_KEY=你的 OpenAI key
OPENAI_MODEL=gpt-4o-mini
```

说明：
- 二创生成优先使用 `DEEPSEEK_API_KEY`
- 没有 DeepSeek 时会尝试 OpenRouter，再尝试 OpenAI
- 没有配置任何 key 时，搜索和选素材仍可用，但“生成二创”不会激活

### 3. 启动服务

```bash
npm start
```

打开：

```text
http://localhost:3001
```

## Chrome 与小红书采集要求

这个项目不是直接爬网页源码，而是控制你本机已登录的 Chrome。

你需要让 Chrome 带远程调试端口启动，并先登录小红书：

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222
```

如果你使用的是 macOS，请确保：
- Chrome 已启动
- 已登录小红书
- 小红书搜索页已经能正常显示内容

如果页面出现验证码、限制访问、加载中断或旧标签页停留在别的关键词上，系统会提示结果不足或抓取失败。

## 数据来源

当前版本只使用小红书搜索页的真实可见内容：
- 笔记标题
- 作者
- 点赞数
- 收藏数
- 封面图
- 来源链接

不做这些事：
- 不用模拟数据
- 不抓知乎、头条、网易、搜狐等其他平台替代
- 不绕过登录、验证码或平台权限边界

## 二创生成说明

生成模块会把你选中的真实素材交给模型，按你设置的：
- 成稿类型
- 故事主角设定
- 文风要求
- 二创方向

来输出完整成稿。

支持的成稿类型：
- 新故事创作
- 文章结构重写
- 攻略/清单整理

## 项目结构

```text
app/
├── assets/
│   └── styles/
│       └── main.css
├── features/
│   ├── content-discovery/
│   │   ├── discovery-view.js
│   │   └── search-service.js
│   └── content-rewrite/
│       └── rewrite-service.js
├── shared/
│   └── formatters.js
├── index.html
└── main.js

server/
├── content-rewrite-generator.js
├── env-loader.js
├── index.js
├── model-provider.js
├── rewrite-prompt.js
└── xhs-chrome-collector.js
```

## 模块职责

- `app/index.html`：页面骨架
- `app/main.js`：应用状态、事件绑定、流程串联
- `app/features/content-discovery/search-service.js`：调用搜索接口并缓存结果
- `app/features/content-discovery/discovery-view.js`：渲染素材卡片和洞察
- `app/features/content-rewrite/rewrite-service.js`：生成预览和请求正式二创
- `app/shared/formatters.js`：通用格式化工具
- `app/assets/styles/main.css`：全局布局和视觉样式
- `server/index.js`：静态文件服务、搜索 API、图片代理、二创 API
- `server/xhs-chrome-collector.js`：通过 Chrome DevTools Protocol 采集小红书结果
- `server/content-rewrite-generator.js`：调用模型并校验输出
- `server/model-provider.js`：选择 DeepSeek / OpenRouter / OpenAI
- `server/rewrite-prompt.js`：拼装提示词和素材上下文
- `server/env-loader.js`：读取本地 `.env`

## 代码约定

- 文件夹按业务命名，例如 `content-discovery`、`content-rewrite`
- `*-service.js` 只放业务逻辑，不直接操作 DOM
- `*-view.js` 只负责渲染
- `main.js` 只做状态和事件编排
- `shared/` 只放跨模块复用的小工具

## API 概览

### `GET /api/search`

参数：
- `keyword`
- `type`
- `minLikes`
- `targetCount`

返回：
- `notes`
- `meta`

### `POST /api/rewrite`

请求体：

```json
{
  "notes": [],
  "options": {}
}
```

返回：
- `outputs.article`
- `outputs.video`
- `outputs.brief`

### `GET /api/xhs-image`

小红书封面图代理接口，用于显示可见图片。

## 目前已知限制

- 采集依赖你本机已登录的 Chrome
- 小红书页面如果没切到对应关键词，结果会少
- 页面如果没有继续加载，采集条数也会少
- 二创生成依赖外部模型 key
- 当前是本地工具，不是云端批量服务

## 常用排查

- 没有结果：确认小红书页面已登录、已打开搜索页、关键词一致
- 结果太少：提高页面加载时间，降低最低点赞数，或减少过滤条件
- 图片不显示：确认来源封面图可访问
- 不能生成二创：检查 `.env` 里的模型 key 是否配置
- 页面打不开：确认 `npm start` 已启动，默认端口是 `3001`

## 许可证

当前仓库未单独声明许可证，默认按项目内部使用处理。
