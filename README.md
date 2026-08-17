# 社媒内容运营创作助手

一个本地运行的内容助手，专门做小红书素材搜索、素材筛选和二创生成。

## 它能做什么

- 连接你本机已登录的 Chrome 小红书页面，抓取真实可见内容
- 按关键词、内容类型、最低点赞数、采集数量筛选素材
- 支持手动勾选素材
- 根据已选素材生成文章二创、视频脚本和运营简报

## 启动方式

### 1. 安装依赖

```bash
npm install
```

### 2. 配置模型 Key

复制 `.env.example` 为 `.env`，按需填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek key
DEEPSEEK_MODEL=deepseek-v4-flash

OPENROUTER_API_KEY=你的 OpenRouter key
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free

OPENAI_API_KEY=你的 OpenAI key
OPENAI_MODEL=gpt-4o-mini
```

说明：
- 优先使用 `DEEPSEEK_API_KEY`
- 没有 DeepSeek 时会尝试 OpenRouter，再尝试 OpenAI
- 没有任何 key 时，搜索和勾选还能用，但不会生成二创

### 3. 启动服务

```bash
npm start
```

打开：

```text
http://localhost:3001
```

## Chrome 要求

这个项目不是抓网页源码，而是读取你本机已登录的 Chrome。

请先用远程调试端口启动 Chrome，并打开小红书搜索页：

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222
```

需要满足：
- Chrome 已启动
- 已登录小红书
- 搜索页可正常显示结果

## 数据来源

当前只使用小红书搜索页的真实可见信息：

- 标题
- 作者
- 点赞数
- 收藏数
- 封面图
- 来源链接

不使用模拟数据，也不拿其他平台代替。

## 功能流程

1. 输入关键词并搜索
2. 筛选并勾选素材
3. 填写故事设定、文风和二创方向
4. 点击生成，输出文章二创、视频脚本和运营简报

## 项目结构

```text
app/
├── assets/styles/main.css
├── features/
│   ├── content-discovery/
│   │   ├── discovery-view.js
│   │   └── search-service.js
│   └── content-rewrite/
│       └── rewrite-service.js
├── shared/
│   ├── formatters.js
│   └── number-utils.js
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

- `app/main.js`：状态管理、事件绑定、流程串联
- `app/features/content-discovery/search-service.js`：调用搜索接口
- `app/features/content-discovery/discovery-view.js`：渲染素材和洞察
- `app/features/content-rewrite/rewrite-service.js`：生成预览和正式二创
- `app/shared/formatters.js`：格式化工具
- `app/shared/number-utils.js`：数字解析和范围限制
- `app/assets/styles/main.css`：页面样式
- `server/index.js`：静态服务和 API
- `server/xhs-chrome-collector.js`：通过 Chrome 采集小红书结果
- `server/content-rewrite-generator.js`：调用模型并校验输出
- `server/model-provider.js`：选择 DeepSeek / OpenRouter / OpenAI
- `server/rewrite-prompt.js`：组装提示词
- `server/env-loader.js`：读取本地环境变量

## API

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

小红书封面图代理接口。

## 已知限制

- 依赖你本机已登录的 Chrome
- 小红书页面没切到对应关键词时，结果会少
- 页面如果不继续加载，采集条数也会少
- 二创生成依赖外部模型 key

## 常见问题

- 没有结果：检查小红书是否已登录、是否打开正确搜索页
- 结果太少：放宽最低点赞数，降低采集过滤，或等页面继续加载
- 图片不显示：确认封面图可访问
- 不能生成二创：检查 `.env` 里的模型 key
- 页面打不开：确认 `npm start` 已启动，默认端口是 `3001`
