# 社媒内容运营创作助手

一个面向小红书内容运营的创作助手，用来从已登录 Chrome 的小红书页面采集素材、提炼洞察，并生成文章二创和视频脚本。

## 当前能力

- 根据关键词打开已登录 Chrome 中的小红书搜索页，并提取页面真实可见结果
- 支持按图文、视频类型筛选
- 支持选择素材并自动归纳高频痛点、方法和高点击开头
- 根据已选素材生成文章二创，可选择新故事创作、文章结构重写、攻略/清单整理
- 支持设置故事主角、文风要求和二创方向
- 根据已选素材生成短视频脚本
- 输出运营简报和合规提醒

## 运行方式

启动本地服务和抓取 API：

```bash
npm start
```

然后访问：

```text
http://localhost:3001
```

## 二创生成配置

二创生成优先使用 DeepSeek，兼容 OpenRouter 和 OpenAI。

1. 复制 `.env.example` 为 `.env`
2. 在 `.env` 填入：

```text
DEEPSEEK_API_KEY=你的 DeepSeek key
DEEPSEEK_MODEL=deepseek-v4-flash
```

如果不用 DeepSeek，也可以配置 OpenRouter：

```text
OPENROUTER_API_KEY=你的 OpenRouter key
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
```

也可以配置 OpenAI：

```text
OPENAI_API_KEY=你的 OpenAI key
OPENAI_MODEL=gpt-4o-mini
```

配置后重启 `npm start`。没有配置 key 时，搜索和素材选择仍可使用，但点击“生成二创”会明确提示生成未激活。

## 项目结构

```text
app/
├── assets/
│   └── styles/
│       └── main.css                  # 全局布局、组件样式和设计变量
├── features/
│   ├── content-discovery/
│   │   ├── discovery-view.js         # 素材列表和洞察区域渲染
│   │   └── search-service.js         # 调用 /api/search，并缓存当前搜索素材
│   └── content-rewrite/
│       └── rewrite-service.js        # 二创预览、生成请求和洞察提取
├── shared/
│   └── formatters.js                 # 通用格式化和集合工具
├── index.html                        # 页面结构入口
└── main.js                           # 应用状态、事件绑定和模块组装
server/
├── index.js                          # 静态页面服务、搜索 API、图片代理和二创 API
├── content-rewrite-generator.js       # 模型请求、失败重试、输出解析和基础校验
├── env-loader.js                      # 加载本地 .env 配置
├── model-provider.js                  # DeepSeek、OpenRouter、OpenAI 的模型配置选择
├── rewrite-prompt.js                  # 二创提示词、故事创作规则和素材格式化
└── xhs-chrome-collector.js           # 已登录 Chrome 小红书页面采集
```

## 命名规范

- 文件夹使用业务含义命名，例如 `content-discovery`、`content-rewrite`
- 服务文件使用 `*-service.js`，只放业务逻辑，不直接操作 DOM
- 视图文件使用 `*-view.js`，只负责把数据渲染成页面
- `main.js` 只做应用启动、状态流转、事件绑定，不塞具体业务算法
- `shared/` 只放跨功能复用的小工具，避免把业务逻辑放进去

## 数据来源说明

当前版本不使用模拟数据作为搜索结果。页面会请求 `GET /api/search`，服务端通过 Chrome DevTools Protocol 控制你已登录的小红书页面，打开对应关键词搜索页，并提取当前页面真实可见的笔记标题、作者、互动数、封面图和链接。

搜索结果会做当前关键词相关性过滤，防止旧搜索页或旧标签页里的不相关内容混入当前素材池。

需要注意：

- 搜索目的地只接受小红书页面
- 不使用知乎、头条、搜狐、网易等其他平台内容替代小红书结果
- 只能读取当前登录态下页面正常展示的信息
- 如果小红书限制访问、弹验证码、页面不继续加载，系统会显示抓取失败或结果不足
- 不绕过平台登录、验证码、反爬限制或权限边界
- 生产环境建议使用官方授权、企业数据服务或自有账号授权数据源
