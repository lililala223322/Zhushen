# Core 迁移状态

本文档记录 `docs/architecture-core-package.md` 对应架构升级的当前实现状态。

## 当前阶段

当前处于“核心包抽离”的第一步：先建立 `packages/core` 边界，并将 UI 中已经重复出现的规则判断逐步迁移到核心接口。

## 已完成

- 新增 `packages/core` 包骨架。
- 新增 TypeScript 配置和包清单：
  - `packages/core/package.json`
  - `packages/core/tsconfig.json`
- 新增核心领域类型：
  - 六维属性类型。
  - 职业分类类型。
  - 特性类型。
  - 构筑输入类型。
  - 校验消息类型。
- 新增第一批核心规则接口：
  - `getClassCategory`
  - `getClassCategories`
  - `groupClassesByCategory`
  - `getTraitAvailability`
  - `getTraitSelectionAvailability`
  - `traitPrerequisites`
  - `displayTraitName`
  - `validateBuild`
  - `validateBuildMessages`
  - `availableDivineRaces`
  - `allowedMortalRaces`
  - `calculateBasePotential`
  - `bloodlineSummary`
  - `calculateGrowth`
- `packages/core` 已新增成长计算主接口：
  - `packages/core/src/types/result.ts`
  - `packages/core/src/growth/calculate-growth.ts`
  - `packages/core/src/utils/vector.ts`
  - `packages/core/src/utils/number.ts`
- `packages/core` 已新增技能门槛规划接口：
  - `packages/core/src/planner/skill-threshold.ts`
- `packages/core` 已新增构筑上限评估接口：
  - `packages/core/src/optimizer/build-limit.ts`
- `packages/core` 已新增 TypeScript 规则数据快照：
  - `packages/core/src/rules/data.ts`
- `web/calc.js` 已收缩为 `GrowthCalc` 兼容 wrapper，计算、规划、上限评估、血脉和格式化入口均委托给 `window.ZhushenCore`。
- `web/index.html` 已按 `data -> core -> calc -> app` 顺序加载脚本，并更新到 `core-migration-v4` 缓存版本。
- 新增根级 `package.json`，提供验证和未来 core 构建脚本入口。
- 新增根级 `package-lock.json`，锁定当前 TypeScript 依赖版本。
- 新增 `scripts/verify-web-core.js`，用于对比旧 fallback 路径和新 core 路径的成长计算结果。
- 新增 `packages/core/test/core.test.ts`，作为核心包正式回归测试。
- 新增 `packages/core/src/browser.ts`，作为静态页浏览器入口。
- 新增 `npm run web:core`，用 `rolldown` 将 `packages/core` 打包成 `web/core.js`。
- `web/core.js` 当前由 `packages/core/src/browser.ts` 生成，并挂载 `window.ZhushenCore`。
- `web/calc.js` 不再保留成长计算、技能门槛规划、构筑上限评估的旧算法 fallback。
- `web/app.js` 已开始调用 `window.ZhushenCore`：
  - 职业下拉分组通过 core 获取。
  - 混血神子特性显示名通过 core 获取。
  - 混血神子特性前置条件通过 core 获取。
  - 特性不可选原因通过 core 获取。
  - 圣子特性分组通过 core 获取。
  - 可用神技种族和可用凡人特性种族通过 core 获取。
  - 特性选择禁用原因通过 core 获取。

## 当前仍保留的兼容代码

以下逻辑仍保留在 `web/app.js` 或 `web/calc.js`，后续需要继续迁移：

- UI 状态管理和渲染。

`web/calc.js` 当前只作为旧页面调用名 `GrowthCalc` 的兼容层存在，不再定义核心规则。

## 验证状态

已通过：

```powershell
node --check web\core.js
node --check web\app.js
node --check web\calc.js
node --check web\data.js
```

已通过 Node VM 直接加载 `web/data.js -> web/core.js -> web/calc.js`，并验证 `GrowthCalc` wrapper 能通过 `ZhushenCore` 完成成长计算、特性可选性、技能门槛规划和构筑上限评估。

已通过：

```powershell
npm run web:core
npm run verify:web-core
npm run core:test
npm run core:typecheck
npm run core:build
node --check web\data.js
node --check web\core.js
node --check web\calc.js
node --check web\app.js
node --check scripts\verify-web-core.js
```

已通过本地静态 HTTP 加载检查：

- `http://127.0.0.1:8876/` 返回 `200`。
- 页面引用 `core-migration-v4` 脚本版本。

当前 `scripts/verify-web-core.js` 覆盖：

- 法拉样例。
- 圣子样例。
- 混血神子特性前置。
- 特性选择可用性。
- 技能门槛规划结果。
- 固定 seed 的构筑上限评估。

当前 `packages/core/test/core.test.ts` 覆盖：

- TypeScript 规则数据与 `web/data.js` 浏览器数据一致性。
- 有效等级 1-60 和 61+ 系数。
- 职业分类。
- 混血神子特性前置。
- 特性选择可用性，包括部位冲突。
- 圣子前四选一、后四选一分组。
- 法拉样例成长计算。
- 技能门槛规划 API。
- 构筑上限评估 API。
- 血脉推导出的可用神技与凡人特性种族。

## 下一步建议

优先迁移顺序：

1. 扩展核心包测试到更多真实角色路线和当前状态反推场景。
2. 开始为未来战斗模拟定义独立输入/输出类型，但不要把战斗逻辑接入本阶段。
3. 后续若引入前端框架，可将 `web/core.js` 的 IIFE 产物改为 ESM 直接导入。
