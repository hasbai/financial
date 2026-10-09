---
title: 不覆盖文章标题
references:
  - id: research
    author: 北极小站
    title: 示例研究文献
    year: 2026
---

## Markdown 扩展

行内公式 $E=mc^2$，独立公式：

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

> [!NOTE]
> 提示块内保留 **粗体** 与 [链接](https://example.com)。

:::warning
架构变更需要复核。
:::

| 功能 | 状态 |
| --- | --- |
| GFM | 支持 |

- [x] 已完成
- [ ] 待处理

~~删除线~~、脚注[^note] 与文献[@research]。

```mermaid
flowchart LR
  A[写作] --> B[发布]
```

```d2
direction: right
Browser -> Worker -> Database
Database.shape: cylinder
```

```markmap
# 思维导图
## 内容
- 文章
- 手记
## 展示
- 图表
- 公式
```

```mermaid
this is an invalid diagram
```

[^note]: 脚注资料与返回链接。
