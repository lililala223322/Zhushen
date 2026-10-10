# 迷海寻宝模拟器

这是一个本地、可复现的迷海寻宝策略模拟与决策工具。它把“打开一个格子”作为唯一成本，目标是从0碎片达到至少600碎片；免费重置最多13次。网页端按批次实时重绘成本分布，命令行端负责阈值搜索、三模型正式评估和完整数据报告。

重要边界：M1、M2、M3都是对未知抽奖机制的假设，不代表已确认的游戏内部实现。推荐策略只称为“当前已搜索策略空间内最优”，不宣称全局最优。

## 快速开始

环境要求：Node.js 20或更新版本。

```powershell
npm install
npm run dev
```

浏览器打开终端显示的本地地址。生产构建和测试：

```powershell
npm run build
npm test
```

网页默认每完成10,000局更新一次。可以选择模型和多个策略，调整总局数、批次、目标、重置上限与种子，并暂停、继续或停止。最重要的图是“成本分布”：横轴是完成600碎片所需的操作1次数；“局数”视图显示恰好落入每个成本的频数，“累计概率”视图显示 `P(成本≤x)`，例如成本139处等于所有成本不超过139的概率之和；150竖线是全开基准。下方概率图只保留互补的尾部生存曲线 `P(成本>x)`，避免重复展示CDF。

“保存配置/载入配置”会把当前运行参数保存在该本地页面的浏览器存储中；它不写入主应用，也不会上传到网络。正式结果仍建议下载ZIP留档。

## 三种抽取假设

- M1（主模型）：仍有库存的类别保留完整展示权重，类别耗尽后移除并重新归一化。
- M2：每一份物品分别携带类别展示权重，类别总权重随剩余份数下降。
- M3：25份固定物品均匀洗牌。

M1用于搜索和主排序，M2/M3用于检查策略对机制误判是否敏感。若一个策略只在M1表现好，应在最终决策时降级看待。

## 内置策略

- `S01 optimized_threshold_v1`：完整分段进取策略；网页展示基础、四个剩余重置分段和近目标最高优先级分段。
- `S02 optimized_conservative_150`：S01的重置请求再与“最坏总成本不超过150”取AND。
- `S17 safe_credit_whitelist`：规则级150保底安全白名单。
- `S18 expected_gain_greedy_gap`：按当前/新地图下一抽期望有效碎片比较的概率贪心G0。
- `S03 reset_on_30`：同图取得30后请求重置。
- `full_clear`：每张地图全开；结果应恒为150。
- `reset_on_5`、`reset_on_15`：取得对应单种碎片后请求重置。
- AND组合：`reset_on_5_and_15`、`reset_on_5_and_30`、`reset_on_15_and_30`、`reset_on_all_fragments`；同图必须全部取得，顺序不限。
- OR组合：`reset_on_5_or_15`、`reset_on_5_or_30`、`reset_on_15_or_30`、`reset_on_any_fragment`；同图取得任意一种就触发。
- `S05 aggressive_threshold`：搜索前的固定8状态阈值，用于审计优化增益。
- `conservative_150`：S05的150次硬上限版本。

网页共开放18条策略，按“推荐与确定基线、概率与数学策略、单碎片、AND、OR、审计”分组。顶部“策略规则对照”默认加入S01、S18、S02、S05；任意策略都可以加入该对照。“概率策略三项”预设可直接同图运行S01、S18和全开基线。

所有策略还会经过可完成性护栏。若当前已有 `S` 碎片、重置前剩余 `R` 次重置，至少要满足：

```text
S + 100 × R >= 600
```

实现还会检查更精确的当前地图容量。策略不能为了降低均值而制造无法完成的局。

## 搜索进取策略

阈值优化器使用M1和共同随机地图，先搜索8种碎片状态的深度阈值，再搜索剩余重置次数分段及距目标1–100碎片的近目标分段。训练与验证使用不同种子；只有未参与调参的验证结果用于候选筛选。

默认搜索：

```powershell
npm run optimize
```

适合先验证流程的小规模命令：

```powershell
npm run optimize -- --train 2000 --validation 5000 --banded false --out results/optimization-smoke
```

较完整的可复现搜索：

```powershell
npm run optimize -- `
  --train 10000 `
  --validation 50000 `
  --train-seed mihai-policy-training-v1 `
  --validation-seed mihai-policy-validation-v1 `
  --rounds 1 `
  --step 2 `
  --top 6 `
  --banded true `
  --out results/optimization-v1
