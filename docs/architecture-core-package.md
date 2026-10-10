# 方案 2：TypeScript + 纯计算核心包详细设计

## 背景

当前项目是一个无依赖静态网页，核心能力集中在成长计算、特性选择、技能门槛规划和构筑上限评估。随着后续要扩展战斗模拟、顶层决策器、用户角色模板、装备数据和可能的数据库存储，现有 `data.js / calc.js / app.js` 的边界会越来越难维护。

方案 2 的目标是先把“成长计算”抽象成一个可测试、可复用、接口稳定的 TypeScript 核心包。前端页面只负责输入、展示和调用核心包，不再直接承载核心规则。

## 总目标

建立一个独立的 `core` 包，作为整个功能平台的领域计算基础。

核心包需要提供：

- 稳定的数据类型定义。
- 规则数据访问接口。
- 成长计算接口。
- 构筑校验接口。
- 特性可选性判断接口。
- 职业分类接口。
- 后续战斗模拟和顶层决策器可复用的角色结果模型。

## 推荐目录结构

```text
packages/
  core/
    package.json
    tsconfig.json
    src/
      index.ts
      types/
        stat.ts
        build.ts
        trait.ts
        class.ts
        equipment.ts
        result.ts
        validation.ts
      rules/
        data.ts
        races.ts
        classes.ts
        traits.ts
        class-equipment.ts
        trait-meta.ts
      growth/
        calculate-growth.ts
        current-state.ts
        potential.ts
        formula.ts
      validation/
        validate-build.ts
        trait-availability.ts
        class-category.ts
      planner/
        skill-threshold.ts
      optimizer/
        build-limit.ts
      utils/
        vector.ts
        number.ts

web/
  src/
    main.ts
    state/
    views/
    components/
```

本阶段不要求一次性把现有页面全部改成框架项目，但核心包的边界应按上述结构设计。

## 本阶段任务边界

本阶段只做“成长计算核心包抽离”。范围必须克制，避免同时引入后端、数据库和战斗模拟导致重构失控。

本阶段包含：

- 将六维、血脉、职业、特性、装备、成长路线等领域类型迁移为 TypeScript 类型。
- 将 `data.js` 中与成长计算相关的规则数据迁移为结构化 TypeScript 数据。
- 将 `calc.js` 中的成长计算、构筑校验、特性可选性、职业分类、技能门槛规划、构筑上限评估抽到 `packages/core`。
- 为核心包导出明确 API。
- 为核心计算补最小测试集。
- 前端继续保留当前页面形态，但改为调用核心包接口。
- 继续允许本地静态页面运行。

本阶段不包含：

- 不实现用户账号系统。
- 不接数据库。
- 不实现后端 API。
- 不实现完整战斗模拟。
- 不实现顶层自动决策器。
- 不重做 UI 框架。
- 不把所有规则配置化成 DSL。
- 不做多用户权限、同步、云存储。

## 核心领域模型

### 六维属性

```ts
export type StatKey =
  | "strength"
  | "technique"
  | "agility"
  | "perception"
  | "will"
  | "constitution";

export type StatVector = Record<StatKey, number>;
```

六维向量是成长计算的基础数据结构，核心包内部所有六维运算都应使用 `StatVector`，避免散落的对象字面量。

### 角色构筑输入

```ts
export interface GrowthBuildInput {
  sex: "男" | "女";
  level: number;
  bloodlines: BloodlineInput[];
  characterPotential: StatVector;
  currentState?: CurrentStateInput;
  growthSegments: GrowthSegmentInput[];
  traitIds: string[];
  equipmentStats: StatVector;
  finalClass: string;
}
```

这是成长引擎的主输入。前端保存的角色模板也应尽量向这个结构靠拢。

### 成长结果

```ts
export interface GrowthResult {
  input: GrowthBuildInput;
  selectedTraits: Trait[];
  bloodlineSummary: BloodlineSummary[];
  potentialLimit: StatVector;
  basePotential: StatVector;
  finalCharacterPotential: StatVector;
  weightedFinalPotential: StatVector;
  ordinaryGrowth: StatVector;
  normalStats: StatVector;
  combatStats: StatVector;
  breakdown: Record<StatKey, StatBreakdown>;
  warnings: ValidationMessage[];
}
```

`GrowthResult` 是后续战斗模拟和顶层决策器的主要输入来源。

