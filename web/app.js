(function () {
  const data = window.RULE_DATA;
  const calc = window.GrowthCalc;
  const core = window.ZhushenCore;
  const storageKey = "hongchao-growth-build-v2";
  const roleTemplateKey = "hongchao-role-templates-v1";
  const roleTemplateDraftNameKey = "hongchao-role-template-draft-v1";
  const fallbackWeaponTypes = [
    "刀", "刺剑", "匕首", "单手剑", "单手斧", "单手锤", "双手剑", "双手斧", "双手杖",
    "弩", "战旗", "权杖", "枪", "琴", "瓶子", "短弓", "重弩", "链锤", "长弓", "长柄", "骑枪",
  ];
  const fallbackArmorTypes = ["布甲", "板甲", "皮甲", "链甲"];

  function zeroVector() {
    return Object.fromEntries(data.stats.map((stat) => [stat, 0]));
  }

  function cloneStatVector(source) {
    return Object.assign(zeroVector(), source || {});
  }

  function heirloomStatOrder() {
    return ["strength", "technique", "agility", "constitution", "perception", "will"]
      .filter((stat) => data.stats.includes(stat));
  }

  function clampHeirloomLevel(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(120, number));
  }

  function createDefaultHeirloomState(characterPotential, className) {
    const classNames = Object.keys(data.classGrowth);
    const fallbackClass = data.classGrowth[className] ? className : classNames[0];
    return {
      characterPotential: cloneStatVector(characterPotential),
      className: fallbackClass,
      level: 60,
    };
  }

  function createDefaultPlannerState() {
    return {
      gearSets: [
        {
          id: "gear-will",
          name: "意志套",
          primaryStats: ["will", "perception"],
          weapon: { type: "权杖", stats: Object.assign(zeroVector(), { will: 35, perception: 10 }) },
          armor: { type: "板甲", stats: Object.assign(zeroVector(), { will: 20, perception: 5 }) },
        },
        {
          id: "gear-perception",
          name: "感知套",
          primaryStats: ["perception", "will"],
          weapon: { type: "短弓", stats: Object.assign(zeroVector(), { perception: 40, will: 5 }) },
          armor: { type: "布甲", stats: Object.assign(zeroVector(), { perception: 15, will: 5 }) },
        },
      ],
      targets: [
        { id: "target-will", name: "信仰唤醒4", stat: "will", value: 90, groupId: "" },
      ],
      coreStats: ["strength", "technique", "agility"],
    };
  }

  function createDefaultLimitState() {
    return {
      sampleCount: 24,
      seed: 20260623,
      evaluationRound: 0,
      lastDurationMs: 0,
      equipmentWeight: 0,
      constraints: [],
      targetWeights: Object.assign(zeroVector(), { strength: 0.5, technique: 1, agility: 1 }),
      selectedTemplateIds: [],
      result: null,
      history: [],
    };
  }

  function createDefaultState() {
    const base = {
      sex: "女",
      level: 150,
      bloodlines: [
        { race: "法拉希尔血裔", percent: 80 },
      ],
      growthSegments: [
        { fromLevel: 1, toLevel: 150, className: "丛林猎手" },
      ],
      currentState: {
        enabled: false,
        collapsed: true,
        currentLevel: 1,
        className: "丛林猎手",
        stats: zeroVector(),
      },
      injectedPotential: zeroVector(),
      basicPotentialCollapsed: false,
      injectedPotentialCollapsed: true,
      traitsCollapsed: true,
      traitIds: ["divine-fala", "fala-bird", "fala-forest-heir", "m-fala-nature-spirit"],
      collapsedGroups: [],
      breakdownCollapsed: true,
      equipmentStats: zeroVector(),
      finalClass: "掠袭骑兵",
      planner: createDefaultPlannerState(),
      limitEvaluator: createDefaultLimitState(),
    };
    base.characterPotential = calc.calculateBasePotential(base);
    base.heirloom = createDefaultHeirloomState(base.characterPotential, base.finalClass);
    return base;
  }

  let state = loadState() || createDefaultState();
  let activeView = "calculator";
  let roleTemplates = loadRoleTemplates();
  let roleTemplateDraftName = loadRoleTemplateDraftName();
  sanitizeTraits();

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return normalizeState(JSON.parse(raw));

      const oldRaw = localStorage.getItem("hongchao-growth-build-v1");
      return oldRaw ? normalizeState(JSON.parse(oldRaw)) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    writeStateSnapshot();
    flashStatus("已保存");
  }

  function stateSnapshot() {
    return Object.assign({}, state, {
      limitEvaluator: Object.assign({}, state.limitEvaluator, { result: null, history: [] }),
    });
  }

  function writeStateSnapshot() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(stateSnapshot()));
      saveRoleTemplateDraftName();
    } catch {
      // Local storage can be unavailable in private or restricted browser modes.
    }
  }

  let rememberTimer = 0;

  function rememberStateSoon() {
    if (rememberTimer) return;
    rememberTimer = window.setTimeout(() => {
      rememberTimer = 0;
      writeStateSnapshot();
    }, 0);
  }

  function loadRoleTemplates() {
    try {
      const raw = localStorage.getItem(roleTemplateKey);
      return normalizeRoleTemplates(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  }

  function saveRoleTemplates() {
    localStorage.setItem(roleTemplateKey, JSON.stringify(roleTemplates));
  }

  function loadRoleTemplateDraftName() {
    try {
      return String(localStorage.getItem(roleTemplateDraftNameKey) || "");
    } catch {
      return "";
    }
  }

  function saveRoleTemplateDraftName() {
    try {
      localStorage.setItem(roleTemplateDraftNameKey, roleTemplateDraftName);
    } catch {
      // Local storage can be unavailable in private or restricted browser modes.
    }
  }

  function normalizeRoleTemplates(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item, index) => ({
        id: String(item.id || `role-${Date.now()}-${index}`),
        name: String(item.name || `角色 ${index + 1}`).trim(),
        sex: item.sex === "男" || item.sex === "女" ? item.sex : "女",
        bloodlines: normalizeBloodlines(item.bloodlines),
        traitIds: Array.isArray(item.traitIds)
          ? item.traitIds.filter((id, idIndex, array) => data.traits.some((trait) => trait.id === id) && array.indexOf(id) === idIndex)
          : [],
      }))
      .filter((item) => item.name && item.bloodlines.length);
  }

  function normalizeState(value) {
    const fallback = createDefaultState();
    const sex = value?.sex === "男" || value?.sex === "女" ? value.sex : fallback.sex;
    const bloodlines = normalizeBloodlines(value?.bloodlines, value?.race);
    const normalized = {
      sex,
      level: Number(value?.level) || fallback.level,
      bloodlines,
      currentState: normalizeCurrentState(value?.currentState, fallback.currentState),
      injectedPotential: Object.assign(zeroVector(), value?.injectedPotential || {}),
      basicPotentialCollapsed: Boolean(value?.basicPotentialCollapsed),
      injectedPotentialCollapsed: value?.injectedPotentialCollapsed === undefined ? fallback.injectedPotentialCollapsed : Boolean(value.injectedPotentialCollapsed),
      traitsCollapsed: value?.traitsCollapsed === undefined ? fallback.traitsCollapsed : Boolean(value.traitsCollapsed),
      growthSegments: Array.isArray(value?.growthSegments) && value.growthSegments.length
        ? value.growthSegments.map((segment) => ({
          fromLevel: Number(segment.fromLevel) || 1,
          toLevel: Number(segment.toLevel) || 1,
          className: data.classGrowth[segment.className] ? segment.className : Object.keys(data.classGrowth)[0],
        }))
        : fallback.growthSegments,
      traitIds: Array.isArray(value?.traitIds)
        ? value.traitIds.filter((id) => data.traits.some((trait) => trait.id === id))
        : fallback.traitIds,
      collapsedGroups: Array.isArray(value?.collapsedGroups) ? value.collapsedGroups : [],
      breakdownCollapsed: value?.breakdownCollapsed !== false,
      equipmentStats: Object.assign(zeroVector(), value?.equipmentStats || {}),
      finalClass: data.classValues[value?.finalClass] ? value.finalClass : fallback.finalClass,
      planner: normalizePlannerState(value?.planner, fallback.planner),
      limitEvaluator: normalizeLimitState(value?.limitEvaluator, fallback.limitEvaluator),
    };
    normalized.characterPotential = Object.assign(
      zeroVector(),
      value?.characterPotential || calc.calculateBasePotential(normalized)
    );
    normalized.heirloom = normalizeHeirloomState(value?.heirloom, fallback.heirloom);
    return normalized;
  }

  function normalizeHeirloomState(value, fallback) {
    const classNames = Object.keys(data.classGrowth);
    const fallbackClass = fallback?.className && data.classGrowth[fallback.className] ? fallback.className : classNames[0];
    const levelSource = value?.level === undefined ? fallback?.level : value.level;
    return {
      characterPotential: cloneStatVector(value?.characterPotential || fallback?.characterPotential),
      className: data.classGrowth[value?.className] ? value.className : fallbackClass,
      level: clampHeirloomLevel(levelSource),
    };
  }

  function normalizeLimitState(value, fallback) {
    const targetWeights = Object.assign(zeroVector(), value?.targetWeights || fallback.targetWeights);
    return {
      sampleCount: Math.max(1, Math.min(200, Number(value?.sampleCount) || fallback.sampleCount)),
      seed: Number(value?.seed) || fallback.seed,
      evaluationRound: Math.max(0, Number(value?.evaluationRound) || 0),
      lastDurationMs: Math.max(0, Number(value?.lastDurationMs) || 0),
      equipmentWeight: Math.max(0, Number(value?.equipmentWeight) || 0),
      constraints: normalizeLimitConstraints(value?.constraints || fallback.constraints),
      targetWeights,
      selectedTemplateIds: Array.isArray(value?.selectedTemplateIds) ? value.selectedTemplateIds.map(String) : [],
      result: null,
      history: [],
    };
  }

  function normalizeLimitConstraints(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows
      .map((row, index) => ({
        id: String(row?.id || `constraint-${Date.now()}-${index}`),
        stat: data.stats.includes(row?.stat) ? row.stat : "will",
        value: Math.max(0, Number(row?.value) || 0),
        label: String(row?.label || row?.name || "").trim(),
      }));
  }

  function normalizePlannerState(value, fallback) {
    const allowedStats = data.stats;
    const targets = Array.isArray(value?.targets) && value.targets.length
      ? value.targets.map((target, index) => ({
        id: target.id || `target-${Date.now()}-${index}`,
        name: String(target.name || "").trim(),
        stat: allowedStats.includes(target.stat) ? target.stat : "will",
        value: Number(target.value) || 90,
        groupId: String(target.groupId || "").trim(),
      })).filter((target) => target.value > 0)
      : fallback.targets;
    return {
      gearSets: normalizeGearSets(value?.gearSets, fallback.gearSets),
      targets: targets.length ? targets : fallback.targets,
      coreStats: normalizeCoreStats(value, fallback.coreStats),
    };
  }

  function normalizeCurrentState(value, fallback) {
    return {
      enabled: Boolean(value?.enabled),
      collapsed: value?.collapsed === undefined ? fallback.collapsed : Boolean(value.collapsed),
      currentLevel: Number(value?.currentLevel) || fallback.currentLevel,
      className: data.classValues[value?.className] ? value.className : fallback.className,
      stats: Object.assign(zeroVector(), value?.stats || {}),
    };
  }

  function normalizeCoreStats(value, fallback) {
    if (Array.isArray(value?.coreStats)) {
      const selected = value.coreStats.filter((stat, index, array) => data.stats.includes(stat) && array.indexOf(stat) === index);
      return selected.length ? selected : fallback;
    }
    if (value?.coreWeights) {
      const selected = data.stats.filter((stat) => Number(value.coreWeights[stat]) > 0);
      return selected.length ? selected : fallback;
    }
    return fallback;
  }

  function normalizeGearSets(input, fallback) {
    const rows = Array.isArray(input) && input.length ? input : fallback;
    return rows.map((gear, index) => ({
      id: gear.id || `gear-${Date.now()}-${index}`,
      name: String(gear.name || `套装 ${index + 1}`).trim(),
      primaryStats: (Array.isArray(gear.primaryStats) ? gear.primaryStats : [])
        .filter((stat, itemIndex, array) => data.stats.includes(stat) && array.indexOf(stat) === itemIndex)
        .slice(0, 2),
      weapon: {
        type: weaponTypes().includes(gear.weapon?.type) ? gear.weapon.type : weaponTypes()[0],
        stats: Object.assign(zeroVector(), gear.weapon?.stats || {}),
      },
      armor: {
        type: armorTypes().includes(gear.armor?.type) ? gear.armor.type : armorTypes()[0],
        stats: Object.assign(zeroVector(), gear.armor?.stats || {}),
      },
    }));
  }

  function normalizeBloodlines(inputRows, oldRace) {
    const allowed = selectableBloodlineRaces();
    if (Array.isArray(inputRows) && inputRows.length) {
      const normalized = inputRows
        .map((row) => ({
          race: allowed.includes(row.race) ? row.race : allowed[0],
          percent: clampToBloodlineStep(row.percent),
        }))
        .filter((row) => row.percent > 0);
      return normalized.length ? normalized : createDefaultState().bloodlines;
    }
    if (oldRace && allowed.includes(oldRace)) {
      return [{ race: oldRace, percent: 100 }];
    }
    return createDefaultState().bloodlines;
  }

  function selectableBloodlineRaces() {
    return Object.keys(data.races).filter((race) => race !== data.commonerRace);
  }

  function clampToBloodlineStep(value) {
    const number = Number(value) || 0;
    return Math.max(0, Math.min(100, Math.round(number / 10) * 10));
  }

  function sortGrowthSegments() {
    state.growthSegments.sort((a, b) => (
      (Number(a.fromLevel) || 0) - (Number(b.fromLevel) || 0)
      || (Number(a.toLevel) || 0) - (Number(b.toLevel) || 0)
      || String(a.className).localeCompare(String(b.className), "zh-CN")
    ));
  }

  function segmentIssues() {
    const issues = state.growthSegments.map(() => []);
    const minLevel = state.currentState.enabled ? Number(state.currentState.currentLevel || 0) + 1 : 1;
    const rows = state.growthSegments
      .map((segment, index) => ({
        index,
        from: Number(segment.fromLevel) || 0,
        to: Number(segment.toLevel) || 0,
      }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    rows.forEach((row) => {
      if (row.from < 1 || row.to < 1 || row.from > row.to) {
        issues[row.index].push("等级区间无效");
      }
      if (row.from < minLevel) {
        issues[row.index].push(`低于可规划最低等级 ${minLevel}`);
      }
      if (row.to > Number(state.level || 0)) {
        issues[row.index].push(`超过目标等级 ${state.level}`);
      }
    });
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (current.from <= previous.to) {
        issues[previous.index].push(`与 ${current.from}-${current.to} 重叠`);
        issues[current.index].push(`与 ${previous.from}-${previous.to} 重叠`);
      }
    }
    return issues;
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function optionList(items, selected) {
    return items.map((item) => optionTag(item, selected)).join("");
  }

  function optionTag(value, selected, label) {
    return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label || value)}</option>`;
  }

  function statShortLabel(stat) {
    return {
      strength: "力",
      technique: "技",
      agility: "敏",
      constitution: "体",
      perception: "感",
      will: "意",
    }[stat] || data.statLabels[stat] || stat;
  }

  function classGrowthLabel(className) {
    const growth = data.classGrowth?.[className];
    if (!growth) return className;
    const parts = heirloomStatOrder()
      .filter((stat) => Math.abs(Number(growth[stat]) || 0) > 1e-9)
      .map((stat) => `${statShortLabel(stat)}${calc.formatNumber(growth[stat], 2)}`);
    return parts.length ? `${className}（${parts.join(" ")}）` : className;
  }

  function classValueLabel(className) {
    const values = data.classValues?.[className];
    if (!values) return className;
    const parts = heirloomStatOrder()
      .filter((stat) => Math.abs(Number(values[stat]) || 0) > 1e-9)
      .map((stat) => `${statShortLabel(stat)}${calc.formatNumber(values[stat], 2)}`);
    return parts.length ? `${className}（${parts.join(" ")}）` : className;
  }

  function classOptionLabel(className, mode) {
    return mode === "values" ? classValueLabel(className) : classGrowthLabel(className);
  }

  function classOptionList(items, selected, mode = "growth") {
    const groups = core.groupClassesByCategory(items);
    if (groups?.length) {
      return groups.map((category) => `<optgroup label="${category.label}" class="class-group-${category.color}">
        ${category.availableClasses.map((className) => optionTag(className, selected, classOptionLabel(className, mode))).join("")}
      </optgroup>`).join("");
    }
    return items.map((className) => optionTag(className, selected, classOptionLabel(className, mode))).join("");
  }

  function statOptionList(selected) {
    return data.stats
      .map((stat) => `<option value="${stat}" ${stat === selected ? "selected" : ""}>${data.statLabels[stat]}</option>`)
      .join("");
  }

  function renderAddListButton(action, label) {
    return `
      <button type="button" class="add-list-card" data-action="${action}" aria-label="${label}" title="${label}">
        <span>+</span>
      </button>
    `;
  }

  function weaponTypes() {
    const types = [...new Set(Object.values(data.classEquipment || {}).flatMap((item) => item.weapons || []))].sort();
    return types.length ? types : fallbackWeaponTypes;
  }

  function armorTypes() {
    const types = [...new Set(Object.values(data.classEquipment || {}).map((item) => item.armor).filter(Boolean))].sort();
    return types.length ? types : fallbackArmorTypes;
  }

  function percentOptionList(selected) {
    const values = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);
    return values.map((value) => `<option value="${value}" ${value === Number(selected) ? "selected" : ""}>${value}%</option>`).join("");
  }

  function numberInput(value, attrs) {
    return `<input type="number" step="0.0001" value="${calc.formatNumber(value, 4)}" ${attrs}>`;
  }

  function groupKey(type, race) {
    return `${type}:${race}`;
  }

  function isGroupCollapsed(type, race) {
    return state.collapsedGroups.includes(groupKey(type, race));
  }

  function toggleGroupCollapsed(type, race) {
    const key = groupKey(type, race);
    state.collapsedGroups = state.collapsedGroups.includes(key)
      ? state.collapsedGroups.filter((item) => item !== key)
      : [...state.collapsedGroups, key];
  }

  function render() {
    renderShell();
    if (activeView === "planner") {
      renderPlanner();
      return;
    }
    if (activeView === "limit") {
      renderLimitEvaluator();
      return;
    }
    if (activeView === "heirloom") {
      renderHeirloom();
      return;
    }
    renderBasics();
    renderGrowthPlan();
    renderCurrentState();
    renderEquipment();
    renderResults();
  }

  function renderShell() {
    const isPlanner = activeView === "planner";
    const isLimit = activeView === "limit";
    const isHeirloom = activeView === "heirloom";
    const isCalculator = !isPlanner && !isLimit && !isHeirloom;
    const title = isLimit ? "构筑上限评估" : isPlanner ? "成长规划" : isHeirloom ? "传家宝计算" : "成长计算器";
    const subtitle = isLimit
      ? "血脉与神子组合强度比较"
      : isPlanner
        ? "技能门槛与成长路线调整"
        : isHeirloom
          ? "角色成长与职业成长加权分配"
          : "常态属性与战斗属性";
    $("#app").innerHTML = `
      <header class="topbar">
        <div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <div class="topbar-actions">
          <span id="statusText" class="status-text"></span>
        </div>
      </header>
      <main class="workspace ${isCalculator ? "" : "planner-workspace"}">
        <aside class="rail">
          <div class="rail-mark">成</div>
          <button class="rail-button ${isCalculator ? "active" : ""}" data-action="set-view" data-view="calculator">属性</button>
          <button class="rail-button ${isPlanner ? "active" : ""}" data-action="set-view" data-view="planner">规划</button>
          <button class="rail-button ${isHeirloom ? "active" : ""}" data-action="set-view" data-view="heirloom">传家宝</button>
          <button class="rail-button ${isLimit ? "active" : ""}" data-action="set-view" data-view="limit">上限</button>
          ${isCalculator ? `
            <div class="rail-divider"></div>
            <a href="#basicPanel">基础</a>
            <a href="#growthPanel">成长</a>
            <a href="#currentPanel">当前</a>
            <a href="#resultPanel">结果</a>
          ` : ""}
        </aside>
        ${isPlanner ? `
          <section class="planner-column">
            <section id="plannerPanel" class="panel"></section>
          </section>
        ` : isLimit ? `
          <section class="limit-column">
            <section id="limitPanel" class="panel"></section>
          </section>
        ` : isHeirloom ? `
          <section class="heirloom-column">
            <section id="heirloomPanel" class="panel"></section>
          </section>
        ` : `
          <section class="input-column">
            <section id="basicPanel" class="panel"></section>
            <section id="growthPanel" class="panel"></section>
            <section id="currentPanel" class="panel"></section>
            <section id="gearPanel" class="panel"></section>
          </section>
          <section id="resultPanel" class="result-column"></section>
        `}
      </main>
    `;
  }

  function renderBasics() {
    const potentialLimit = calc.calculateBasePotential(state);
    const summary = calc.bloodlineSummary(state);
    const total = calc.bloodlineTotal(state);
    const autoFill = summary.find((row) => row.autoFilled);
    const basicCollapsed = state.basicPotentialCollapsed === true;
    const injectedCollapsed = state.injectedPotentialCollapsed !== false;
    $("#basicPanel").innerHTML = `
      <div class="panel-heading">
        <h2>角色基础</h2>
        <div class="panel-actions">
          <button class="small-button" data-action="apply-limit">套用上限</button>
        </div>
      </div>
      <div class="form-grid compact">
        <label>
          <span>性别</span>
          <select data-field="sex">${optionList(["女", "男"], state.sex)}</select>
        </label>
        <div class="bloodline-total ${total > 100 ? "invalid" : ""}">
          <span>血脉合计</span>
          <strong>${total}%</strong>
          <small>${autoFill ? `自动补 ${autoFill.percent}% 平民血脉` : "未补平民血脉"}</small>
        </div>
      </div>
      <div class="bloodline-list">
        ${state.bloodlines.map((row, index) => renderBloodlineRow(row, index)).join("")}
        ${renderAddListButton("add-bloodline", "添加血脉")}
      </div>
      <div class="weighted-note">
        加权结果是当前角色潜力上限；实际角色潜力可低于上限并会参与最终计算。
      </div>
      <div class="basic-stat-sections">
        <section class="basic-stat-box">
          <div class="subsection-heading">
            <h3>基础潜力</h3>
            <button class="small-button" data-action="toggle-basic-potential">${basicCollapsed ? "展开" : "收起"}</button>
          </div>
          ${basicCollapsed ? "<p class=\"folded-note\">基础潜力已收起；这里填写实际角色潜力。</p>" : `
            <div class="stat-grid">
              ${data.stats.map((stat) => renderPotentialField(stat, potentialLimit)).join("")}
            </div>
          `}
        </section>
        <section class="basic-stat-box">
        <div class="subsection-heading">
          <h3>注入后潜力</h3>
          <div class="panel-actions">
            <button class="small-button" data-action="apply-injected-potential">反推基础成长</button>
            <button class="small-button" data-action="toggle-injected-potential">${injectedCollapsed ? "展开" : "收起"}</button>
          </div>
        </div>
        ${injectedCollapsed ? "<p class=\"folded-note\">注入后潜力已收起；展开后可填写注入神力后的成长值。</p>" : `
          <div class="weighted-note">
            填写注入神力后的六维成长值；系统会扣除已选择神技与神子/圣子特性的成长修正，并写回基础潜力。
          </div>
          <div class="stat-grid">
            ${data.stats.map((stat) => `
              <label class="stat-field">
                <span>${data.statLabels[stat]}</span>
                ${numberInput(state.injectedPotential?.[stat] || 0, `data-injected-potential="${stat}"`)}
                <small>注入后成长值</small>
              </label>
            `).join("")}
          </div>
        `}
        </section>
      </div>
      <div class="role-save-row">
        <label>
          <span>角色模板名</span>
          <input type="text" value="${escapeHtml(roleTemplateDraftName || defaultRoleTemplateName())}" data-role-template-name>
        </label>
        <button class="small-button" data-action="save-role-template">保存角色</button>
        <small>已保存 ${roleTemplates.length} 个角色模板，可在“上限”页批量评估。</small>
      </div>
      <section id="traitSubPanel" class="trait-subpanel"></section>
    `;
    renderTraits();
  }

  function potentialHint(stat, potentialLimit) {
    const limit = Number(potentialLimit[stat]) || 0;
    const actual = Number(state.characterPotential[stat]) || 0;
    const over = actual > limit + 1e-9;
    return {
      over,
      text: over ? `超过上限 ${calc.formatNumber(limit, 4)}` : `加权上限 ${calc.formatNumber(limit, 4)}`,
    };
  }

  function renderPotentialField(stat, potentialLimit) {
    const hint = potentialHint(stat, potentialLimit);
    return `
      <label class="stat-field">
        <span>${data.statLabels[stat]}</span>
        ${numberInput(state.characterPotential[stat], `data-potential="${stat}"`)}
        <small data-potential-hint="${stat}" class="${hint.over ? "field-warning" : ""}">${hint.text}</small>
      </label>
    `;
  }

  function updatePotentialHints() {
    const potentialLimit = calc.calculateBasePotential(state);
    data.stats.forEach((stat) => {
      const node = document.querySelector(`[data-potential-hint="${stat}"]`);
      if (!node) return;
      const hint = potentialHint(stat, potentialLimit);
      node.textContent = hint.text;
      node.classList.toggle("field-warning", hint.over);
    });
  }

  function renderCurrentState() {
    const classNames = Object.keys(data.classValues);
    const collapsed = state.currentState.collapsed !== false;
    $("#currentPanel").innerHTML = `
      <div class="panel-heading">
        <h2>当前状态</h2>
        <div class="panel-actions">
          <label class="inline-toggle">
            <input type="checkbox" data-current-enabled ${state.currentState.enabled ? "checked" : ""}>
            <span>作为规划起点</span>
          </label>
          <button class="small-button" data-action="toggle-current-panel">${collapsed ? "展开" : "收起"}</button>
        </div>
      </div>
      ${collapsed ? "<p class=\"folded-note\">当前状态默认收起；启用后会作为成长规划起点参与反推。</p>" : `
      <div class="weighted-note">
        六维请填写脱下装备后的面板数值；系统会剥离乘区、特性值和当前职业值，反推出当前已有成长值。
      </div>
      <div class="form-grid compact">
        <label>
          <span>当前等级</span>
          <input type="number" min="1" max="999" step="1" value="${state.currentState.currentLevel}" data-current-field="currentLevel">
        </label>
        <label>
          <span>当前职业</span>
          <select data-current-field="className">${classOptionList(classNames, state.currentState.className)}</select>
        </label>
      </div>
      <div class="stat-grid">
        ${data.stats.map((stat) => `
          <label class="stat-field">
            <span>${data.statLabels[stat]}</span>
            ${numberInput(state.currentState.stats[stat], `data-current-stat="${stat}"`)}
            <small>脱装后面板值</small>
          </label>
        `).join("")}
      </div>
      `}
    `;
  }

  function renderBloodlineRow(row, index) {
    return `
      <div class="bloodline-row">
        <label>
          <span>血脉种族</span>
          <select data-bloodline="${index}" data-bloodline-field="race">
            ${optionList(selectableBloodlineRaces(), row.race)}
          </select>
        </label>
        <label>
          <span>百分比</span>
          <select data-bloodline="${index}" data-bloodline-field="percent">
            ${percentOptionList(row.percent)}
          </select>
        </label>
        <button class="icon-button" title="删除血脉" data-action="remove-bloodline" data-index="${index}">×</button>
      </div>
    `;
  }

  function renderGrowthPlan() {
    sortGrowthSegments();
    const classNames = Object.keys(data.classGrowth);
    const issues = segmentIssues();
    $("#growthPanel").innerHTML = `
      <div class="panel-heading">
        <h2>成长路线</h2>
      </div>
      <div class="form-grid compact growth-meta">
        <label>
          <span>目标等级</span>
          <input type="number" min="1" max="999" step="1" data-field="level" value="${state.level}">
        </label>
        <div class="weighted-note">
          成长区间会按起始等级自动排序；任意两段区间不可重叠。启用当前状态后，区间需从当前等级之后开始。
        </div>
      </div>
      <div class="segment-list">
        ${state.growthSegments.map((segment, index) => renderSegmentRow(segment, index, classNames, issues[index])).join("")}
        ${renderAddListButton("add-segment", "添加成长区间")}
      </div>
    `;
  }

  function renderSegmentRow(segment, index, classNames, issues) {
    const hasIssue = Array.isArray(issues) && issues.length > 0;
    const minLevel = state.currentState.enabled ? Number(state.currentState.currentLevel || 0) + 1 : 1;
    return `
      <div class="segment-row ${hasIssue ? "segment-invalid" : ""}">
        <label>
          <span>从</span>
          <input type="number" min="${minLevel}" step="1" value="${segment.fromLevel}" data-segment="${index}" data-segment-field="fromLevel">
        </label>
        <label>
          <span>到</span>
          <input type="number" min="1" step="1" value="${segment.toLevel}" data-segment="${index}" data-segment-field="toLevel">
        </label>
        <label class="wide">
          <span>职业成长</span>
          <select data-segment="${index}" data-segment-field="className">${classOptionList(classNames, segment.className)}</select>
        </label>
        <button class="icon-button" title="删除区间" data-action="remove-segment" data-index="${index}">×</button>
        ${hasIssue ? `<div class="segment-warning">${issues.join("；")}</div>` : ""}
      </div>
    `;
  }

  function renderHeirloom() {
    const panel = $("#heirloomPanel");
    const result = calc.calculateHeirloomAttributes(state.heirloom);
    const classNames = Object.keys(data.classGrowth);
    const selectedLabel = result.level < 20 ? "2 项" : "3 项";
    const totalAllocated = result.selectedAllocations.reduce((sum, item) => sum + item.value, 0);
    panel.innerHTML = `
      <div class="panel-heading">
        <h2>传家宝</h2>
        <div class="panel-actions">
          <button class="small-button" data-action="apply-heirloom-from-current">套用角色基础</button>
        </div>
      </div>
      <div class="heirloom-layout">
        <section class="heirloom-block">
          <div class="form-grid compact heirloom-meta">
            <label>
              <span>目标职业</span>
              <select data-heirloom-field="className">${classOptionList(classNames, state.heirloom.className)}</select>
            </label>
            <label>
              <span>传家宝等级</span>
              <input type="number" min="0" max="120" step="1" value="${calc.formatNumber(state.heirloom.level, 0)}" data-heirloom-field="level">
            </label>
            <div class="heirloom-mode">
              <span>属性数量</span>
              <strong>${selectedLabel}</strong>
              <small>${result.level < 20 ? "低于 20 级" : "20 级及以上"}</small>
            </div>
          </div>
          <div class="stat-grid heirloom-potential-grid">
            ${heirloomStatOrder().map((stat) => `
              <label class="stat-field">
                <span>${data.statLabels[stat]}</span>
                ${numberInput(state.heirloom.characterPotential[stat], `data-heirloom-potential="${stat}"`)}
                <small>角色成长值</small>
              </label>
            `).join("")}
          </div>
        </section>
        <section class="heirloom-block heirloom-result-block">
          <div class="heirloom-summary">
            <div>
              <span>等级总值</span>
              <strong>${calc.formatNumber(result.level, 1)}</strong>
            </div>
            <div>
              <span>已分配</span>
              <strong>${calc.formatNumber(totalAllocated, 1)}</strong>
            </div>
            <div>
              <span>加权总值</span>
              <strong>${calc.formatNumber(result.totalWeight, 4)}</strong>
            </div>
          </div>
          ${result.warnings.length ? `<ul class="planner-warnings">${result.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}
          <div class="heirloom-allocation-list">
            ${renderHeirloomAllocations(result)}
          </div>
        </section>
        <section class="heirloom-block">
          <div class="table-wrap">
            <table class="heirloom-table">
              <thead>
                <tr>
                  <th>属性</th>
                  <th>角色成长</th>
                  <th>职业成长</th>
                  <th>总成长</th>
                  <th>权重</th>
                  <th>传家宝属性</th>
                </tr>
              </thead>
              <tbody>${renderHeirloomRows(result)}</tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  function renderHeirloomAllocations(result) {
    if (!result.selectedAllocations.length) {
      return "<p class=\"folded-note\">暂无可分配属性。</p>";
    }
    return result.selectedAllocations.map((item) => {
      const width = result.level > 0 ? Math.max(0, Math.min(100, item.value / result.level * 100)) : 0;
      return `
        <article class="heirloom-allocation-card">
          <div class="heirloom-allocation-head">
            <strong>${data.statLabels[item.stat]}</strong>
            <span>${calc.formatNumber(item.value, 1)}</span>
          </div>
          <div class="heirloom-allocation-track">
            <div class="heirloom-allocation-fill" style="width: ${width}%"></div>
          </div>
          <div class="heirloom-allocation-meta">
            <span>总成长 ${calc.formatNumber(item.totalGrowth, 4)}</span>
            <span>权重 ${calc.formatNumber(item.weight * 100, 1)}%</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderHeirloomRows(result) {
    const byStat = Object.fromEntries(result.allocations.map((item) => [item.stat, item]));
    return heirloomStatOrder().map((stat) => {
      const item = byStat[stat];
      return `
        <tr class="${item.selected ? "heirloom-selected-row" : ""}">
          <th>${data.statLabels[stat]}</th>
          <td>${calc.formatNumber(item.characterPotential, 4)}</td>
          <td>${calc.formatNumber(item.classGrowth, 4)}</td>
          <td>${calc.formatNumber(item.totalGrowth, 4)}</td>
          <td>${item.selected ? `${calc.formatNumber(item.weight * 100, 1)}%` : "-"}</td>
          <td>${item.selected ? calc.formatNumber(item.value, 1) : "-"}</td>
        </tr>
      `;
    }).join("");
  }

  function traitTypeLabel(type) {
    return {
      divine_skill: "神技",
      divine_trait: "神子",
      mortal_trait: "凡人",
      saint_trait: "圣子",
    }[type] || type;
  }

  function selectedTraits() {
    return state.traitIds
      .map((id) => data.traits.find((trait) => trait.id === id))
      .filter(Boolean);
  }

  function selectedDivineSkill() {
    return selectedTraits().find((trait) => trait.type === "divine_skill") || null;
  }

  function saintTraitGroup(trait) {
    return core.saintTraitGroup(data, trait);
  }

  function saintTraitGroups() {
    return core.getSaintTraitGroups(data).map((group) => ({
      ...group,
      items: group.traitIds
        .map((id) => data.traits.find((trait) => trait.id === id))
        .filter(Boolean),
    }));
  }

  function availableDivineRacesForState() {
    return core.availableDivineRaces(data, state);
  }

  function allowedMortalRacesForState() {
    return core.allowedMortalRaces(data, state);
  }

  function parseHybridTraitName(name) {
    const parsed = core?.parseHybridTraitName?.(name);
    if (parsed) {
      return {
        name: parsed.displayName,
        prerequisiteName: parsed.prerequisiteName,
        suffixRace: parsed.suffixRace,
      };
    }
    const match = String(name || "").match(/^(.+?)（(.+?)）([^（）]*)$/);
    if (!match) return null;
    return {
      name: match[1],
      prerequisiteName: match[2],
      suffixRace: match[3].trim(),
    };
  }

  function displayTraitName(trait) {
    return core?.displayTraitName?.(data, trait) || parseHybridTraitName(trait.name)?.name || trait.name;
  }

  function prerequisiteForTrait(trait) {
    const coreRequirements = core?.traitPrerequisites?.(data, trait);
    if (Array.isArray(coreRequirements) && coreRequirements.length) {
      const traitRequirement = coreRequirements.find((item) => item.kind === "trait");
      const bloodlineRequirement = coreRequirements.find((item) => item.kind === "bloodlineRace");
      if (traitRequirement?.traitId?.startsWith("missing:")) {
        return {
          label: traitRequirement.traitId.slice("missing:".length),
          race: bloodlineRequirement?.race || "",
          traitId: "",
          missing: true,
        };
      }
      const mortal = data.traits.find((item) => item.id === traitRequirement?.traitId);
      return {
        label: mortal?.name || traitRequirement?.traitId || "",
        race: bloodlineRequirement?.race || mortal?.race || "",
        traitId: traitRequirement?.traitId || "",
        missing: !mortal,
      };
    }
    if (trait.type !== "divine_trait") return null;
    const parsed = parseHybridTraitName(trait.name);
    if (!parsed) return null;
    const mortal = data.traits.find((item) => item.type === "mortal_trait" && item.name === parsed.prerequisiteName);
    return {
      label: parsed.prerequisiteName,
      race: mortal?.race || parsed.suffixRace || "",
      traitId: mortal?.id || "",
      missing: !mortal,
    };
  }

  function hasBloodlineTraitRace(race) {
    if (!race) return false;
    return core.hasBloodlineTraitRace(data, state, race);
  }

  function traitSelectionDisabledReason(trait) {
    return traitSelectionDetails(trait).disabledReason;
  }

  function overriddenMortalTraitIds() {
    const overridden = core?.overriddenMortalTraits?.(selectedTraits()) || [];
    return new Set(overridden.map((trait) => trait.id));
  }

  function traitSelectionDetails(trait) {
    const availability = core.getTraitSelectionAvailability(data, state, trait.id);
    return {
      disabledReason: availability.available ? "" : availability.reasons.map((reason) => reason.message).join("；"),
      warningReason: (availability.warnings || []).map((warning) => warning.message).join("；"),
      overridden: overriddenMortalTraitIds().has(trait.id),
    };
  }

  function traitPrerequisiteMetForIds(trait, traitIds) {
    const availability = core.getTraitAvailability(data, Object.assign({}, state, { traitIds }), trait.id);
    if (availability) return availability.available;
    const prerequisite = prerequisiteForTrait(trait);
    if (!prerequisite) return true;
    return !prerequisite.missing
      && hasBloodlineTraitRace(prerequisite.race)
      && traitIds.includes(prerequisite.traitId);
  }

  function renderTraits() {
    sanitizeTraits();
    const panel = $("#traitSubPanel");
    if (!panel) return;
    const selected = selectedTraits();
    const selectedSkill = selectedDivineSkill();
    const collapsed = state.traitsCollapsed !== false;
    const visibleDivineRaces = selectedSkill
      ? [selectedSkill.race]
      : availableDivineRacesForState();
    const mortalRaces = allowedMortalRacesForState();
    panel.innerHTML = `
      <div class="subsection-heading trait-subpanel-heading">
        <h2>特性选择</h2>
        <div class="panel-actions">
          ${collapsed ? "" : "<button class=\"small-button\" data-action=\"clear-traits\">清空</button>"}
          <button class="small-button" data-action="toggle-traits-panel">${collapsed ? "展开" : "收起"}</button>
        </div>
      </div>
      <div id="selectedTraits" class="selected-traits">
        ${selected.length ? selected.map((trait) => {
          const overridden = overriddenMortalTraitIds().has(trait.id);
          return `<span class="${overridden ? "overridden" : ""}" title="${overridden ? "被同部位神子特性覆盖，计算时不生效" : ""}">${trait.name}</span>`;
        }).join("") : "<em>未选择</em>"}
      </div>
      ${collapsed ? "<p class=\"folded-note\">特性选择已收起；上方保留当前已选特性。</p>" : `
        <div class="trait-groups">
        ${visibleDivineRaces.map((race) => renderDivineGroup(race)).join("")}
        ${mortalRaces.map((race) => renderMortalGroup(race)).join("")}
        </div>
      `}
    `;
  }

  function renderDivineGroup(race) {
    const selectedSkill = selectedDivineSkill();
    const active = selectedSkill?.race === race;
    const collapsed = isGroupCollapsed("divine", race);
    const skills = data.traits.filter((trait) => trait.type === "divine_skill" && trait.race === race);
    const dependentType = race === "圣子" ? "saint_trait" : "divine_trait";
    const dependentTraits = data.traits.filter((trait) => trait.type === dependentType && trait.race === race);
    const selectedDependentCount = dependentTraits.filter((trait) => state.traitIds.includes(trait.id)).length;
    const renderDependentOptions = () => {
      if (race === "圣子") {
        const groups = saintTraitGroups().map((group) => ({
          label: `${group.label}特性 ${group.maxSelected}/${group.items.length}`,
          items: group.items,
          group: group.label,
        }));
        return groups.map((group) => {
          const selectedInGroup = group.items.filter((trait) => state.traitIds.includes(trait.id)).length;
          return `
            <div class="choice-block">
              <h3>${group.label}${selectedInGroup ? " · 已选 1" : ""}</h3>
              ${group.items.map((trait) => {
                const details = traitSelectionDetails(trait);
                return renderTraitOption(trait, "checkbox", "trait-id", Boolean(details.disabledReason), details.disabledReason, details.warningReason, details.overridden);
              }).join("")}
            </div>
          `;
        }).join("");
      }
      return `
        <div class="choice-block">
          <h3>神子特性 ${selectedDependentCount}/2</h3>
          ${dependentTraits.map((trait) => {
            const details = traitSelectionDetails(trait);
            return renderTraitOption(
              trait,
              "checkbox",
              "trait-id",
              Boolean(details.disabledReason),
              details.disabledReason,
              details.warningReason,
              details.overridden
            );
          }).join("")}
        </div>
      `;
    };
    return `
      <section class="trait-group ${active ? "active" : ""}">
        <div class="trait-group-header">
          <label class="trait-group-select">
            <input type="checkbox" data-divine-group="${race}" ${active ? "checked" : ""}>
            <span>
              <strong>${race}神技</strong>
              <small>${active ? `已选 ${selectedDependentCount}/2 个附属特性` : "勾选后展开并锁定其他神技"}</small>
            </span>
          </label>
          ${active ? `<button class="collapse-button" data-action="toggle-trait-group" data-group-type="divine" data-race="${race}">${collapsed ? "展开" : "收起"}</button>` : ""}
        </div>
        ${active && !collapsed ? `
          <div class="trait-group-body">
            <div class="choice-block">
              <h3>神技</h3>
              ${skills.map((trait) => renderTraitOption(trait, "radio", "divine-skill", false)).join("")}
            </div>
            ${renderDependentOptions()}
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderMortalGroup(race) {
    const traits = data.traits.filter((trait) => trait.type === "mortal_trait" && trait.race === race);
    const selectedCount = traits.filter((trait) => state.traitIds.includes(trait.id)).length;
    const totalMortalCount = selectedTraits().filter((trait) => trait.type === "mortal_trait").length;
    const collapsed = isGroupCollapsed("mortal", race);
    return `
      <section class="trait-group mortal-group">
        <div class="trait-group-title">
          <span>
            <strong>${race}凡人</strong>
            <small>${selectedCount} 个，本角色凡人特性总数 ${totalMortalCount}/3</small>
          </span>
          <button class="collapse-button" data-action="toggle-trait-group" data-group-type="mortal" data-race="${race}">${collapsed ? "展开" : "收起"}</button>
        </div>
        ${collapsed ? "" : `<div class="trait-group-body">
          ${traits.map((trait) => {
            const details = traitSelectionDetails(trait);
            return renderTraitOption(trait, "checkbox", "trait-id", Boolean(details.disabledReason), details.disabledReason, details.warningReason, details.overridden);
          }).join("")}
        </div>`}
      </section>
    `;
  }

  function renderTraitOption(trait, inputType, dataKey, disabled, disabledReason = "", warningReason = "", overridden = false) {
    const checked = state.traitIds.includes(trait.id) ? "checked" : "";
    const disabledAttr = disabled ? "disabled" : "";
    const attr = dataKey === "divine-skill" ? `data-divine-skill="${trait.id}"` : `data-trait-id="${trait.id}"`;
    const prerequisite = prerequisiteForTrait(trait);
    return `
      <label class="trait-option ${disabled ? "disabled" : ""} ${warningReason ? "warning" : ""} ${overridden ? "overridden" : ""}">
        <input type="${inputType}" name="${dataKey}" ${attr} ${checked} ${disabledAttr}>
        <span>
          <strong>${displayTraitName(trait)}</strong>
          <small>${traitTypeLabel(trait.type)} · 部位：${trait.part || "无"} · 寿命：${trait.lifespanText || "未录入"}</small>
          ${prerequisite ? `<small class="trait-prerequisite">前置：${prerequisite.label}${prerequisite.race ? ` · ${prerequisite.race}` : ""}</small>` : ""}
          ${disabledReason ? `<small class="trait-disabled-reason">${disabledReason}</small>` : ""}
          ${warningReason ? `<small class="trait-warning-reason">${warningReason}</small>` : ""}
          ${overridden ? "<small class=\"trait-overridden-reason\">已被同部位神子特性覆盖，计算时不生效</small>" : ""}
          <em>${trait.type === "divine_skill" ? describeTraitEffect(trait) : (trait.effectText || describeTraitEffect(trait))}</em>
        </span>
        ${renderPotentialChips(trait)}
      </label>
    `;
  }

  function renderPotentialChips(trait) {
    if (trait.type !== "divine_trait" && trait.type !== "saint_trait") return "";
    const chips = data.stats
      .filter((stat) => Math.abs(Number(trait.potentialBonus?.[stat]) || 0) > 1e-9)
      .map((stat) => `<span>${data.statLabels[stat]} ${Number(trait.potentialBonus[stat]) > 0 ? "+" : ""}${calc.formatNumber(trait.potentialBonus[stat], 2)}</span>`);
    return chips.length ? `<div class="potential-chips">${chips.join("")}</div>` : "";
  }

  function vectorText(vector, suffix, scale) {
    const parts = data.stats
      .filter((stat) => Math.abs(Number(vector?.[stat]) || 0) > 1e-9)
      .map((stat) => {
        const value = Number(vector[stat]) * (scale || 1);
        return `${data.statLabels[stat]}${value > 0 ? "+" : ""}${calc.formatNumber(value, 4)}${suffix || ""}`;
      });
    return parts.join("，");
  }

  function describeTraitEffect(trait) {
    if (trait.type === "divine_skill") {
      const divine = vectorText(trait.divineCombatValue, "/级");
      return divine ? `战斗加成：${divine}` : "神技战斗加成未录入";
    }
    const parts = [];
    const flat = vectorText(trait.flatStats, "");
    const multiplier = vectorText(trait.multiplierStats, "%", 100);
    const growth = vectorText(trait.potentialBonus, "");
    const divine = vectorText(trait.divineCombatValue, "/级");
    if (flat) parts.push(`固定：${flat}`);
    if (multiplier) parts.push(`乘区：${multiplier}`);
    if (growth) parts.push(`成长：${growth}`);
    if (divine) parts.push(`神技：${divine}`);
    return parts.length ? parts.join("；") : "无六维成长影响，战斗效果尚未结构化";
  }

  function renderEquipment() {
    const finalClassNames = Object.keys(data.classValues);
    $("#gearPanel").innerHTML = `
      <div class="panel-heading">
        <h2>装备与最终职业</h2>
      </div>
      <label class="single-field">
        <span>最终职业</span>
        <select data-field="finalClass">${classOptionList(finalClassNames, state.finalClass, "values")}</select>
      </label>
      <div class="stat-grid">
        ${data.stats.map((stat) => `
          <label class="stat-field">
            <span>${data.statLabels[stat]}</span>
            ${numberInput(state.equipmentStats[stat], `data-equipment="${stat}"`)}
            <small>装备值</small>
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderPlanner() {
    const panel = $("#plannerPanel");
    if (!panel) return;
    const plan = calc.planSkillThreshold(state, state.planner);
    panel.innerHTML = `
      <div class="panel-heading">
        <h2>技能门槛规划</h2>
      </div>
      <div class="planner-block">
        <h3>目标门槛</h3>
        <div class="target-list">
          ${state.planner.targets.map((target, index) => renderPlannerTarget(target, index)).join("")}
          ${renderAddListButton("add-planner-target", "添加门槛")}
        </div>
      </div>
      <div class="planner-block">
        <h3>属性套装</h3>
        <div class="gear-set-list">
          ${state.planner.gearSets.map((gearSet, index) => renderGearSet(gearSet, index)).join("")}
          ${renderAddListButton("add-gear-set", "增加属性套装")}
        </div>
      </div>
      <div class="planner-block">
        <h3>核心属性</h3>
        <div class="checkbox-grid">
          ${data.stats.map((stat) => `
            <label class="check-pill">
              <input type="checkbox" data-core-stat="${stat}" ${state.planner.coreStats.includes(stat) ? "checked" : ""}>
              <span>${data.statLabels[stat]}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <div id="plannerOutput">${renderPlannerOutput(plan)}</div>
    `;
  }

  function renderPlannerOutputOnly() {
    const node = $("#plannerOutput");
    if (!node) {
      return;
    }
    node.innerHTML = renderPlannerOutput(calc.planSkillThreshold(state, state.planner));
  }

  function buildLimitConfig(roleTemplate) {
    return Object.assign({}, state.limitEvaluator, {
      sex: roleTemplate?.sex || state.sex,
      level: state.level,
      finalClass: state.finalClass,
      equipmentStats: state.equipmentStats,
      bloodlines: roleTemplate?.bloodlines || state.bloodlines,
      traitIds: roleTemplate?.traitIds || state.traitIds,
    });
  }

  function selectedTraitLabelText() {
    const names = selectedTraits().map((trait) => trait.name);
    return names.length ? names.join("，") : "未选择特性";
  }

  function currentBloodlineLabelText() {
    return calc.bloodlineSummary(state)
      .map((row) => `${row.race}${row.percent}%${row.autoFilled ? "(自动)" : ""}`)
      .join(" + ");
  }

  function roleTemplateBloodlineText(template) {
    return calc.bloodlineSummary(template)
      .map((row) => `${row.race}${row.percent}%${row.autoFilled ? "(自动)" : ""}`)
      .join(" + ");
  }

  function roleTemplateTraitText(template) {
    const names = (template.traitIds || [])
      .map((id) => data.traits.find((trait) => trait.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join("，") : "未选择特性";
  }

  function defaultRoleTemplateName() {
    const divine = selectedTraits().find((trait) => trait.type === "divine_skill");
    const mainBloodline = calc.bloodlineSummary(state)
      .filter((row) => !row.autoFilled)
      .sort((a, b) => b.percent - a.percent)[0];
    return [
      mainBloodline ? mainBloodline.race.replace("血裔", "").replace("王族", "") : state.sex,
      divine?.name || "无神技",
      state.sex,
    ].filter(Boolean).join(" · ");
  }

  function currentRoleTemplateSnapshot(name) {
    return {
      id: `role-${Date.now()}`,
      name: String(name || defaultRoleTemplateName()).trim() || defaultRoleTemplateName(),
      sex: state.sex,
      bloodlines: state.bloodlines.map((row) => ({ race: row.race, percent: Number(row.percent) || 0 })),
      traitIds: [...state.traitIds],
    };
  }

  function tuneNextLimitSampleCount(current, durationMs) {
    const value = Math.max(4, Math.min(200, Number(current) || 24));
    if (!durationMs) return value;
    if (durationMs < 350) return Math.min(200, Math.ceil(value * 1.35));
    if (durationMs > 1400) return Math.max(8, Math.floor(value * 0.72));
    return value;
  }

  function nextLimitSeed(seed, round, durationMs) {
    const base = Math.max(1, Number(seed) || 20260623);
    return (base + round * 104729 + Math.floor((durationMs || 0) * 97) + 7919) % 2147483647;
  }

  function clearLimitComparison() {
    state.limitEvaluator.result = null;
    state.limitEvaluator.history = [];
  }

  function roleSignature(template) {
    const sex = template?.sex || state.sex;
    const bloodlines = (template?.bloodlines || state.bloodlines)
      .map((row) => ({ race: row.race, percent: Number(row.percent) || 0 }))
      .sort((a, b) => a.race.localeCompare(b.race, "zh-CN") || b.percent - a.percent);
    const traitIds = [...(template?.traitIds || state.traitIds)].sort();
    return JSON.stringify({ sex, bloodlines, traitIds });
  }

  function compareLimitItems(a, b) {
    return (
      b.aggregate.p95 - a.aggregate.p95
      || b.theory.score - a.theory.score
      || b.aggregate.passRate - a.aggregate.passRate
      || (b.sampleCount || 0) - (a.sampleCount || 0)
    );
  }

  function mergeBestLimitHistory(newItems, previousItems) {
    const byRole = new Map();
    [...(previousItems || []), ...(newItems || [])].forEach((item) => {
      const key = item.roleKey || item.templateId || item.runLabel || item.bloodlineLabel;
      const current = byRole.get(key);
      if (!current || compareLimitItems(item, current) < 0) {
        byRole.set(key, item);
      }
    });
    return [...byRole.values()].sort(compareLimitItems).slice(0, 40);
  }

  function runLimitEvaluations(runs) {
    const startedAt = performance.now();
    const round = (Number(state.limitEvaluator.evaluationRound) || 0) + 1;
    const usedSampleCount = Math.max(1, Math.min(200, Number(state.limitEvaluator.sampleCount) || 24));
    const usedSeed = nextLimitSeed(state.limitEvaluator.seed, round, state.limitEvaluator.lastDurationMs);
    const queue = runs?.length ? runs : [{ label: `第 ${round} 轮`, template: null }];
    const warnings = [];
    const items = [];

    state.limitEvaluator.evaluationRound = round;
    state.limitEvaluator.seed = usedSeed;
    state.limitEvaluator.sampleCount = usedSampleCount;

    queue.forEach((entry, index) => {
      const config = buildLimitConfig(entry.template);
      config.sampleCount = usedSampleCount;
      config.seed = (usedSeed + index * 15485863) % 2147483647;
      const result = calc.evaluateBuildLimits(config, state.planner);
      result.warnings.forEach((warning) => {
        if (!warnings.includes(warning)) warnings.push(warning);
      });
      const current = result.results[0];
      if (current) {
        current.runLabel = entry.label || `第 ${round} 轮`;
        current.templateId = entry.template?.id || "";
        current.roleKey = entry.template ? `template:${roleSignature(entry.template)}` : `current:${roleSignature(entry.template)}`;
        current.sampleCount = usedSampleCount;
        current.seed = config.seed;
        items.push(current);
      }
    });

    const durationMs = performance.now() - startedAt;
    const history = mergeBestLimitHistory(items, state.limitEvaluator.history);

    state.limitEvaluator.lastDurationMs = durationMs;
    state.limitEvaluator.sampleCount = tuneNextLimitSampleCount(usedSampleCount, durationMs);
    state.limitEvaluator.result = {
      generatedBloodlineCount: items.length,
      evaluatedBuildCount: items.length,
      sampleCount: usedSampleCount,
      seed: usedSeed,
      results: items,
      warnings,
    };
    state.limitEvaluator.history = history;
  }

  function renderLimitEvaluator() {
    const panel = $("#limitPanel");
    if (!panel) return;
    const limit = state.limitEvaluator;
    const constraints = normalizeLimitConstraints(limit.constraints);
    panel.innerHTML = `
      <div class="panel-heading">
        <div>
          <h2>构筑上限评估</h2>
        </div>
        <div class="panel-actions">
          ${limit.history.length ? "<button class=\"small-button\" data-action=\"clear-limit-history\">清空对比</button>" : ""}
          <button class="primary-button" data-action="run-limit-evaluation">开始评估</button>
        </div>
      </div>
      <div class="limit-layout">
        <section class="limit-block">
          <div class="limit-block-head">
            <h3>全局场景</h3>
          </div>
          <div class="limit-global-grid">
            <div class="form-grid">
              <label>
                <span>性别</span>
                <select data-field="sex">${optionList(["女", "男"], state.sex)}</select>
              </label>
              <label>
                <span>目标等级</span>
                <input type="number" min="1" max="999" step="1" value="${state.level}" data-field="level">
              </label>
              <label>
                <span>最终职业</span>
                <select data-field="finalClass">${classOptionList(Object.keys(data.classValues), state.finalClass)}</select>
              </label>
              <label>
                <span>最终装备总负重</span>
                <input type="number" min="0" step="0.1" value="${calc.formatNumber(limit.equipmentWeight, 2)}" data-limit-field="equipmentWeight">
              </label>
              <div class="limit-auto-card">
                <span>系统采样</span>
                <strong>下轮 ${limit.sampleCount} 次</strong>
                <small>第 ${limit.evaluationRound + 1} 轮，种子自动滚动</small>
              </div>
              <div class="limit-auto-card">
                <span>上次耗时</span>
                <strong>${limit.lastDurationMs ? `${calc.formatNumber(limit.lastDurationMs, 0)} ms` : "尚无"}</strong>
                <small>样本量会随耗时自动调整</small>
              </div>
            </div>
            <div class="limit-constraint-panel">
              <div class="limit-block-head">
                <h3>硬约束</h3>
                <button class="small-button" data-action="append-planner-targets">使用规划页技能门槛</button>
              </div>
              <div class="constraint-list">
                ${constraints.map((constraint, index) => renderLimitConstraint(constraint, index)).join("")}
                ${renderAddListButton("add-limit-constraint", "添加约束")}
              </div>
            </div>
          </div>
        </section>
        <section class="limit-block">
          <h3>当前构筑</h3>
          <div class="limit-current-build">
            <div>
              <span>血脉</span>
              <strong>${currentBloodlineLabelText()}</strong>
            </div>
            <div>
              <span>神技/特性</span>
              <strong>${selectedTraitLabelText()}</strong>
            </div>
          </div>
          <p class="planner-sort-note">此处直接复用“属性”页已指定的血脉、神技和特性；上限页只随机生成六维基础并搜索成长路线。</p>
        </section>
        <section class="limit-block">
          <div class="limit-block-head">
            <h3>角色模板批量评估</h3>
            <button class="small-button" data-action="run-template-limit-evaluation" ${roleTemplates.length ? "" : "disabled"}>评估选中模板</button>
          </div>
          ${roleTemplates.length ? `
            <div class="template-list">
              ${roleTemplates.map((template) => `
                <div class="template-row">
                  <input type="checkbox" data-limit-template="${template.id}" ${limit.selectedTemplateIds.includes(template.id) ? "checked" : ""}>
                  <span>
                    <strong>${escapeHtml(template.name)}</strong>
                    <small>${template.sex} · ${escapeHtml(roleTemplateBloodlineText(template))}</small>
                    <em>${escapeHtml(roleTemplateTraitText(template))}</em>
                  </span>
                  <button type="button" class="icon-button" title="删除模板" data-action="remove-role-template" data-id="${template.id}">×</button>
                </div>
              `).join("")}
            </div>
          ` : "<p class=\"planner-note\">尚未保存角色模板。请回到“属性”页保存当前角色。</p>"}
        </section>
        <section class="limit-block">
          <h3>目标属性权重</h3>
          <div class="stat-grid">
            ${data.stats.map((stat) => `
              <label>
                <span>${data.statLabels[stat]}</span>
                <input type="number" min="0" step="0.1" value="${calc.formatNumber(limit.targetWeights[stat], 3)}" data-limit-weight="${stat}">
              </label>
            `).join("")}
          </div>
          <p class="planner-sort-note">权重只影响评分排序；负重和硬约束会参与搜索。</p>
        </section>
        <section class="limit-block">
          <h3>最终装备六维</h3>
          <div class="stat-grid">
            ${data.stats.map((stat) => `
              <label>
                <span>${data.statLabels[stat]}</span>
                ${numberInput(state.equipmentStats[stat], `data-equipment="${stat}"`)}
              </label>
            `).join("")}
          </div>
        </section>
      </div>
      <div id="limitOutput">${renderLimitOutput(limit.result)}</div>
    `;
  }

  function renderLimitConstraint(constraint, index) {
    return `
      <div class="constraint-row">
        <label>
          <span>属性类型</span>
          <select data-limit-constraint="${index}" data-limit-constraint-field="stat">${statOptionList(constraint.stat)}</select>
        </label>
        <label>
          <span>约束值</span>
          <input type="number" min="0" step="1" value="${calc.formatNumber(constraint.value, 2)}" data-limit-constraint="${index}" data-limit-constraint-field="value">
        </label>
        <button class="icon-button" title="删除约束" data-action="remove-limit-constraint" data-index="${index}">×</button>
        ${constraint.label ? `<small>${escapeHtml(constraint.label)}</small>` : ""}
      </div>
    `;
  }

  function renderLimitOutput(result) {
    const history = state.limitEvaluator.history || [];
    if (!result && !history.length) {
      return `
        <div class="limit-empty">
          <strong>尚未评估</strong>
          <span>点击“开始评估”后，系统会按当前血脉和特性随机生成基础，并搜索最优成长路线。</span>
        </div>
      `;
    }
    const rows = history.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.runLabel || "-"}</td>
        <td>${item.bloodlineLabel}</td>
        <td>${item.traitLabel || "无"}</td>
        <td>${vectorInlineText(item.theory.combatStats)}</td>
        <td>${vectorInlineText(item.theory.characterPotential, 4)}</td>
      </tr>
    `).join("");
    const topCards = history.slice(0, 4).map((item, index) => renderLimitResultCard(item, index)).join("");
    return `
      <section class="limit-output">
        <div class="limit-output-head">
          <div>
            <h3>评估结果</h3>
            <p>${result
              ? `当前保留 ${history.length} 个角色的最佳方案；本轮样本 ${result.sampleCount}，用时 ${calc.formatNumber(state.limitEvaluator.lastDurationMs, 0)} ms。`
              : `当前输入已变更；下次评估会更新 ${history.length} 个角色的最佳方案对比。`}</p>
          </div>
        </div>
        ${result?.warnings?.length ? `<ul class="planner-warnings">${result.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>角色</th>
                <th>血脉</th>
                <th>神子/特性</th>
                <th>战斗六维</th>
                <th>原始潜力</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="limit-result-list">${topCards}</div>
      </section>
    `;
  }

  function renderLimitResultCard(item, index) {
    const route = item.theory.allocationList
      .slice(0, 5)
      .map((entry) => `<li><strong>${entry.className}</strong><span>有效 ${calc.formatNumber(entry.effectiveLevels, 2)} 级</span></li>`)
      .join("");
    const deficits = lossVectorText(item.theory.deficits) || "无";
    return `
      <article class="limit-result-card">
        <div class="planner-solution-head">
          <strong>${item.runLabel || `方案 ${index + 1}`}</strong>
          <span>${item.theory.met ? "约束达标" : "存在短板"}</span>
        </div>
        <div class="limit-build-title">
          <strong>${item.bloodlineLabel}</strong>
          <small>${item.traitLabel || "无特性"}</small>
        </div>
        <div class="limit-stat-row">${statCells(item.theory.combatStats)}</div>
        <div class="limit-potential-row">
          <strong>对应原始潜力</strong>
          <div>${potentialCells(item.theory.characterPotential)}</div>
        </div>
        <details class="limit-detail-pack">
          <summary>查看评分、路线与约束</summary>
          <div class="planner-metrics">
            <span>理论上限<strong>${calc.formatNumber(item.theory.score, 2)}</strong></span>
            <span>P95<strong>${calc.formatNumber(item.aggregate.p95, 2)}</strong></span>
            <span>达标率<strong>${calc.formatNumber(item.aggregate.passRate * 100, 1)}%</strong></span>
          </div>
          <div class="limit-route">
            <strong>参考成长路线</strong>
            <ul class="planner-requirements">${route || "<li><strong>无成长路线</strong><span>0</span></li>"}</ul>
          </div>
          <div class="planner-loss">硬约束缺口：${deficits}</div>
        </details>
      </article>
    `;
  }

  function renderPlannerTarget(target, index) {
    return `
      <div class="target-row">
        <label>
          <span>技能</span>
          <input type="text" value="${target.name || ""}" data-planner-target="${index}" data-planner-target-field="name">
        </label>
        <label>
          <span>属性</span>
          <select data-planner-target="${index}" data-planner-target-field="stat">${statOptionList(target.stat)}</select>
        </label>
        <label>
          <span>门槛</span>
          <input type="number" min="0" step="1" value="${calc.formatNumber(target.value, 2)}" data-planner-target="${index}" data-planner-target-field="value">
        </label>
        <label>
          <span>检查组</span>
          <input type="text" value="${target.groupId || ""}" data-planner-target="${index}" data-planner-target-field="groupId">
        </label>
        <button class="icon-button" title="删除目标" data-action="remove-planner-target" data-index="${index}">×</button>
      </div>
    `;
  }

  function renderGearSet(gearSet, index) {
    return `
      <section class="gear-set-card">
        <div class="gear-set-head">
          <label>
            <span>套装名</span>
            <input type="text" value="${gearSet.name}" data-gear-set="${index}" data-gear-field="name">
          </label>
          <div class="gear-primary">
            ${data.stats.map((stat) => `
              <label class="check-pill compact-pill">
                <input type="checkbox" data-gear-primary="${index}" value="${stat}" ${gearSet.primaryStats.includes(stat) ? "checked" : ""}>
                <span>${data.statLabels[stat]}</span>
              </label>
            `).join("")}
          </div>
          <button class="icon-button" title="删除套装" data-action="remove-gear-set" data-index="${index}">×</button>
        </div>
        ${renderGearPiece(gearSet, index, "weapon", "武器", weaponTypes())}
        ${renderGearPiece(gearSet, index, "armor", "护甲", armorTypes())}
      </section>
    `;
  }

  function renderGearPiece(gearSet, index, piece, label, typeOptions) {
    const item = gearSet[piece];
    return `
      <div class="gear-piece-row">
        <label>
          <span>${label}类型</span>
          <select data-gear-set="${index}" data-gear-piece="${piece}" data-gear-field="type">
            ${optionList(typeOptions, item.type)}
          </select>
        </label>
        <div class="gear-stat-grid">
          ${data.stats.map((stat) => `
            <label>
              <span>${data.statLabels[stat]}</span>
              ${numberInput(item.stats[stat], `data-gear-set="${index}" data-gear-piece="${piece}" data-gear-stat="${stat}"`)}
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderCheckboxGrid(items, selected, dataKey) {
    return `
      <div class="checkbox-grid">
        ${items.map((item) => `
          <label class="check-pill">
            <input type="checkbox" data-${dataKey}="${item}" ${selected.includes(item) ? "checked" : ""}>
            <span>${item}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderTargetChips(targets) {
    return `
      <div class="target-chip-row">
        ${targets.map((target) => `
          <span class="target-chip ${target.deficit <= 1e-7 ? "met" : "miss"}">
            ${target.name || target.label} ${calc.formatNumber(target.value, 2)} / ${calc.formatNumber(target.required, 2)}
          </span>
        `).join("")}
      </div>
    `;
  }

  function renderPlannerOutput(plan) {
    const bestPlan = plan.plans[0] || null;
    const comboPlans = plan.plans.slice(1).filter((item) => item.requirements?.length > 1);
    const otherPlans = plan.plans.slice(1).filter((item) => item.requirements?.length <= 1);
    return `
      <div class="planner-output">
        ${plan.warnings.length ? `<ul class="planner-warnings">${plan.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}
        <div class="planner-check-grid">
          ${plan.checks.map((check) => `
            <div class="planner-check-card ${check.met ? "met" : "miss"}">
              <strong>${check.label}</strong>
              <small>${check.gearSetName} + ${check.className}</small>
              ${renderTargetChips(check.targetChecks)}
              <div class="planner-check-detail">
                装备：${lossVectorText(check.gearStats) || "0"}
              </div>
            </div>
          `).join("")}
        </div>
        <div class="planner-solutions">
          <h3>成长方案</h3>
          <p class="planner-sort-note">排序：可达标优先；核心属性损失合计越低越靠前；仍相同时，有效等级更少的方案靠前。组合方案会作为备选保留。</p>
          ${bestPlan ? `<div class="solution-group-title">最优方案</div>${renderPlannerSolution(bestPlan, 0)}` : "<p class=\"planner-note\">当前成长路线中未找到可行调整方案。</p>"}
          ${comboPlans.length ? `<div class="solution-group-title">备选组合方案</div>${comboPlans.map((item, index) => renderPlannerSolution(item, index + 1)).join("")}` : ""}
          ${otherPlans.length ? `<div class="solution-group-title">其他备选</div>${otherPlans.map((item, index) => renderPlannerSolution(item, index + 1 + comboPlans.length)).join("")}` : ""}
        </div>
      </div>
    `;
  }

  function renderPlannerSolution(solution, index) {
    const coreLoss = lossVectorText(solution.coreLoss) || "0";
    const requirementList = solution.requirements?.length
      ? solution.requirements.map((item) => `
        <li>
          <strong>${item.baseClass} → ${item.newClass}</strong>
          <span>有效 ${calc.formatNumber(item.effectiveLevels, 2)} 级</span>
        </li>
      `).join("")
      : "<li><strong>原始成长路线</strong><span>无需替换</span></li>";
    return `
      <article class="planner-solution ${solution.reachable ? "reachable" : "blocked"}">
        <div class="planner-solution-head">
          <strong>方案 ${index + 1}${solution.alreadyMet ? " · 原始成长路线" : ""}</strong>
          <span>${solution.reachable ? "可行" : "未达标"}</span>
        </div>
        ${renderTargetChips(solution.targetResults)}
        <div class="planner-loss">核心属性损失合计：${calc.formatNumber(solution.coreLossSum ?? solution.weightedLoss, 4)}${coreLoss !== "0" ? `（${coreLoss}）` : ""}</div>
        <ul class="planner-requirements">${requirementList}</ul>
      </article>
    `;
  }

  function lossVectorText(vector) {
    return data.stats
      .filter((stat) => Math.abs(Number(vector?.[stat]) || 0) > 1e-9)
      .map((stat) => `${data.statLabels[stat]} ${calc.formatNumber(vector[stat], 4)}`)
      .join("，");
  }

  function vectorInlineText(vector, digits = 1) {
    return data.stats
      .map((stat) => `${data.statLabels[stat]} ${calc.formatNumber(vector?.[stat] || 0, digits)}`)
      .join("，");
  }

  function statCells(vector) {
    return data.stats.map((stat) => `
      <div class="result-stat">
        <span>${data.statLabels[stat]}</span>
        <strong>${calc.formatNumber(vector[stat], 2)}</strong>
      </div>
    `).join("");
  }

  function potentialCells(vector) {
    return data.stats.map((stat) => `
      <span class="raw-potential-cell">
        <span>${data.statLabels[stat]}</span>
        <strong>${calc.formatNumber(vector?.[stat] || 0, 4)}</strong>
      </span>
    `).join("");
  }

  function potentialRating(value) {
    const number = Number(value) || 0;
    const thresholds = [
      { min: 1.7, label: "SSS++", tone: "purple" },
      { min: 1.5, label: "SSS+", tone: "purple" },
      { min: 1.2, label: "SSS", tone: "purple" },
      { min: 0.95, label: "SS", tone: "purple" },
      { min: 0.75, label: "S", tone: "purple" },
      { min: 0.55, label: "A", tone: "yellow" },
      { min: 0.35, label: "B", tone: "blue" },
      { min: 0.2, label: "C", tone: "bright-green" },
      { min: 0.1, label: "D", tone: "dark-green" },
      { min: -Infinity, label: "E", tone: "gray" },
    ];
    return thresholds.find((item) => number >= item.min);
  }

  function renderPotentialCell(value) {
    const rating = potentialRating(value);
    return `
      <span class="potential-cell">
        <span>${calc.formatNumber(value, 4)}</span>
        <span class="rating-badge rating-${rating.tone}">${rating.label}</span>
      </span>
    `;
  }

  function selectedInjectionPotentialBonus() {
    const result = zeroVector();
    selectedTraits()
      .filter((trait) => trait.type === "divine_skill" || trait.type === "divine_trait" || trait.type === "saint_trait")
      .forEach((trait) => {
      data.stats.forEach((stat) => {
        result[stat] += Number(trait.potentialBonus?.[stat]) || 0;
      });
    });
    return result;
  }

  function renderAttributeBars(normalStats, combatStats) {
    const max = 900;
    return data.stats.map((stat) => {
      const normal = Math.max(0, Number(normalStats[stat]) || 0);
      const combat = Math.max(0, Number(combatStats[stat]) || 0);
      const normalWidth = Math.min(100, normal / max * 100);
      const combatWidth = Math.min(100, combat / max * 100);
      const combatDeltaWidth = Math.max(0, combatWidth - normalWidth);
      const combatLabelLeft = Math.min(96, Math.max(normalWidth, combatWidth) + 1.2);
      const showNormalValue = Math.abs(normal - combat) > 0.05;
      return `
        <div class="attribute-bar-row">
          <span class="attribute-bar-name">${data.statLabels[stat]}</span>
          <div class="attribute-bar-track" aria-label="${data.statLabels[stat]} 常态 ${calc.formatNumber(normal, 2)} 战斗 ${calc.formatNumber(combat, 2)}">
            <div class="attribute-bar-fill normal" style="width: ${normalWidth}%">
              ${showNormalValue ? `<span>${calc.formatNumber(normal, 1)}</span>` : ""}
            </div>
            ${combatDeltaWidth > 0.05 ? `<div class="attribute-bar-fill combat-delta" style="left: ${normalWidth}%; width: ${combatDeltaWidth}%"></div>` : ""}
            <span class="attribute-bar-combat-value" style="left: ${combatLabelLeft}%">${calc.formatNumber(combat, 1)}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function radarPoint(cx, cy, radius, index) {
    const angles = [-120, -180, -240, -300, 0, -60];
    const angle = angles[index] * Math.PI / 180;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  }

  function renderGrowthRadar(result) {
    const radarStats = ["strength", "technique", "agility", "will", "perception", "constitution"];
    const width = 520;
    const height = 360;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 96;
    const max = 0.95;
    const grid = [1, 0.75, 0.5, 0.25].map((scale) => {
      const points = radarStats.map((_, index) => {
        const point = radarPoint(cx, cy, radius * scale, index);
        return `${point.x},${point.y}`;
      }).join(" ");
      return `<polygon points="${points}" class="radar-grid-poly"></polygon>`;
    }).join("");
    const spokes = radarStats.map((_, index) => {
      const point = radarPoint(cx, cy, radius, index);
      return `<line x1="${cx}" y1="${cy}" x2="${point.x}" y2="${point.y}" class="radar-spoke"></line>`;
    }).join("");
    const areaPoints = radarStats.map((stat, index) => {
      const value = Math.max(0, Number(result.finalCharacterPotential[stat]) || 0);
      const point = radarPoint(cx, cy, radius * Math.min(1, value / max), index);
      return `${point.x},${point.y}`;
    }).join(" ");
    const overflowScale = 0.8;
    const overflowItems = radarStats
      .map((stat, index) => ({
        stat,
        index,
        value: Math.max(0, Number(result.finalCharacterPotential[stat]) || 0),
      }))
      .filter((item) => item.value > max);
    const overflowLayer = (() => {
      if (!overflowItems.length) return "";
      if (overflowItems.length === 1) {
        const item = overflowItems[0];
        const ratio = Math.min(1, Math.max(0, (item.value - max) / overflowScale));
        const tip = radarPoint(cx, cy, radius * ratio, item.index);
        const shoulder = radarPoint(cx, cy, radius * Math.min(ratio * 0.55, 0.34), item.index);
        const dx = tip.x - cx;
        const dy = tip.y - cy;
        const length = Math.max(1, Math.hypot(dx, dy));
        const px = -dy / length;
        const py = dx / length;
        const shoulderWidth = 7 + ratio * 6;
        const points = [
          `${shoulder.x + px * shoulderWidth},${shoulder.y + py * shoulderWidth}`,
          `${tip.x},${tip.y}`,
          `${shoulder.x - px * shoulderWidth},${shoulder.y - py * shoulderWidth}`,
          `${cx},${cy}`,
        ].join(" ");
        return `<polygon points="${points}" class="radar-overflow-pointer"></polygon>`;
      }
      const overflowPoints = radarStats.map((stat, index) => {
        const value = Math.max(0, Number(result.finalCharacterPotential[stat]) || 0);
        const ratio = Math.min(1, Math.max(0, (value - max) / overflowScale));
        const point = radarPoint(cx, cy, radius * ratio, index);
        return `${point.x},${point.y}`;
      }).join(" ");
      return `<polygon points="${overflowPoints}" class="radar-overflow-area"></polygon>`;
    })();
    const labels = radarStats.map((stat, index) => {
      const value = Number(result.finalCharacterPotential[stat]) || 0;
      const rating = potentialRating(value);
      const point = radarPoint(cx, cy, radius + 70, index);
      const anchor = point.x < cx - 10 ? "end" : point.x > cx + 10 ? "start" : "middle";
      return `
        <g class="radar-label rating-text-${rating.tone}" transform="translate(${point.x} ${point.y})">
          <text text-anchor="${anchor}" class="radar-label-name">${data.statLabels[stat]} ${rating.label}</text>
          <text text-anchor="${anchor}" y="22" class="radar-label-value">${calc.formatNumber(value, 4)}</text>
        </g>
      `;
    }).join("");
    return `
      <div class="radar-wrap">
        <svg class="growth-radar" viewBox="0 0 ${width} ${height}" role="img" aria-label="角色最终成长值雷达图">
          <rect width="${width}" height="${height}" rx="10" class="radar-bg" fill="#252b2a"></rect>
          ${grid}
          ${spokes}
          <polygon points="${areaPoints}" class="radar-area" fill="rgba(229, 164, 38, 0.72)" stroke="rgba(255, 216, 121, 0.95)" stroke-width="2"></polygon>
          <polygon points="${areaPoints}" class="radar-edge" fill="none" stroke="rgba(116, 73, 0, 0.55)" stroke-width="1"></polygon>
          ${overflowLayer}
          ${labels}
        </svg>
      </div>
    `;
  }

  function renderResults() {
    const result = calc.calculateGrowth(state);
    const rows = data.stats.map((stat) => {
      const item = result.breakdown[stat];
      return `
        <tr>
          <th>${data.statLabels[stat]}</th>
          <td>${renderPotentialCell(item.finalCharacterPotential)}</td>
          <td>${calc.formatNumber(item.weightedFinalPotential, 4)}</td>
          <td>${calc.formatNumber(item.ordinaryGrowth, 4)}</td>
          <td>${calc.formatNumber(item.divineCombatAdd, 4)}</td>
          <td>${calc.formatNumber(item.traitFlat, 4)}</td>
          <td>${calc.formatNumber(item.equipment, 4)}</td>
          <td>${calc.formatNumber(item.classValue, 4)}</td>
          <td>${item.multiplierBonus >= 0 ? "+" : ""}${calc.formatNumber(item.multiplierBonus * 100, 2)}%</td>
          <td>${calc.formatNumber(item.normal, 2)}</td>
          <td>${calc.formatNumber(item.combat, 2)}</td>
        </tr>
      `;
    }).join("");

    const formulas = data.stats.map((stat) => {
      const item = result.breakdown[stat];
      return `
        <details>
          <summary>${data.statLabels[stat]}</summary>
          <div class="formula-grid">
            <span>血脉潜力</span><strong>${calc.formatNumber(item.bloodlinePotential, 4)}</strong>
            <span>特性成长</span><strong>${calc.formatNumber(item.traitPotentialBonus, 4)}</strong>
            <span>人物潜力</span><strong>${calc.formatNumber(item.finalCharacterPotential, 4)} ${potentialRating(item.finalCharacterPotential).label}</strong>
            <span>最终潜力</span><strong>${calc.formatNumber(item.weightedFinalPotential, 4)}</strong>
            <span>当前成长</span><strong>${calc.formatNumber(item.currentGrowth, 4)}</strong>
            <span>常态公式</span><code>${item.normalFormula}</code>
            <span>战斗公式</span><code>${item.combatFormula}</code>
          </div>
        </details>
      `;
    }).join("");

    $("#resultPanel").innerHTML = `
      <section class="result-card attribute-card">
        <div class="panel-heading">
          <h2>属性进度条</h2>
          <div class="bar-legend">
            <span><i class="legend-normal"></i>常态</span>
            <span><i class="legend-combat"></i>战斗态</span>
          </div>
        </div>
        <div class="attribute-bars">${renderAttributeBars(result.normalStats, result.combatStats)}</div>
      </section>
      <section class="result-card radar-card">
        <div class="panel-heading">
          <h2>人物总潜力</h2>
        </div>
        ${renderGrowthRadar(result)}
      </section>
      <section class="result-card breakdown-card">
        <div class="panel-heading">
          <h2>属性拆解</h2>
          <button class="small-button" data-action="toggle-breakdown-panel">${state.breakdownCollapsed ? "展开" : "收起"}</button>
        </div>
        ${state.breakdownCollapsed ? "<p class=\"folded-note\">属性拆解已收起，展开后可查看人物潜力、成长值、神技加值、装备和公式来源。</p>" : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>属性</th>
                <th>人物潜力</th>
                <th>最终潜力</th>
                <th>成长值</th>
                <th>神技加值</th>
                <th>特性值</th>
                <th>装备</th>
                <th>职业</th>
                <th>乘区</th>
                <th>常态</th>
                <th>战斗</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        `}
      </section>
      <section class="result-card formula-card">
        <div class="panel-heading">
          <h2>公式</h2>
        </div>
        ${formulas}
      </section>
      <section class="result-card ${result.warnings.length ? "warning-card" : "ok-card"}">
        <div class="panel-heading">
          <h2>规则警告</h2>
        </div>
        ${result.warnings.length
          ? `<ul>${result.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>`
          : "<p>未发现规则警告。</p>"}
      </section>
    `;
  }

  function sanitizeTraits() {
    const availableDivines = availableDivineRacesForState();
    const allowedMortals = allowedMortalRacesForState();
    const current = state.traitIds
      .map((id) => data.traits.find((trait) => trait.id === id))
      .filter(Boolean);
    const divineSkill = current.find((trait) => trait.type === "divine_skill" && availableDivines.includes(trait.race));
    const next = [];

    if (divineSkill) {
      next.push(divineSkill.id);
      const dependentType = divineSkill.race === "圣子" ? "saint_trait" : "divine_trait";
      if (divineSkill.race === "圣子") {
        const byGroup = new Set();
        current
          .filter((trait) => trait.type === dependentType && trait.race === divineSkill.race)
          .forEach((trait) => {
            const group = saintTraitGroup(trait);
            if (!group || byGroup.has(group)) return;
            byGroup.add(group);
            next.push(trait.id);
          });
      } else {
        current
          .filter((trait) => trait.type === dependentType && trait.race === divineSkill.race)
          .slice(0, 2)
          .forEach((trait) => next.push(trait.id));
      }
    }

    current
      .filter((trait) => trait.type === "mortal_trait" && allowedMortals.includes(trait.race))
      .slice(0, 3)
      .forEach((trait) => next.push(trait.id));

    const unique = [...new Set(next)];
    state.traitIds = unique.filter((id) => {
      const trait = data.traits.find((item) => item.id === id);
      return !trait || traitPrerequisiteMetForIds(trait, unique);
    });
  }

  function selectDivineGroup(race) {
    const firstSkill = data.traits.find((trait) => trait.type === "divine_skill" && trait.race === race);
    if (!firstSkill) return;
    const mortalIds = selectedTraits().filter((trait) => trait.type === "mortal_trait").map((trait) => trait.id);
    state.traitIds = [firstSkill.id, ...mortalIds];
    sanitizeTraits();
  }

  function clearDivineGroup() {
    state.traitIds = selectedTraits()
      .filter((trait) => trait.type === "mortal_trait")
      .map((trait) => trait.id);
    sanitizeTraits();
  }

  function flashStatus(text) {
    const node = $("#statusText");
    if (!node) return;
    node.textContent = text;
    window.clearTimeout(flashStatus.timer);
    flashStatus.timer = window.setTimeout(() => {
      node.textContent = "";
    }, 1500);
  }

  function setFalaSample() {
    state = createDefaultState();
    sanitizeTraits();
    render();
  }

  function rememberInputDraft(target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
    const numberValue = () => Number(target.value) || 0;

    if (target.matches("[data-equipment]")) {
      state.equipmentStats[target.dataset.equipment] = numberValue();
      return true;
    }
    if (target.matches("[data-potential]")) {
      state.characterPotential[target.dataset.potential] = numberValue();
      return true;
    }
    if (target.matches("[data-injected-potential]")) {
      state.injectedPotential[target.dataset.injectedPotential] = numberValue();
      return true;
    }
    if (target.matches("[data-current-field]")) {
      const field = target.dataset.currentField;
      if (field === "currentLevel") {
        state.currentState.currentLevel = Number(target.value) || 1;
        return true;
      }
    }
    if (target.matches("[data-current-stat]")) {
      state.currentState.stats[target.dataset.currentStat] = numberValue();
      return true;
    }
    if (target.matches("[data-heirloom-field]")) {
      const field = target.dataset.heirloomField;
      if (field === "level") {
        state.heirloom.level = clampHeirloomLevel(target.value);
        return true;
      }
    }
    if (target.matches("[data-heirloom-potential]")) {
      state.heirloom.characterPotential[target.dataset.heirloomPotential] = numberValue();
      return true;
    }
    if (target.matches("[data-field='level']")) {
      state.level = Number(target.value) || 1;
      return true;
    }
    if (target.matches("[data-segment-field]")) {
      const index = Number(target.dataset.segment);
      const field = target.dataset.segmentField;
      if (state.growthSegments[index] && field !== "className") {
        state.growthSegments[index][field] = Number(target.value) || 1;
        return true;
      }
    }
    if (target.matches("[data-gear-field]")) {
      const index = Number(target.dataset.gearSet);
      const gearSet = state.planner.gearSets[index];
      if (gearSet && target.dataset.gearField === "name") {
        gearSet.name = target.value.trim();
        return true;
      }
    }
    if (target.matches("[data-gear-stat]")) {
      const index = Number(target.dataset.gearSet);
      const gearSet = state.planner.gearSets[index];
      if (gearSet) {
        gearSet[target.dataset.gearPiece].stats[target.dataset.gearStat] = numberValue();
        return true;
      }
    }
    if (target.matches("[data-limit-field]")) {
      const field = target.dataset.limitField;
      if (field === "equipmentWeight") {
        state.limitEvaluator.equipmentWeight = numberValue();
        return true;
      }
    }
    if (target.matches("[data-limit-constraint-field]")) {
      const index = Number(target.dataset.limitConstraint);
      const field = target.dataset.limitConstraintField;
      const constraint = state.limitEvaluator.constraints?.[index];
      if (constraint && field === "value") {
        constraint.value = Math.max(0, numberValue());
        return true;
      }
    }
    if (target.matches("[data-limit-weight]")) {
      state.limitEvaluator.targetWeights[target.dataset.limitWeight] = Math.max(0, numberValue());
      return true;
    }
    if (target.matches("[data-role-template-name]")) {
      roleTemplateDraftName = target.value.trim();
      return true;
    }
    if (target.matches("[data-planner-target-field]")) {
      const index = Number(target.dataset.plannerTarget);
      const field = target.dataset.plannerTargetField;
      const targetRow = state.planner.targets[index];
      if (targetRow) {
        targetRow[field] = field === "value" ? numberValue() : target.value.trim();
        return true;
      }
    }

    return false;
  }

  document.addEventListener("click", (event) => {
    const actionNode = event.target.closest("[data-action]");
    const action = actionNode?.dataset.action;
    if (!action) return;
    rememberStateSoon();
    if (action === "set-view") {
      activeView = ["planner", "limit", "heirloom"].includes(actionNode.dataset.view) ? actionNode.dataset.view : "calculator";
      render();
      return;
    }
    if (action === "add-bloodline") {
      const used = new Set(state.bloodlines.map((row) => row.race));
      const race = selectableBloodlineRaces().find((item) => !used.has(item)) || selectableBloodlineRaces()[0];
      state.bloodlines.push({ race, percent: 10 });
      state.characterPotential = calc.calculateBasePotential(state);
      sanitizeTraits();
      renderBasics();
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (action === "apply-limit") {
      state.characterPotential = calc.calculateBasePotential(state);
      renderBasics();
      renderPlanner();
      renderResults();
    }
    if (action === "apply-injected-potential") {
      const dependentTraits = selectedTraits().filter((trait) => trait.type === "divine_trait" || trait.type === "saint_trait");
      if (!dependentTraits.length) {
        flashStatus("请先选择神子特性");
        return;
      }
      const traitPotential = selectedInjectionPotentialBonus();
      data.stats.forEach((stat) => {
        state.characterPotential[stat] = (Number(state.injectedPotential?.[stat]) || 0) - traitPotential[stat];
      });
      clearLimitComparison();
      renderBasics();
      renderPlanner();
      renderResults();
      flashStatus("已反推基础成长");
    }
    if (action === "apply-heirloom-from-current") {
      state.heirloom.characterPotential = cloneStatVector(calc.calculateGrowth(state).finalCharacterPotential);
      if (data.classGrowth[state.finalClass]) {
        state.heirloom.className = state.finalClass;
      }
      renderHeirloom();
      flashStatus("已套用");
      return;
    }
    if (action === "toggle-current-panel") {
      state.currentState.collapsed = state.currentState.collapsed === false;
      renderCurrentState();
      return;
    }
    if (action === "toggle-breakdown-panel") {
      state.breakdownCollapsed = !state.breakdownCollapsed;
      renderResults();
      return;
    }
    if (action === "toggle-basic-potential") {
      state.basicPotentialCollapsed = !state.basicPotentialCollapsed;
      renderBasics();
      return;
    }
    if (action === "toggle-injected-potential") {
      state.injectedPotentialCollapsed = !state.injectedPotentialCollapsed;
      renderBasics();
      return;
    }
    if (action === "toggle-traits-panel") {
      state.traitsCollapsed = !state.traitsCollapsed;
      renderTraits();
      return;
    }
    if (action === "remove-bloodline") {
      const index = Number(actionNode.dataset.index);
      state.bloodlines.splice(index, 1);
      if (!state.bloodlines.length) state.bloodlines.push({ race: "法拉希尔血裔", percent: 10 });
      state.characterPotential = calc.calculateBasePotential(state);
      sanitizeTraits();
      renderBasics();
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (action === "add-segment") {
      const minLevel = state.currentState.enabled ? Number(state.currentState.currentLevel || 0) + 1 : 1;
      state.growthSegments.push({ fromLevel: minLevel, toLevel: state.level, className: "丛林猎手" });
      sortGrowthSegments();
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (action === "remove-segment") {
      const index = Number(actionNode.dataset.index);
      state.growthSegments.splice(index, 1);
      if (!state.growthSegments.length) {
        state.growthSegments.push({ fromLevel: 1, toLevel: state.level, className: "丛林猎手" });
      }
      sortGrowthSegments();
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (action === "clear-traits") {
      state.traitIds = [];
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (action === "save-role-template") {
      const nameInput = document.querySelector("[data-role-template-name]");
      if (nameInput) roleTemplateDraftName = nameInput.value.trim();
      const template = currentRoleTemplateSnapshot(roleTemplateDraftName || defaultRoleTemplateName());
      roleTemplates = [
        template,
        ...roleTemplates.filter((item) => item.name !== template.name),
      ].slice(0, 40);
      roleTemplateDraftName = template.name;
      saveRoleTemplates();
      renderBasics();
      flashStatus("角色已保存");
    }
    if (action === "run-limit-evaluation") {
      runLimitEvaluations();
      renderLimitEvaluator();
      flashStatus("已评估");
    }
    if (action === "run-template-limit-evaluation") {
      const checkedIds = [...document.querySelectorAll("[data-limit-template]:checked")]
        .map((node) => node.dataset.limitTemplate);
      if (checkedIds.length) {
        state.limitEvaluator.selectedTemplateIds = [...new Set(checkedIds)];
      }
      const selected = roleTemplates.filter((template) => state.limitEvaluator.selectedTemplateIds.includes(template.id));
      if (!selected.length) {
        flashStatus("未选择模板");
        return;
      }
      runLimitEvaluations(selected.map((template) => ({ label: template.name, template })));
      renderLimitEvaluator();
      flashStatus("已批量评估");
    }
    if (action === "clear-limit-history") {
      state.limitEvaluator.result = null;
      state.limitEvaluator.history = [];
      renderLimitEvaluator();
      flashStatus("已清空");
    }
    if (action === "remove-role-template") {
      const id = actionNode.dataset.id;
      roleTemplates = roleTemplates.filter((template) => template.id !== id);
      state.limitEvaluator.selectedTemplateIds = state.limitEvaluator.selectedTemplateIds.filter((item) => item !== id);
      saveRoleTemplates();
      renderLimitEvaluator();
      flashStatus("已删除模板");
    }
    if (action === "add-planner-target") {
      const used = new Set(state.planner.targets.map((target) => target.stat));
      const stat = data.stats.find((item) => !used.has(item)) || "will";
      state.planner.targets.push({
        id: `target-${Date.now()}`,
        name: "",
        stat,
        value: 90,
        groupId: "",
      });
      clearLimitComparison();
      renderPlanner();
    }
    if (action === "remove-planner-target") {
      const index = Number(actionNode.dataset.index);
      state.planner.targets.splice(index, 1);
      if (!state.planner.targets.length) {
        state.planner.targets.push({ id: `target-${Date.now()}`, name: "", stat: "will", value: 90, groupId: "" });
      }
      clearLimitComparison();
      renderPlanner();
    }
    if (action === "add-gear-set") {
      state.planner.gearSets.push({
        id: `gear-${Date.now()}`,
        name: `套装 ${state.planner.gearSets.length + 1}`,
        primaryStats: ["will"],
        weapon: { type: weaponTypes()[0], stats: zeroVector() },
        armor: { type: armorTypes()[0], stats: zeroVector() },
      });
      clearLimitComparison();
      renderPlanner();
    }
    if (action === "add-limit-constraint") {
      const used = new Set((state.limitEvaluator.constraints || []).map((constraint) => constraint.stat));
      const stat = data.stats.find((item) => !used.has(item)) || "will";
      state.limitEvaluator.constraints = [
        ...(state.limitEvaluator.constraints || []),
        { id: `constraint-${Date.now()}`, stat, value: 90, label: "" },
      ];
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (action === "append-planner-targets") {
      const targets = (state.planner.targets || [])
        .map((target, index) => ({
          id: `constraint-${Date.now()}-${index}`,
          stat: data.stats.includes(target.stat) ? target.stat : "will",
          value: Math.max(0, Number(target.value) || 0),
          label: target.name || data.statLabels[target.stat] || "规划门槛",
        }))
        .filter((target) => target.value > 0);
      if (!targets.length) {
        flashStatus("规划页暂无门槛");
        return;
      }
      state.limitEvaluator.constraints = [
        ...(state.limitEvaluator.constraints || []),
        ...targets,
      ];
      clearLimitComparison();
      renderLimitEvaluator();
      flashStatus("已追加门槛");
    }
    if (action === "remove-limit-constraint") {
      const index = Number(actionNode.dataset.index);
      state.limitEvaluator.constraints = (state.limitEvaluator.constraints || []).filter((_, itemIndex) => itemIndex !== index);
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (action === "remove-gear-set") {
      const index = Number(actionNode.dataset.index);
      state.planner.gearSets.splice(index, 1);
      if (!state.planner.gearSets.length) {
        state.planner.gearSets.push({
          id: `gear-${Date.now()}`,
          name: "套装 1",
          primaryStats: ["will"],
          weapon: { type: weaponTypes()[0], stats: zeroVector() },
          armor: { type: armorTypes()[0], stats: zeroVector() },
        });
      }
      clearLimitComparison();
      renderPlanner();
    }
    if (action === "toggle-trait-group") {
      toggleGroupCollapsed(actionNode.dataset.groupType, actionNode.dataset.race);
      renderTraits();
    }
    if (action === "load-fala") {
      setFalaSample();
    }
    if (action === "save") {
      saveState();
    }
    if (action === "load-saved") {
      state = loadState() || createDefaultState();
      sanitizeTraits();
      render();
      flashStatus("已载入");
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    rememberStateSoon();
    if (target.matches("[data-equipment]")) {
      state.equipmentStats[target.dataset.equipment] = Number(target.value) || 0;
      clearLimitComparison();
      if (activeView === "limit") {
        renderLimitEvaluator();
        return;
      }
      renderResults();
    }
    if (target.matches("[data-core-stat]")) {
      const stat = target.dataset.coreStat;
      state.planner.coreStats = target.checked
        ? [...new Set([...state.planner.coreStats, stat])]
        : state.planner.coreStats.filter((item) => item !== stat);
      renderPlannerOutputOnly();
    }
    if (target.matches("[data-potential]")) {
      state.characterPotential[target.dataset.potential] = Number(target.value) || 0;
      updatePotentialHints();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-injected-potential]")) {
      state.injectedPotential[target.dataset.injectedPotential] = Number(target.value) || 0;
    }
    if (target.matches("[data-current-enabled]")) {
      state.currentState.enabled = target.checked;
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-current-field]")) {
      const field = target.dataset.currentField;
      state.currentState[field] = field === "currentLevel" ? Number(target.value) || 1 : target.value;
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-current-stat]")) {
      state.currentState.stats[target.dataset.currentStat] = Number(target.value) || 0;
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-heirloom-field]")) {
      const field = target.dataset.heirloomField;
      state.heirloom[field] = field === "level" ? clampHeirloomLevel(target.value) : target.value;
      renderHeirloom();
    }
    if (target.matches("[data-heirloom-potential]")) {
      state.heirloom.characterPotential[target.dataset.heirloomPotential] = Number(target.value) || 0;
      renderHeirloom();
    }
    if (target.matches("[data-field='level']")) {
      state.level = Number(target.value) || 1;
      clearLimitComparison();
      if (activeView === "limit") {
        renderLimitEvaluator();
        return;
      }
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-field='sex']")) {
      state.sex = target.value;
      state.characterPotential = calc.calculateBasePotential(state);
      clearLimitComparison();
      if (activeView === "limit") {
        renderLimitEvaluator();
        return;
      }
      renderBasics();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-bloodline-field]")) {
      const index = Number(target.dataset.bloodline);
      const field = target.dataset.bloodlineField;
      state.bloodlines[index][field] = field === "percent" ? clampToBloodlineStep(target.value) : target.value;
      state.characterPotential = calc.calculateBasePotential(state);
      state.limitEvaluator.result = null;
      sanitizeTraits();
      renderBasics();
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-field='finalClass']")) {
      state.finalClass = target.value;
      clearLimitComparison();
      if (activeView === "limit") {
        renderLimitEvaluator();
        return;
      }
      renderResults();
    }
    if (target.matches("[data-segment-field]")) {
      const index = Number(target.dataset.segment);
      const field = target.dataset.segmentField;
      state.growthSegments[index][field] = field === "className" ? target.value : Number(target.value) || 1;
      sortGrowthSegments();
      renderGrowthPlan();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-gear-field]")) {
      const index = Number(target.dataset.gearSet);
      const gearSet = state.planner.gearSets[index];
      if (!gearSet) return;
      if (target.dataset.gearField === "name") {
        gearSet.name = target.value.trim() || `套装 ${index + 1}`;
      }
      if (target.dataset.gearField === "type") {
        gearSet[target.dataset.gearPiece].type = target.value;
      }
      clearLimitComparison();
      renderPlanner();
    }
    if (target.matches("[data-gear-stat]")) {
      const index = Number(target.dataset.gearSet);
      const gearSet = state.planner.gearSets[index];
      if (!gearSet) return;
      gearSet[target.dataset.gearPiece].stats[target.dataset.gearStat] = Number(target.value) || 0;
      clearLimitComparison();
      renderPlannerOutputOnly();
    }
    if (target.matches("[data-gear-primary]")) {
      const index = Number(target.dataset.gearPrimary);
      const gearSet = state.planner.gearSets[index];
      if (!gearSet) return;
      const checked = [...document.querySelectorAll(`[data-gear-primary="${index}"]:checked`)]
        .map((node) => node.value)
        .slice(0, 2);
      gearSet.primaryStats = checked;
      renderPlanner();
    }
    if (target.matches("[data-limit-field]")) {
      const field = target.dataset.limitField;
      const numericFields = new Set(["equipmentWeight"]);
      state.limitEvaluator[field] = numericFields.has(field) ? Number(target.value) || 0 : target.value;
      state.limitEvaluator = normalizeLimitState(state.limitEvaluator, createDefaultLimitState());
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (target.matches("[data-limit-constraint-field]")) {
      const index = Number(target.dataset.limitConstraint);
      const field = target.dataset.limitConstraintField;
      const constraint = state.limitEvaluator.constraints?.[index];
      if (!constraint) return;
      constraint[field] = field === "value" ? Math.max(0, Number(target.value) || 0) : target.value;
      state.limitEvaluator.constraints = normalizeLimitConstraints(state.limitEvaluator.constraints);
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (target.matches("[data-limit-weight]")) {
      state.limitEvaluator.targetWeights[target.dataset.limitWeight] = Math.max(0, Number(target.value) || 0);
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (target.matches("[data-limit-template]")) {
      const id = target.dataset.limitTemplate;
      state.limitEvaluator.selectedTemplateIds = target.checked
        ? [...new Set([...state.limitEvaluator.selectedTemplateIds, id])]
        : state.limitEvaluator.selectedTemplateIds.filter((item) => item !== id);
    }
    if (target.matches("[data-role-template-name]")) {
      roleTemplateDraftName = target.value.trim();
      renderBasics();
    }
    if (target.matches("[data-planner-target-field]")) {
      const index = Number(target.dataset.plannerTarget);
      const field = target.dataset.plannerTargetField;
      state.planner.targets[index][field] = field === "value" ? Number(target.value) || 0 : target.value.trim();
      clearLimitComparison();
      renderPlannerOutputOnly();
    }
    if (target.matches("[data-divine-group]")) {
      if (target.checked) {
        selectDivineGroup(target.dataset.divineGroup);
      } else {
        clearDivineGroup();
      }
      state.limitEvaluator.result = null;
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-divine-skill]")) {
      const skill = data.traits.find((trait) => trait.id === target.dataset.divineSkill);
      if (!skill) return;
      const mortalIds = selectedTraits().filter((trait) => trait.type === "mortal_trait").map((trait) => trait.id);
      state.traitIds = [skill.id, ...mortalIds];
      sanitizeTraits();
      state.limitEvaluator.result = null;
      renderTraits();
      renderPlanner();
      renderResults();
    }
    if (target.matches("[data-trait-id]")) {
      const id = target.dataset.traitId;
      if (target.checked) {
        if (!state.traitIds.includes(id)) state.traitIds.push(id);
      } else {
        state.traitIds = state.traitIds.filter((item) => item !== id);
      }
      sanitizeTraits();
      state.limitEvaluator.result = null;
      renderTraits();
      renderPlanner();
      renderResults();
    }
  });

  document.addEventListener("input", (event) => {
    if (rememberInputDraft(event.target)) {
      rememberStateSoon();
    }
  });

  render();
})();