```

主要参数：

- `--train` / `--validation`：训练和独立验证局数。
- `--train-seed` / `--validation-seed`：必须互不相同。
- `--rounds`：每个步长的坐标下降轮数。
- `--step`：首轮搜索步长；随后自动补一步长1。
- `--top`：送入独立验证集的训练候选数。
- `--banded`：是否加入剩余重置和近目标分段。
- `--out`：输出目录。

优化目录包含：

- `optimized-policy.json`：可直接交给正式评估的冻结策略。
- `report.md`：玩家可读阈值表、训练/验证结果和相对30碎片基线的成对比较。
- `candidates.csv`、`search-history.json`：所有实际搜索候选。
- `validation-summary.csv`、`paired-vs-reset-on-30.csv`：独立验证证据。
- `optimization-metadata.json`：种子、样本量、搜索范围和耗时。

搜索阶段的均值较低不等于可靠胜出。优先查看验证集的“候选−基线”均值差；负数代表候选更省，且95%置信区间完全低于0时才可称为统计上可区分。

v1 评估过在线 rollout/近似动态规划方向，但未纳入推荐：完整库存状态维度很大，规则也难以手工执行；而已完成的正式补充测试显示，分段优化相对初始阈值只再节省0.047次，并略增加极端尾部。详细取舍见 `results/optimization-v1/report.md`。

## 80–180次操作定长考试

定长考试把问题从“达到600碎片需要多少次操作”改为“固定给出N次操作能取得多少碎片”。每局固定运行到180次，并在80–180的每个整数操作点记录碎片、重置、地图、护栏拦截和5/15/30奖励次数。达到600不会让考试提前结束。

这套考试评价的是去除目标后的策略采集核心：

- S01去除“距600还差1–100”的覆盖层，只保留碎片组合、深度与剩余重置分段。
- S02依赖600目标的150硬上限被移除，因此与S01核心相同，不重复当成独立策略。
- S05保留固定阈值 `[0,2,5,6,13,14,18,25]`。
- S16依赖600目标的150硬上限被移除，因此与S05核心相同，不重复当成独立策略。
- 主动重置还必须满足 `当前操作数 + 25 × 剩余重置数 ≥ 180`，保证仍有足够格子完成考试。

检查点在第N次奖励结算后、可能影响N+1的重置决定之前采集。因此全开策略在100/125/150/175次时应严格得到400/500/600/700碎片，方差为0；对应已实际影响成绩的重置数为3/4/5/6。

`reset_on_all_fragments`（集齐当前图的5、15、30后才重置）也有一个结构性保底：150次操作的基础碎片是300；每个提前结束或自然开完的地图都已经取得50奖励碎片，而150次操作至少覆盖6个这样的25格容量段，因此总碎片不会低于600。S01/S05核心没有这项150次硬保证；S02/S16原包装器的达标保障应回到原600碎片达标赛中评价。

默认运行M1/M2/M3和S01核心、S05、S03、全开：

```powershell
npm run exam
```

建议先用小样本确认配置和耗时：

```powershell
npm run exam -- `
  --episodes 1000 `
  --batch 100 `
  --models M1 `
  --strategies optimized_threshold_v1,aggressive_threshold,full_clear `
  --seed mihai-fixed-horizon-smoke-v1 `
  --out results/fixed-horizon-smoke
```

命令行参数：

- `--episodes`：每策略、每模型局数，默认100,000。
- `--batch`：控制台进度更新间隔，默认10,000；不改变随机结果。
- `--models`：逗号分隔的M1/M2/M3。
- `--strategies`：逗号分隔的策略ID；S02/S16可以输入，但会明确投影到S01/S05核心。
- `--baseline`：配对碎片差的基线，必须包含在策略列表中；默认优先S05，其次全开。
- `--seed`：可复现主种子。
- `--out`：输出目录。

每次完成后输出：

- `exam-metadata.json/csv`：模型、种子、样本量、别名投影、检查点时机、考试护栏和完整命令。
- `exam-snapshot.json`：一次性保存全部曲线、条件统计和配对结果。
- `exam-operation-curve.json/csv`：每个操作点的碎片均值、方差、置信区间、分位数、达到600概率、重置和奖励统计。
- `exam-fragments-by-reset.json/csv`：按“操作次数×已用重置数”分组的样本量、状态概率、碎片均值和方差。
- `exam-paired-vs-baseline.json/csv`：同一底层地图序列下相对基线的逐点配对碎片差、置信区间和胜平负。
- `exam-fragment-histograms.csv`：每个操作点的完整碎片概率与累计概率分布。
- `exam-reset-distributions.csv`：每个操作点的完整重置次数概率与累计概率分布。
- `exam-paired-difference-histograms.csv`：候选相对基线的完整配对碎片差分布。
- `exam-strategy-aliases.json`：S02→S01核心、S16→S05核心等投影，防止把重复曲线误当成独立证据。
- `exam-report.md`：80/100/120/140/150/160/180关键检查点的跨策略排名。

配对差定义为“候选碎片−基线碎片”，正值更好。条件热力图 `E[碎片 | 重置次数]` 是观察性统计：取得好奖励也会促使策略重置，不能把组间差异直接解释为多重置一次的因果收益。定长考试用于解释策略效率，不能替代原来的600碎片达标赛。

本次已完成的广覆盖探索、独立种子确认和可直接用于决策的摘要见：

- `results/fixed-horizon-exploration-v1/`
- `results/fixed-horizon-confirmation-v1/`
- `results/fixed-horizon-decision-v1.md`

## 正式三模型评估

不加载搜索结果时，默认评估全开、30碎片基线、内置进取阈值和保守150版：

```powershell
npm run formal
```

加载已冻结的优化策略时：

```powershell
npm run formal -- `
  --policy results/optimization-v1/optimized-policy.json `
  --episodes 1000000 `
  --batch 10000 `
  --models M1,M2,M3 `
  --strategies full_clear,reset_on_30,optimized,optimized_conservative_150 `
  --seed mihai-independent-formal-test-v1 `
  --out results/formal-v1
```