## 核心 API 设计

核心包对外导出稳定函数。

```ts
export function calculateGrowth(input: GrowthBuildInput): GrowthResult;

export function validateBuild(input: GrowthBuildInput): ValidationResult;

export function getTraitAvailability(
  input: GrowthBuildInput,
  traitId: string
): TraitAvailability;

export function getClassCategory(className: string): ClassCategory;

export function planSkillThreshold(
  input: GrowthBuildInput,
  plannerConfig: PlannerConfig
): PlannerResult;

export function evaluateBuildLimits(
  config: LimitEvaluatorConfig,
  plannerConfig: PlannerConfig
): LimitEvaluatorResult;
```

前端不应再自行判断：

- 神技是否可选。
- 神子特性是否满足前置。
- 圣子特性分组规则。
- 凡人特性是否属于可选种族。
- 职业属于哪个大类。
- 成长路线是否合法。

这些都应通过核心 API 获取。

## 规则数据设计

现阶段可以继续用 TypeScript 常量维护规则数据，但要逐步移除靠名称解析表达规则的做法。

推荐特性结构：

```ts
export interface Trait {
  id: string;
  name: string;
  type: TraitType;
  race: string;
  part?: string;
  flatStats: StatVector;
  multiplierStats: StatVector;
  potentialBonus: StatVector;
  divineCombatValue: StatVector;
  prerequisites?: TraitPrerequisite[];
  display?: TraitDisplayMeta;
}
```

混血特性应显式表达前置：

```ts
{
  id: "gut-flame",
  name: "复仇烈焰",
  type: "divine_trait",
  race: "古特",
  prerequisites: [
    { kind: "bloodlineRace", race: "切瓦" },
    { kind: "trait", traitId: "m-chewa-power" }
  ]
}
```

不要继续依赖：

```text
复仇烈焰（欧里克的神力）
```

这种字符串解析可以作为迁移期兼容逻辑，但不应成为长期接口。

## 校验和可选性边界

核心包需要区分两个概念：

### validateBuild

用于检查一个已经形成的构筑是否违反规则。

输出示例：

```ts
{
  level: "error",
  code: "TRAIT_PREREQUISITE_MISSING",
  message: "复仇烈焰需要先选择凡人特性：欧里克的神力",
  target: { kind: "trait", id: "gut-flame" }
}
```

### getTraitAvailability

用于 UI 判断某个特性是否可选，并显示不可选原因。

输出示例：

```ts
{
  available: false,
  reasons: [
    {
      code: "MISSING_PREREQUISITE_TRAIT",
      message: "需要先选择凡人特性：欧里克的神力"
    }
  ]
}
```

UI 不应自己拼规则，只展示核心包返回的结果。

## 职业分类设计

职业分类属于规则数据，不应写死在 UI 中。

```ts
export interface ClassCategory {
  id: "cavalry" | "archer" | "light_infantry" | "heavy_infantry" | "special";
  label: string;
  color: "red" | "green" | "blue" | "yellow" | "purple";
  classes: string[];
}
```

当前分类：

- 骑兵：皇家骑兵到曙光骑兵。
- 射手：长弓手到魔弓手。
- 轻步兵：狂战士到暗影刀客。
- 重步兵：王室禁卫到勇士精英。
- 特殊：剩余职业。

前端只调用 `getClassCategories()` 或 `getClassCategory(className)`。

## 圣子规则设计

圣子特性不应表示为普通 8 选 2，而应显式建模：

```ts
export interface SaintTraitGroup {
  id: "mark" | "role";
  label: string;
  maxSelected: 1;
  traitIds: string[];
}
```

当前规则：

- 前 4 个圣子特性为 `mark` 组，最多选 1。
- 后 4 个圣子特性为 `role` 组，最多选 1。

这条规则应由核心包统一校验和提供 UI 可选性。

## 成长引擎边界

成长引擎只负责从培养输入计算成长结果。

它应该知道：

- 血脉如何影响潜力。
- 特性如何影响潜力、固定值、乘区、战斗态六维。
- 职业成长如何按有效等级累积。
- 当前状态如何反推已有成长。
- 装备六维如何进入常态和战斗态属性。

它不应该知道：

- 战斗场景。
- 敌人属性。
- 技能释放策略。
- 用户账号。
- 数据库存储。
- 页面布局。

