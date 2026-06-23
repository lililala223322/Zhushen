(function () {
  const data = window.RULE_DATA;
  const calc = window.GrowthCalc;
  const storageKey = "hongchao-growth-build-v2";
  const roleTemplateKey = "hongchao-role-templates-v1";
  const fallbackWeaponTypes = [
    "刀", "刺剑", "匕首", "单手剑", "单手斧", "单手锤", "双手剑", "双手斧", "双手杖",
    "弩", "战旗", "权杖", "枪", "琴", "瓶子", "短弓", "重弩", "链锤", "长弓", "长柄", "骑枪",
  ];
  const fallbackArmorTypes = ["布甲", "板甲", "皮甲", "链甲"];

  function zeroVector() {
    return Object.fromEntries(data.stats.map((stat) => [stat, 0]));
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
      usePlannerTargets: true,
      equipmentWeight: 0,
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
        currentLevel: 1,
        className: "丛林猎手",
        stats: zeroVector(),
      },
      traitIds: ["divine-fala", "fala-bird", "fala-forest-heir", "m-fala-nature-spirit"],
      collapsedGroups: [],
      equipmentStats: zeroVector(),
      finalClass: "掠袭骑兵",
      planner: createDefaultPlannerState(),
      limitEvaluator: createDefaultLimitState(),
    };
    base.characterPotential = calc.calculateBasePotential(base);
    return base;
  }

  let state = loadState() || createDefaultState();
  let activeView = "calculator";
  let roleTemplates = loadRoleTemplates();
  let roleTemplateDraftName = "";
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
    const snapshot = Object.assign({}, state, {
      limitEvaluator: Object.assign({}, state.limitEvaluator, { result: null, history: [] }),
    });
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    flashStatus("已保存");
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
      equipmentStats: Object.assign(zeroVector(), value?.equipmentStats || {}),
      finalClass: data.classValues[value?.finalClass] ? value.finalClass : fallback.finalClass,
      planner: normalizePlannerState(value?.planner, fallback.planner),
      limitEvaluator: normalizeLimitState(value?.limitEvaluator, fallback.limitEvaluator),
    };
    normalized.characterPotential = Object.assign(
      zeroVector(),
      value?.characterPotential || calc.calculateBasePotential(normalized)
    );
    return normalized;
  }

  function normalizeLimitState(value, fallback) {
    const targetWeights = Object.assign(zeroVector(), value?.targetWeights || fallback.targetWeights);
    return {
      sampleCount: Math.max(1, Math.min(200, Number(value?.sampleCount) || fallback.sampleCount)),
      seed: Number(value?.seed) || fallback.seed,
      evaluationRound: Math.max(0, Number(value?.evaluationRound) || 0),
      lastDurationMs: Math.max(0, Number(value?.lastDurationMs) || 0),
      usePlannerTargets: value?.usePlannerTargets !== false,
      equipmentWeight: Math.max(0, Number(value?.equipmentWeight) || 0),
      targetWeights,
      selectedTemplateIds: Array.isArray(value?.selectedTemplateIds) ? value.selectedTemplateIds.map(String) : [],
      result: null,
      history: [],
    };
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
    return items.map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item}</option>`).join("");
  }

  function statOptionList(selected) {
    return data.stats
      .map((stat) => `<option value="${stat}" ${stat === selected ? "selected" : ""}>${data.statLabels[stat]}</option>`)
      .join("");
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
    renderBasics();
    renderCurrentState();
    renderGrowthPlan();
    renderTraits();
    renderEquipment();
    renderResults();
  }

  function renderShell() {
    const isPlanner = activeView === "planner";
    const isLimit = activeView === "limit";
    $("#app").innerHTML = `
      <header class="topbar">
        <div>
          <h1>${isLimit ? "构筑上限评估" : "成长计算器"}</h1>
          <p>${isLimit ? "血脉与神子组合强度比较" : "常态属性与战斗属性"}</p>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" data-action="load-fala">法拉样例</button>
          <button class="ghost-button" data-action="load-saved">载入</button>
          <button class="primary-button" data-action="save">保存</button>
          <span id="statusText" class="status-text"></span>
        </div>
      </header>
      <main class="workspace ${isPlanner || isLimit ? "planner-workspace" : ""}">
        <aside class="rail">
          <div class="rail-mark">成</div>
          <button class="rail-button ${!isPlanner && !isLimit ? "active" : ""}" data-action="set-view" data-view="calculator">属性</button>
          <button class="rail-button ${isPlanner ? "active" : ""}" data-action="set-view" data-view="planner">规划</button>
          <button class="rail-button ${isLimit ? "active" : ""}" data-action="set-view" data-view="limit">上限</button>
          ${!isPlanner && !isLimit ? `
            <div class="rail-divider"></div>
            <a href="#basicPanel">基础</a>
            <a href="#currentPanel">当前</a>
            <a href="#growthPanel">成长</a>
            <a href="#traitPanel">特性</a>
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
        ` : `
          <section class="input-column">
            <section id="basicPanel" class="panel"></section>
            <section id="currentPanel" class="panel"></section>
            <section id="growthPanel" class="panel"></section>
            <section id="traitPanel" class="panel"></section>
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
    $("#basicPanel").innerHTML = `
      <div class="panel-heading">
        <h2>角色基础</h2>
        <div class="panel-actions">
          <button class="small-button" data-action="apply-limit">套用上限</button>
          <button class="small-button" data-action="add-bloodline">添加血脉</button>
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
      </div>
      <div class="weighted-note">
        加权结果是当前角色潜力上限；实际角色潜力可低于上限并会参与最终计算。
      </div>
      <div class="stat-grid">
        ${data.stats.map((stat) => renderPotentialField(stat, potentialLimit)).join("")}
      </div>
      <div class="role-save-row">
        <label>
          <span>角色模板名</span>
          <input type="text" value="${escapeHtml(roleTemplateDraftName || defaultRoleTemplateName())}" data-role-template-name>
        </label>
        <button class="small-button" data-action="save-role-template">保存角色</button>
        <small>已保存 ${roleTemplates.length} 个角色模板，可在“上限”页批量评估。</small>
      </div>
    `;
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
    $("#currentPanel").innerHTML = `
      <div class="panel-heading">
        <h2>当前状态</h2>
        <label class="inline-toggle">
          <input type="checkbox" data-current-enabled ${state.currentState.enabled ? "checked" : ""}>
          <span>作为规划起点</span>
        </label>
      </div>
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
          <select data-current-field="className">${optionList(classNames, state.currentState.className)}</select>
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
        <button class="small-button" data-action="add-segment">添加区间</button>
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
          <select data-segment="${index}" data-segment-field="className">${optionList(classNames, segment.className)}</select>
        </label>
        <button class="icon-button" title="删除区间" data-action="remove-segment" data-index="${index}">×</button>
        ${hasIssue ? `<div class="segment-warning">${issues.join("；")}</div>` : ""}
      </div>
    `;
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

  function renderTraits() {
    sanitizeTraits();
    const selected = selectedTraits();
    const selectedSkill = selectedDivineSkill();
    const visibleDivineRaces = selectedSkill
      ? [selectedSkill.race]
      : calc.availableDivineRaces(state);
    const mortalRaces = calc.allowedMortalRaces(state);
    $("#traitPanel").innerHTML = `
      <div class="panel-heading">
        <h2>特性选择</h2>
        <button class="small-button" data-action="clear-traits">清空</button>
      </div>
      <div id="selectedTraits" class="selected-traits">
        ${selected.length ? selected.map((trait) => `<span>${trait.name}</span>`).join("") : "<em>未选择</em>"}
      </div>
      <div class="trait-groups">
        ${visibleDivineRaces.map((race) => renderDivineGroup(race)).join("")}
        ${mortalRaces.map((race) => renderMortalGroup(race)).join("")}
      </div>
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
            <div class="choice-block">
              <h3>${race === "圣子" ? "圣子特性" : "神子特性"} ${selectedDependentCount}/2</h3>
              ${dependentTraits.map((trait) => renderTraitOption(
                trait,
                "checkbox",
                "trait-id",
                !state.traitIds.includes(trait.id) && selectedDependentCount >= 2
              )).join("")}
            </div>
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
          ${traits.map((trait) => renderTraitOption(
            trait,
            "checkbox",
            "trait-id",
            !state.traitIds.includes(trait.id) && totalMortalCount >= 3
          )).join("")}
        </div>`}
      </section>
    `;
  }

  function renderTraitOption(trait, inputType, dataKey, disabled) {
    const checked = state.traitIds.includes(trait.id) ? "checked" : "";
    const disabledAttr = disabled ? "disabled" : "";
    const attr = dataKey === "divine-skill" ? `data-divine-skill="${trait.id}"` : `data-trait-id="${trait.id}"`;
    return `
      <label class="trait-option ${disabled ? "disabled" : ""}">
        <input type="${inputType}" name="${dataKey}" ${attr} ${checked} ${disabledAttr}>
        <span>
          <strong>${trait.name}</strong>
          <small>${traitTypeLabel(trait.type)} · 部位：${trait.part || "无"} · 寿命：${trait.lifespanText || "未录入"}</small>
          <em>${trait.effectText || describeTraitEffect(trait)}</em>
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
        <select data-field="finalClass">${optionList(finalClassNames, state.finalClass)}</select>
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
        <div class="panel-actions">
          <button class="small-button" data-action="add-planner-target">添加门槛</button>
          <button class="small-button" data-action="add-gear-set">增加属性套装</button>
        </div>
      </div>
      <div class="planner-block">
        <h3>目标门槛</h3>
        <div class="target-list">
          ${state.planner.targets.map((target, index) => renderPlannerTarget(target, index)).join("")}
        </div>
      </div>
      <div class="planner-block">
        <h3>属性套装</h3>
        <div class="gear-set-list">
          ${state.planner.gearSets.map((gearSet, index) => renderGearSet(gearSet, index)).join("")}
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
          <h3>全局场景</h3>
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
              <select data-field="finalClass">${optionList(Object.keys(data.classValues), state.finalClass)}</select>
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
          <div class="limit-toggle-row">
            <label class="check-pill">
              <input type="checkbox" data-limit-toggle="usePlannerTargets" ${limit.usePlannerTargets ? "checked" : ""}>
              <span>使用规划页技能门槛</span>
            </label>
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
          <p class="planner-sort-note">权重只影响评分排序；负重和技能门槛会作为硬约束参与搜索。</p>
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
        <details ${stat === "technique" || stat === "agility" ? "open" : ""}>
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
      <section class="result-card summary-card">
        <div class="panel-heading">
          <h2>常态属性</h2>
        </div>
        <div class="result-grid">${statCells(result.normalStats)}</div>
      </section>
      <section class="result-card combat-card">
        <div class="panel-heading">
          <h2>战斗属性</h2>
        </div>
        <div class="result-grid">${statCells(result.combatStats)}</div>
      </section>
      <section class="result-card">
        <div class="panel-heading">
          <h2>属性拆解</h2>
        </div>
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
    const availableDivines = calc.availableDivineRaces(state);
    const allowedMortals = calc.allowedMortalRaces(state);
    const current = state.traitIds
      .map((id) => data.traits.find((trait) => trait.id === id))
      .filter(Boolean);
    const divineSkill = current.find((trait) => trait.type === "divine_skill" && availableDivines.includes(trait.race));
    const next = [];

    if (divineSkill) {
      next.push(divineSkill.id);
      const dependentType = divineSkill.race === "圣子" ? "saint_trait" : "divine_trait";
      current
        .filter((trait) => trait.type === dependentType && trait.race === divineSkill.race)
        .slice(0, 2)
        .forEach((trait) => next.push(trait.id));
    }

    current
      .filter((trait) => trait.type === "mortal_trait" && allowedMortals.includes(trait.race))
      .slice(0, 3)
      .forEach((trait) => next.push(trait.id));

    state.traitIds = [...new Set(next)];
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

  document.addEventListener("click", (event) => {
    const actionNode = event.target.closest("[data-action]");
    const action = actionNode?.dataset.action;
    if (!action) return;
    if (action === "set-view") {
      activeView = ["planner", "limit"].includes(actionNode.dataset.view) ? actionNode.dataset.view : "calculator";
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
    if (target.matches("[data-limit-weight]")) {
      state.limitEvaluator.targetWeights[target.dataset.limitWeight] = Math.max(0, Number(target.value) || 0);
      clearLimitComparison();
      renderLimitEvaluator();
    }
    if (target.matches("[data-limit-toggle]")) {
      state.limitEvaluator[target.dataset.limitToggle] = target.checked;
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

  render();
})();
