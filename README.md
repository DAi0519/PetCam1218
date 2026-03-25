# PET CAM — Xmas Edition

给你的宠物拍一张圣诞大片。上传照片，AI 自动生成节日风格的写真。

## 玩法

上传宠物照片后，有两种模式可选：

- **Pet Portrait** — AI 分析宠物特征，搭配圣诞服饰和场景道具，生成一张杂志风格的圣诞写真
- **Hat Only** — 保留原图风格，只给主体加一顶圣诞帽

非宠物照片也可以用，会自动降级到加帽模式。

## 技术

React + TypeScript 前端，Hono 后端，Google Gemini 负责图像理解和生成。后端托管在 EdgeSpark。