## 与未来战斗模拟的接口

未来战斗模拟不要直接读取 UI 状态，而应读取成长引擎输出。

建议接口：

```ts
export interface CombatCharacterInput {
  growthResult: GrowthResult;
  equipment: EquipmentLoadout;
  combatOptions: CombatOptions;
}

export interface BattleScenario {
  enemies: Enemy[];
  terrain?: TerrainRule[];
  turnLimit?: number;
  winCondition: WinCondition;
}

export function simulateBattle(
  character: CombatCharacterInput,
  scenario: BattleScenario
): BattleResult;
```

这样顶层决策器可以组合调用：

```text
候选培养方案 -> calculateGrowth -> simulateBattle -> score -> 排序
```

## 与未来顶层决策器的接口

顶层决策器的目标不是单次计算，而是在约束内搜索最优培养方案。

未来接口可以设计为：

```ts
export interface BuildOptimizationRequest {
  baseCharacter: CharacterBase;
  equipmentPool: EquipmentLoadout[];
  allowedDirections: BuildDirection[];
  constraints: OptimizationConstraints;
  scenario: BattleScenario;
}

export interface BuildOptimizationResult {
  bestBuilds: OptimizedBuild[];
  directionComparison: DirectionComparison[];
  explanation: OptimizationExplanation;
}
```

顶层流程：

```text
1. 根据角色基础生成候选培养方向。
2. 对每个方向生成候选成长路线、特性、职业、装备组合。
3. 调用成长引擎得到角色最终状态。
4. 调用战斗引擎评估战斗场景。
5. 按胜率、输出、生存、约束缺口排序。
6. 输出最优方案和方向对比。
```

## 测试策略

本阶段至少需要以下测试：

- 血脉潜力加权测试。
- 有效等级 1-60 和 61+ 系数测试。
- 神技战斗值进入战斗态、不进入常态测试。
- 特性固定值、乘区、成长值分别生效测试。
- 圣子前四选一、后四选一测试。
- 混血神子特性前置测试。
- 职业分类测试。
- 当前状态反推成长测试。
- 法拉样例回归测试。

测试工具可以使用 Vitest。

## 迁移步骤

建议按以下顺序推进：

1. 建立 `packages/core` TypeScript 项目。
2. 迁移六维向量工具和基础类型。
3. 迁移规则数据，不改变业务结果。
4. 迁移 `calculateGrowth`，用现有法拉样例做回归。
5. 迁移 `validateBuild` 和 `getTraitAvailability`。
6. 迁移职业分类和圣子分组规则。
7. 迁移技能门槛规划。
8. 迁移构筑上限评估。
9. 前端逐步改为调用核心包 API。
10. 删除 UI 中重复的业务判断。

每一步都应保持页面可运行。

## 未来可能任务

未来任务可以集中记录如下，暂不分阶段拆片：

- 引入后端服务。
- 引入用户系统。
- 将角色模板、装备方案、战斗场景、模拟记录存入数据库。
- 规则数据版本化。
- 支持用户自定义装备库。
- 支持战斗模拟模块。
- 支持敌人模板和场景模板。
- 支持培养方向比较。
- 支持顶层决策器自动搜索最优培养路线。
- 支持模拟结果解释，例如失败原因、关键短板、最优替换建议。
- 支持导入/导出角色方案。
- 支持多人共享规则数据或构筑模板。
- 将规则数据从 TypeScript 常量进一步迁移为可校验 JSON 或规则 DSL。
- 引入 Web Worker 或后端任务队列承载大规模搜索。

## 关键原则

- 规则只定义一次。
- UI 只展示规则结果，不实现规则本身。
- 成长引擎不依赖战斗引擎。
- 战斗引擎不依赖 UI。
- 顶层决策器只编排成长引擎和战斗引擎。
- 用户存储不污染计算核心。
- 每个核心 API 都要有明确输入输出类型。

## 本阶段完成标准

本阶段重构完成的判断标准：

- 前端不再直接调用散落的规则判断函数。
- `calculateGrowth`、`validateBuild`、`getTraitAvailability` 等核心 API 能被独立测试。
- 现有静态网页功能不退化。
- 规则数据有明确类型。
- 新增规则时优先改核心包，不需要同时改 UI 和计算两处。
- 至少有一组法拉路线和一组宏朝/圣子路线的回归测试。