正式 runner 支持：

- `--episodes`：每策略、每模型局数，默认1,000,000。
- `--batch`：收敛快照与进度更新间隔，默认10,000。
- `--models`：逗号分隔的M1/M2/M3。
- `--strategies`：逗号分隔的策略ID。
- `--seed`：独立正式测试主种子。
- `--policy`：优化器输出的策略JSON。
- `--target`：目标碎片，默认600。
- `--max-resets`：重置上限，默认13。
- `--out`：结果目录。

同一模型、同一局编号下，各策略共享完整底层地图序列：

```text
mapSeed = hash(masterSeed, episodeIndex, mapIndex, modelId)
```

因此成对差值不会混入“两个策略恰好抽到不同地图”的额外噪声。批次大小不会改变最终抽取结果。

低于1,000,000局的命令仍可用于冒烟或性能测试，但 `run-metadata.json` 会把它标记为 `validation`，且 `meetsFormalSampleRequirement=false`。它不能替代goal要求的正式证据。

## 结果文件

每次正式运行至少输出：

- `run-metadata.json`：版本、提交、运行时、种子、模型、策略、样本量、批次和完整命令。
- `summary.csv` / `summary.json`：所有核心统计及收敛快照。
- `cost-histogram.csv`：整数成本的精确计数和概率。
- `cdf.csv`：`P(N≤x)`及生存概率`P(N>x)`。
- `reset-histogram.csv`：0–13次重置分布。
- `map-count-histogram.csv`：完成时使用地图数分布。
- `overflow-histogram.csv`：最终超过600的碎片量。
- `fragment-acquisition.csv`：5/15/30奖获取次数分布，以及低成本分段的平均获取次数。
- `cost-reset-heatmap.csv`：成本×重置次数联合分布。
- `paired-comparisons.csv`：主策略相对每个基线的成对差值、置信区间和胜平负。
- `paired-difference-histogram.csv`：成对成本差的完整分布。
- `convergence.csv`：每批次均值、置信区间和关键分位数。
- `policy-definition.json` / `model-definition.json`：可复现定义。
- `report.md`：直接面向最终决策的中文报告。
- `charts/*.svg`：各模型成本分布、均值收敛和主策略模型敏感性图。

`results/`已被Git忽略，避免把大批运行产物误提交。需要长期保存时，请连同元数据和策略JSON一起归档。

## 怎么读数据并做决定

建议按以下顺序：

1. 先检查所有策略失败率是否严格为0；有失败局的策略直接淘汰。
2. 用M1均值做主排序，但不要只看点估计。
3. 查看候选相对 `reset_on_30` 和 `full_clear` 的成对均值差及95%置信区间。
4. 查看P95、P99、CVaR95、CVaR99和超过150/155/160次的概率，理解倒霉尾部。
5. 比较进取版与保守150版：前者通常均值更低，后者限制最坏成本。
6. 比较同一策略在M1/M2/M3的均值、P95和P99；机制假设改变后明显恶化意味着模型风险较高。
7. 最后查看 `policy-definition.json` 的玩家规则，确认实际游戏中能可靠记录并执行。

指标约定：

- 均值95%置信区间只表示蒙特卡洛抽样误差，不包含“模型猜错”的误差。
- P95表示95%的局会在该成本以内完成。
- CVaR95是成本最高5%局的平均值，比单个观察最大值稳定。
- 成对差值定义为“候选成本−基线成本”；负值代表候选节省。
- 胜率指同一底层地图序列下候选成本更低的比例。

如果两个候选均值差小于0.1次，且差值95%置信区间跨0，应报告“当前样本无法区分”，或增加正式样本，而不是凭点估计宣布胜负。

## 可复现性与限制

- PRNG、版本、主种子和派生规则都写入运行元数据。
- 每局、每张地图独立派生种子；策略ID不进入地图种子。
- 训练、验证、正式测试默认使用三个不同的命名种子。
- 改变批次、暂停/继续或图表刷新频率不应改变最终结果。
- 非碎片奖励价值未计入；操作2按零成本处理。
- 工具不逆向游戏客户端，也不声称识别了真实抽奖算法。

遇到正式结果与 `goal.md` 中前期回归量级相差约0.3次以上时，先运行完整测试，并检查模型、重复物品权重、重置计数、达到600后的停止点及可完成性护栏。
