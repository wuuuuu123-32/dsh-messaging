# dsh-messaging

DSH（DeepSeek Harness）桌面端的**消息标记**插件。同时开很多对话、怕忘的时候，把某一句「我」或「助手」的话标一下，之后从右下角的总览面板一键跳回原处。

- **行内标记**：每条用户消息和助手消息的官方操作行里多一个墨蓝书签按钮，点一下标上，再点取消。
- **会话行标识**：左侧会话列表里，有标记的会话在行首显示书签和数量，一眼看出哪个对话还有没处理完的话。
- **总览面板**：右下角常驻入口，列出所有标记的角色、会话、时间和摘录；点一项跳到原消息并高亮。

## 安装

### 方式一：链接本地目录（开发用）

1. 把本目录放在任意位置，例如 `D:\dsh\config\dsh-messaging`。
2. 在 DSH profile 的依赖里加一条，例如 `C:\Users\<你>\.dsh\profiles\desktop\package.json`：

   ```json
   "dsh-messaging": "link:D:/dsh/config/dsh-messaging"
   ```

3. 在 `node_modules` 下建立同名链接（Windows 下免提权的做法）：

   ```bat
   mklink /J node_modules\dsh-messaging D:\dsh\config\dsh-messaging
   ```

4. 在 **patch 层**（`~/.dsh/profiles/desktop/cordis.patch.yml`）追加：

   ```yaml
   - insert:
       - id: messaging
         name: dsh-messaging
         config: {}
   ```

   ⚠️ 必须带 `- insert:`。裸写 `- id: ...` 会被当成「覆盖已有条目」，id 不存在时**静默忽略、不报错**。

   ⚠️ 不要写进 `cordis.yml`——那个文件每次启动都会被 bundle 层重新生成，手写条目会消失。

   插件自带的 `cordis.patch.yml`（`dsh.bundle.patch`）只在包已被 loader 列出时才会被应用，光靠它不会自动出现。

5. 刷新 DSH 页面即可，客户端代码不需要构建。

### 方式二：发布包

```bat
dsh plugin --profile desktop add dsh-messaging
```

## 使用

- **标一句话**：把鼠标移到消息上，点官方操作行（复制、赞、踩那一排）末尾的书签按钮；再点一次取消。
- **看全部标记**：点右下角书签入口，面板按时间倒序列出，点击条目跳到原消息，跳转后短暂高亮。
- **看哪个对话有标记**：左侧会话行行首的书签和数字。

## 数据

标记存在浏览器 `localStorage` 的 `dsh-messaging:pins` 键里，刷新和重启 DSH 都会保留；清浏览器存储会一并清掉。

每条标记记录：会话 id、消息节点 key、角色（用户 / 助手）、摘录（最多 160 字）、时间。

## 已知限制

- **消息定位依赖内部 DOM 属性** `data-chat-node-key`。DSH 官方没有为「用户消息」提供操作区插槽（助手消息有 `conversation.chat.assistant-actions`，但实测注册后不渲染），所以行内按钮走的是受保护的 DOM 注入：找不到官方操作行就跳过该行，不影响另外两个界面。
- **跨会话跳转依赖 `ctx.uiWorkspace.openSession`**；拿不到时用「点击左侧会话行」的兜底路径。两条都失败时，面板顶部会写清卡在哪一步（会话切换入口不可用 / 已切换但没找到行 / 找到行但滚动失败）。
- **标记是本地数据**，不跨设备同步，也不随会话导出。
- 右侧那条竖排刻度是 DSH 内置的「轮次轨道」，由 ui-chat 内部渲染，没有对外插槽，所以本插件不在上面做标记，改用右下角的独立入口。

## 开发

```
lib/client.js    客户端入口（挂在 window.__ModuleLoader__.load 上，零构建；
                 只 require react / react/jsx-runtime / @deepseek-ai/dsh-client-ui-primitives）
lib/model.mjs    纯数据逻辑（增删查、按会话分组、摘录截断），不碰 DOM
lib/index.js     host 侧入口（仅声明 name / apply）
test/model.mjs   数据逻辑测试
test/client.mjs  客户端测试（含注入、滚动定位、跨会话兜底等分支）
```

```bat
npm test
```

## 设计说明

为什么是「行内按钮 + 会话行标识 + 独立面板」这三处：

1. **行内按钮**是唯一的标记入口。不做悬停浮层——浮层要自己算位置，还会被虚拟列表的行复用搞错行。
2. **会话行标识**回答「哪个对话还有事没办完」，这是多对话并行时最需要的信息。
3. **独立面板**承担跳转和速览。DSH 的右侧竖条是内部轮次轨道，没有注入点，与其和它抢位置，不如在自己可控的浮层里做。

跳转的逻辑顺序也值得一提：先在**当前** DOM 里找目标 `data-chat-node-key`，命中就直接滚（不碰会话切换）；找不到才切会话，切完轮询等行出现，再做「滚动 + 视口校验 + 可滚动祖先兜底」。

## 许可

MIT
