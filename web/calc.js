(function (global) {
  const { stats } = global.RULE_DATA;

  function zeroVector() {
    return Object.fromEntries(stats.map((stat) => [stat, 0]));
  }

  function addInto(target, source, scale) {
    stats.forEach((stat) => {
      target[stat] += (Number(source?.[stat]) || 0) * (scale ?? 1);
    });
    return target;
  }

  function vectorSum(items, key) {
    const result = zeroVector();
    items.forEach((item) => addInto(result, item[key]));
    return result;
  }

  function round(value, digits) {
    const factor = 10 ** (digits ?? 2);
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function formatNumber(value, digits) {
    const rounded = round(value, digits ?? 4);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function effectiveLevels(fromLevel, toLevel) {
    const from = Number(fromLevel);
    const to = Number(toLevel);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      return { total: 0, before60: 0, after60: 0 };
    }
    const before60 = Math.max(0, Math.min(to, 60) - from + 1);
    const after60 = Math.max(0, to - Math.max(from, 61) + 1);
    return {
      total: before60 + after60 * 0.35,
      before60,
      after60,
    };
  }

  function hasAnyStat(vector) {
    return stats.some((stat) => Math.abs(Number(vector?.[stat]) || 0) > 1e-9);
  }

  function getBloodlineRows(input) {
    if (Array.isArray(input.bloodlines) && input.bloodlines.length) {
      return input.bloodlines
        .map((row) => ({
          race: row.race,
          percent: Number(row.percent) || 0,
        }))
        .filter((row) => row.race && row.percent > 0);
    }
    if (input.race) {
      return [{ race: input.race, percent: 100 }];
    }
    return [];
  }

  function bloodlineTotal(input) {
    return getBloodlineRows(input).reduce((sum, row) => sum + row.percent, 0);
  }

  function bloodlineSummary(input) {
    const data = global.RULE_DATA;
    const rows = getBloodlineRows(input);
    const total = rows.reduce((sum, row) => sum + row.percent, 0);
    if (total < 100) {
      return [...rows, { race: data.commonerRace, percent: 100 - total, autoFilled: true }];
    }
    return rows;
  }

  function traitRaceForBloodline(race) {
    const data = global.RULE_DATA;
    return data.bloodlineTraitRaceMap?.[race] || race;
  }

  function calculateBasePotential(input) {
    const data = global.RULE_DATA;
    const result = zeroVector();
    const sex = input.sex || "女";
    bloodlineSummary(input).forEach((row) => {
      const racePotential = data.races[row.race]?.[sex];
      if (!racePotential) return;
      addInto(result, racePotential, row.percent / 100);
    });
    return result;
  }

  function availableDivineRaces(input) {
    const data = global.RULE_DATA;
    const rows = getBloodlineRows(input);
    const hasDivineSkill = (race) => data.traits.some((trait) => trait.type === "divine_skill" && trait.race === race);
    const races = rows
      .filter((row) => row.percent > 70)
      .map((row) => traitRaceForBloodline(row.race))
      .filter((race) => race && race !== "平民" && hasDivineSkill(race));
    return [...new Set([...races, "圣子"])];
  }

  function allowedMortalRaces(input) {
    return getBloodlineRows(input)
      .filter((row) => traitRaceForBloodline(row.race) !== "平民")
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 2)
      .map((row) => traitRaceForBloodline(row.race));
  }

  function validateBuild(input, selectedTraits) {
    const warnings = [];
    const data = global.RULE_DATA;
    const bloodlines = getBloodlineRows(input);
    const totalBloodline = bloodlineTotal(input);
    if (!bloodlines.length) {
      warnings.push("尚未填写血脉，系统会按 100% 平民血脉计算。");
    }
    if (totalBloodline > 100) {
      warnings.push(`血脉合计为 ${totalBloodline}%，超过 100%。`);
    }
    const seenBloodlines = new Set();
    bloodlines.forEach((row, index) => {
      if (!data.races[row.race]) {
        warnings.push(`第 ${index + 1} 条血脉未找到：${row.race}。`);
      }
      if (row.percent % 10 !== 0) {
        warnings.push(`${row.race} 血脉为 ${row.percent}%，不是 10% 的倍数。`);
      }
      if (seenBloodlines.has(row.race)) {
        warnings.push(`${row.race} 血脉重复填写。`);
      }
      seenBloodlines.add(row.race);
    });
    const potentialLimit = calculateBasePotential(input);
    const actualPotential = input.characterPotential || potentialLimit;
    stats.forEach((stat) => {
      const actual = Number(actualPotential[stat]) || 0;
      if (actual > potentialLimit[stat] + 1e-9) {
        warnings.push(`${data.statLabels[stat]}潜力 ${actual} 超过血脉加权上限 ${round(potentialLimit[stat], 4)}。`);
      }
    });

    const divineSkills = selectedTraits.filter((item) => item.type === "divine_skill");
    const availableSkills = availableDivineRaces(input);
    if (divineSkills.length === 0) {
      warnings.push("尚未选择神技，战斗属性不会获得神技战斗值。");
    }
    if (divineSkills.length > 1) {
      warnings.push("选择了多个神技；规则要求有且仅有一个神技。当前会把神技战斗值相加，建议修正。");
    }
    divineSkills.forEach((skill) => {
      if (!hasAnyStat(skill.divineCombatValue)) {
        warnings.push(`${skill.name} 尚未录入神技战斗值，因此只会应用成长列。`);
      }
      if (!availableSkills.includes(skill.race)) {
        warnings.push(`${skill.name} 需要 ${skill.race} 血脉大于 70%；圣子神技不受血脉限制。`);
      }
    });

    const divineRace = divineSkills[0]?.race || "";
    const divineTraits = selectedTraits.filter((item) => item.type === "divine_trait");
    if (divineTraits.length > 2) {
      warnings.push("神子特性超过两个。");
    }
    divineTraits.forEach((item) => {
      if (divineRace && item.race !== divineRace) {
        warnings.push(`${item.name} 属于${item.race}神子特性，但当前神技属于${divineRace}。`);
      }
    });

    const mortalTraits = selectedTraits.filter((item) => item.type === "mortal_trait");
    if (mortalTraits.length > 3) {
      warnings.push("凡人特性超过三个。");
    }
    const allowedMortals = allowedMortalRaces(input);
    const mortalRaces = [...new Set(mortalTraits.map((item) => item.race).filter(Boolean))];
    if (mortalRaces.length > 2) {
      warnings.push(`凡人特性涉及 ${mortalRaces.length} 个种族，超过两个：${mortalRaces.join("、")}。`);
    }
    mortalTraits.forEach((item) => {
      if (!allowedMortals.includes(item.race)) {
        warnings.push(`${item.name} 不属于当前血脉最高的前两个种族凡人特性。`);
      }
    });

    const occupiedParts = new Map();
    selectedTraits.forEach((item) => {
      if (!item.part || item.type === "saint_trait") return;
      if (occupiedParts.has(item.part)) {
        warnings.push(`${item.part} 部位冲突：${occupiedParts.get(item.part)} 与 ${item.name}。`);
      } else {
        occupiedParts.set(item.part, item.name);
      }
    });

    const level = Number(input.level) || 0;
    if (level < 1) warnings.push("目标等级必须大于等于 1。");
    const currentLevel = currentStateEnabled(input) ? Number(input.currentState.currentLevel) || 1 : 0;
    const minGrowthLevel = currentLevel > 0 ? currentLevel + 1 : 1;
    if (currentStateEnabled(input)) {
      if (currentLevel < 1) warnings.push("当前等级必须大于等于 1。");
      if (currentLevel >= level) warnings.push(`当前等级 ${currentLevel} 必须低于目标等级 ${level}。`);
      if (!data.classValues[input.currentState.className]) {
        warnings.push(`当前职业未在职业值表中找到：${input.currentState.className}。`);
      }
    }
    const covered = new Map();
    input.growthSegments.forEach((segment, index) => {
      const from = Number(segment.fromLevel);
      const to = Number(segment.toLevel);
      if (!data.classGrowth[segment.className]) {
        warnings.push(`第 ${index + 1} 段成长职业未在职业潜力表中找到：${segment.className}。`);
      }
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
        warnings.push(`第 ${index + 1} 段成长等级范围无效。`);
        return;
      }
      if (from < minGrowthLevel || to > level) {
        warnings.push(`第 ${index + 1} 段成长范围 ${from}-${to} 超出 ${minGrowthLevel}-${level}。`);
      }
      for (let current = Math.max(minGrowthLevel, from); current <= Math.min(level, to); current += 1) {
        if (covered.has(current)) {
          warnings.push(`等级 ${current} 被多个成长区间覆盖。`);
          break;
        }
        covered.set(current, true);
      }
    });
    const expectedCovered = Math.max(0, level - minGrowthLevel + 1);
    if (level > 0 && covered.size < expectedCovered) {
      warnings.push(`成长路线只覆盖 ${covered.size}/${expectedCovered} 个可规划等级，未覆盖等级不会产生职业成长。`);
    }

    if (!data.classValues[input.finalClass]) {
      warnings.push(`最终职业未在职业值表中找到：${input.finalClass}。`);
    }

    return warnings;
  }

  function currentStateEnabled(input) {
    return Boolean(input.currentState?.enabled);
  }

  function deriveCurrentGrowth(input, traitFlat, traitMultiplierBonus) {
    const data = global.RULE_DATA;
    const currentState = input.currentState || {};
    if (!currentStateEnabled(input)) return zeroVector();
    const currentClassValue = data.classValues[currentState.className] || zeroVector();
    const result = zeroVector();
    stats.forEach((stat) => {
      const multiplier = Math.max(0.000001, 1 + (Number(traitMultiplierBonus[stat]) || 0));
      const statValue = Number(currentState.stats?.[stat]) || 0;
      result[stat] = statValue / multiplier - traitFlat[stat] - currentClassValue[stat];
    });
    return result;
  }

  function calculateGrowth(input) {
    const data = global.RULE_DATA;
    const selectedTraits = input.traitIds
      .map((id) => data.traits.find((trait) => trait.id === id))
      .filter(Boolean);
    const warnings = validateBuild(input, selectedTraits);
    const level = Number(input.level) || 0;

    const traitPotentialBonus = vectorSum(selectedTraits, "potentialBonus");
    const traitFlat = vectorSum(selectedTraits, "flatStats");
    const traitMultiplierBonus = vectorSum(selectedTraits, "multiplierStats");
    const divineCombatValue = vectorSum(selectedTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue");
    const finalClassValue = data.classValues[input.finalClass] || zeroVector();
    const potentialLimit = calculateBasePotential(input);
    const basePotential = Object.assign(zeroVector(), input.characterPotential || potentialLimit);

    const finalCharacterPotential = zeroVector();
    stats.forEach((stat) => {
      finalCharacterPotential[stat] = basePotential[stat] + traitPotentialBonus[stat];
    });

    const currentGrowth = deriveCurrentGrowth(input, traitFlat, traitMultiplierBonus);
    const ordinaryGrowth = cloneVector(currentGrowth);
    let routeEffectiveGrowthLevels = 0;
    const routePotentialGrowth = zeroVector();
    const minGrowthLevel = currentStateEnabled(input) ? (Number(input.currentState.currentLevel) || 0) + 1 : 1;
    const segmentBreakdowns = input.growthSegments.map((segment) => {
      const classPotential = data.classGrowth[segment.className] || zeroVector();
      const adjustedFromLevel = Math.max(Number(segment.fromLevel) || 1, minGrowthLevel);
      const adjustedToLevel = Math.min(Number(segment.toLevel) || 0, level);
      const levels = effectiveLevels(adjustedFromLevel, adjustedToLevel);
      routeEffectiveGrowthLevels += levels.total;
      const contribution = zeroVector();
      stats.forEach((stat) => {
        contribution[stat] = (finalCharacterPotential[stat] + classPotential[stat]) * levels.total;
        routePotentialGrowth[stat] += contribution[stat];
        ordinaryGrowth[stat] += contribution[stat];
      });
      return {
        ...segment,
        adjustedFromLevel,
        adjustedToLevel,
        effectiveLevels: levels.total,
        before60Levels: levels.before60,
        after60Levels: levels.after60,
        classPotential,
        contribution,
      };
    });

    const normalStats = zeroVector();
    const combatStats = zeroVector();
    const weightedFinalPotential = zeroVector();
    const breakdown = {};
    stats.forEach((stat) => {
      weightedFinalPotential[stat] = routeEffectiveGrowthLevels > 0
        ? routePotentialGrowth[stat] / routeEffectiveGrowthLevels
        : finalCharacterPotential[stat];
      const multiplier = 1 + traitMultiplierBonus[stat];
      const divineCombatAdd = level * divineCombatValue[stat];
      const equipment = Number(input.equipmentStats[stat]) || 0;
      const classValue = finalClassValue[stat];
      const normalInside = ordinaryGrowth[stat] + traitFlat[stat] + equipment + classValue;
      const combatInside = ordinaryGrowth[stat] + divineCombatAdd + traitFlat[stat] + equipment + classValue;
      normalStats[stat] = multiplier * normalInside;
      combatStats[stat] = multiplier * combatInside;
      breakdown[stat] = {
        basePotential: basePotential[stat],
        bloodlinePotential: basePotential[stat],
        traitPotentialBonus: traitPotentialBonus[stat],
        finalCharacterPotential: finalCharacterPotential[stat],
        weightedFinalPotential: weightedFinalPotential[stat],
        currentGrowth: currentGrowth[stat],
        ordinaryGrowth: ordinaryGrowth[stat],
        divineCombatValue: divineCombatValue[stat],
        divineCombatAdd,
        traitFlat: traitFlat[stat],
        equipment,
        classValue,
        multiplier,
        multiplierBonus: traitMultiplierBonus[stat],
        normalInside,
        combatInside,
        normal: normalStats[stat],
        combat: combatStats[stat],
        normalFormula: `${formatNumber(multiplier)} * (${formatNumber(ordinaryGrowth[stat])} + ${formatNumber(traitFlat[stat])} + ${formatNumber(equipment)} + ${formatNumber(classValue)})`,
        combatFormula: `${formatNumber(multiplier)} * (${formatNumber(ordinaryGrowth[stat])} + ${level} * ${formatNumber(divineCombatValue[stat])} + ${formatNumber(traitFlat[stat])} + ${formatNumber(equipment)} + ${formatNumber(classValue)})`,
      };
    });

    return {
      input,
      selectedTraits,
      bloodlineSummary: bloodlineSummary(input),
      potentialLimit,
      basePotential,
      currentGrowth,
      finalCharacterPotential,
      traitPotentialBonus,
      weightedFinalPotential,
      traitFlat,
      traitMultiplierBonus,
      divineCombatValue,
      segmentBreakdowns,
      normalStats,
      combatStats,
      breakdown,
      warnings,
    };
  }

  function cloneVector(source) {
    return Object.assign(zeroVector(), source || {});
  }

  function vectorHasStat(source, stat) {
    return Math.abs(Number(source?.[stat]) || 0) > 1e-9;
  }

  function normalizePlannerTargets(targets) {
    return (Array.isArray(targets) ? targets : [])
      .map((target, index) => ({
        id: target.id || `target-${index + 1}`,
        name: String(target.name || "").trim(),
        stat: stats.includes(target.stat) ? target.stat : stats[0],
        value: Number(target.value) || 0,
        groupId: String(target.groupId || "").trim(),
      }))
      .filter((target) => target.value > 0);
  }

  function normalizeGearSets(gearSets) {
    return (Array.isArray(gearSets) ? gearSets : [])
      .map((gear, index) => ({
        id: gear.id || `gear-${index + 1}`,
        name: String(gear.name || `套装 ${index + 1}`).trim(),
        primaryStats: (Array.isArray(gear.primaryStats) ? gear.primaryStats : [])
          .filter((stat, itemIndex, array) => stats.includes(stat) && array.indexOf(stat) === itemIndex)
          .slice(0, 2),
        weapon: {
          type: String(gear.weapon?.type || "").trim(),
          stats: cloneVector(gear.weapon?.stats),
        },
        armor: {
          type: String(gear.armor?.type || "").trim(),
          stats: cloneVector(gear.armor?.stats),
        },
      }))
      .filter((gear) => gear.name);
  }

  function gearSetStats(gearSet) {
    const result = zeroVector();
    addInto(result, gearSet?.weapon?.stats);
    addInto(result, gearSet?.armor?.stats);
    return result;
  }

  function gearSetSupportsStat(gearSet, stat) {
    return vectorHasStat(gearSet?.weapon?.stats, stat) || vectorHasStat(gearSet?.armor?.stats, stat);
  }

  function classCanUseGear(className, gearSet) {
    const equipment = global.RULE_DATA.classEquipment?.[className];
    if (!equipment || !gearSet) return false;
    const weaponType = gearSet.weapon?.type;
    const armorType = gearSet.armor?.type;
    const weaponOk = weaponType ? (equipment.weapons || []).includes(weaponType) : false;
    const armorOk = armorType ? equipment.armor === armorType : false;
    return weaponOk && armorOk;
  }

  function targetGroupKey(target) {
    return target.groupId || target.id;
  }

  function groupPlannerTargets(targets) {
    const byKey = new Map();
    targets.forEach((target) => {
      const key = targetGroupKey(target);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(target);
    });
    return [...byKey.entries()].map(([key, items]) => ({
      key,
      label: items.length > 1 ? `检查组 ${key}` : (items[0].name || global.RULE_DATA.statLabels[items[0].stat]),
      targets: items,
    }));
  }

  function classEffectiveCapacities(input) {
    const maxLevel = Number(input.level) || 0;
    const minLevel = currentStateEnabled(input) ? (Number(input.currentState.currentLevel) || 0) + 1 : 1;
    const covered = new Set();
    const capacities = new Map();
    (input.growthSegments || []).forEach((segment) => {
      const from = Math.max(minLevel, Number(segment.fromLevel) || 1);
      const to = Math.min(maxLevel, Number(segment.toLevel) || 0);
      if (from > to || !global.RULE_DATA.classGrowth[segment.className]) return;
      for (let level = from; level <= to; level += 1) {
        if (covered.has(level)) continue;
        covered.add(level);
        const effectiveLevels = level <= 60 ? 1 : 0.35;
        capacities.set(segment.className, (capacities.get(segment.className) || 0) + effectiveLevels);
      }
    });
    return Object.fromEntries([...capacities.entries()]);
  }

  function targetCheckFromResult(result, target) {
    const data = global.RULE_DATA;
    const breakdown = result.breakdown[target.stat];
    const multiplier = Math.max(0.000001, Number(breakdown.multiplier) || 1);
    const insideRequired = target.value / multiplier;
    const insideDeficit = Math.max(0, insideRequired - breakdown.normalInside);
    const value = result.normalStats[target.stat];
    return {
      id: target.id,
      name: target.name,
      groupId: target.groupId,
      stat: target.stat,
      label: data.statLabels[target.stat],
      required: target.value,
      value,
      deficit: Math.max(0, target.value - value),
      insideDeficit,
      insideRequired,
      normalInside: breakdown.normalInside,
      multiplier,
    };
  }

  function fallbackThresholdCheck(input, group) {
    const build = Object.assign({}, input, {
      equipmentStats: zeroVector(),
      finalClass: input.finalClass,
    });
    const result = calculateGrowth(build);
    const targetChecks = group.targets.map((target) => targetCheckFromResult(result, target));
    return {
      key: group.key,
      label: group.label,
      className: input.finalClass,
      gearSetId: "",
      gearSetName: "无匹配套装",
      gearStats: zeroVector(),
      compatible: false,
      result,
      targetChecks,
      met: false,
      deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0),
    };
  }

  function thresholdCheckForState(input, group, gearSet, className) {
    const gearStats = gearSetStats(gearSet);
    const build = Object.assign({}, input, {
      equipmentStats: gearStats,
      finalClass: className,
    });
    const result = calculateGrowth(build);
    const targetChecks = group.targets.map((target) => targetCheckFromResult(result, target));
    return {
      key: group.key,
      label: group.label,
      className,
      gearSetId: gearSet.id,
      gearSetName: gearSet.name,
      gearStats,
      compatible: true,
      result,
      targetChecks,
      met: targetChecks.every((target) => target.deficit <= 1e-7),
      deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0),
    };
  }

  function bestThresholdCheck(input, group, gearSets) {
    const data = global.RULE_DATA;
    const candidates = [];
    Object.keys(data.classValues).forEach((className) => {
      gearSets.forEach((gearSet) => {
        if (!classCanUseGear(className, gearSet)) return;
        candidates.push(thresholdCheckForState(input, group, gearSet, className));
      });
    });
    if (!candidates.length) {
      return Object.assign(fallbackThresholdCheck(input, group), {
        alternatives: [],
      });
    }
    candidates.sort((a, b) => (
      a.deficitSum - b.deficitSum
      || Number(!a.met) - Number(!b.met)
      || b.targetChecks.reduce((sum, target) => sum + target.value, 0) - a.targetChecks.reduce((sum, target) => sum + target.value, 0)
    ));
    return Object.assign(candidates[0], {
      alternatives: candidates.slice(1, 4),
    });
  }

  function aggregatePlannerAllocations(allocations) {
    return Object.values(allocations || {})
      .filter((item) => item.effectiveLevels > 1e-7)
      .sort((a, b) => (
        b.effectiveLevels - a.effectiveLevels
        || a.newClass.localeCompare(b.newClass, "zh-CN")
      ));
  }

  function allocationCount(state) {
    return aggregatePlannerAllocations(state.allocations).length;
  }

  function selectPlannerStates(states, objectiveSort) {
    if (!states.length) return [];
    const sorted = [...states].sort(objectiveSort);
    const selected = [];
    const pushUnique = (state, displayGroup) => {
      if (!state || selected.includes(state)) return;
      state.displayGroup = displayGroup;
      selected.push(state);
    };
    pushUnique(sorted[0], "best");
    sorted.filter((state) => allocationCount(state) > 1).slice(0, 3).forEach((state) => pushUnique(state, "combo"));
    sorted.filter((state) => allocationCount(state) <= 1).slice(0, 2).forEach((state) => pushUnique(state, "single"));
    sorted.forEach((state) => {
      if (selected.length < 6) pushUnique(state, "other");
    });
    return selected.slice(0, 6);
  }

  function flattenTargetChecks(checks) {
    return checks.flatMap((check) => check.targetChecks.map((target) => Object.assign({}, target, {
      checkKey: check.key,
      checkLabel: check.label,
      className: check.className,
      gearSetId: check.gearSetId,
      gearSetName: check.gearSetName,
    })));
  }

  function coreStatVector(config) {
    const result = zeroVector();
    if (Array.isArray(config.coreStats)) {
      config.coreStats.forEach((stat) => {
        if (stats.includes(stat)) result[stat] = 1;
      });
      return result;
    }
    stats.forEach((stat) => {
      result[stat] = Number(config.coreWeights?.[stat]) > 0 ? 1 : 0;
    });
    return result;
  }

  function optimizeThresholdPlan(input, config, checks, growthClasses) {
    const data = global.RULE_DATA;
    const coreStats = coreStatVector(config);
    const targetChecks = flattenTargetChecks(checks);
    const initialRemaining = {};
    targetChecks.forEach((target) => {
      initialRemaining[target.id] = Math.max(0, target.insideDeficit || 0);
    });
    if (Object.values(initialRemaining).every((value) => value <= 1e-7)) {
      return [{
        title: "当前路线",
        reachable: true,
        alreadyMet: true,
        weightedLoss: 0,
        coreLossSum: 0,
        replacementCount: 0,
        effectiveChanged: 0,
        coreLoss: zeroVector(),
        delta: zeroVector(),
        targetResults: targetChecks,
        allocations: {},
        requirements: [],
      }];
    }

    const initialCapacities = classEffectiveCapacities(input);
    const baseClasses = Object.keys(initialCapacities).filter((className) => initialCapacities[className] > 1e-7);
    if (!baseClasses.length || !growthClasses.length) {
      return [];
    }

    const transitions = baseClasses.flatMap((baseClass) => {
      const baseGrowth = data.classGrowth[baseClass] || zeroVector();
      return growthClasses
        .filter((newClass) => newClass !== baseClass)
        .map((newClass) => {
          const newGrowth = data.classGrowth[newClass] || zeroVector();
          const perEffectiveDelta = zeroVector();
          stats.forEach((stat) => {
            perEffectiveDelta[stat] = newGrowth[stat] - baseGrowth[stat];
          });
          const targetProgress = targetChecks.reduce((sum, target) => sum + Math.max(0, perEffectiveDelta[target.stat]), 0);
          const coreLossPerEffective = zeroVector();
          let weightedLossPerEffective = 0;
          stats.forEach((stat) => {
            const selected = Number(coreStats[stat]) > 0;
            coreLossPerEffective[stat] = selected ? Math.max(0, -perEffectiveDelta[stat]) : 0;
            weightedLossPerEffective += coreLossPerEffective[stat];
          });
          return {
            key: `${baseClass}->${newClass}`,
            baseClass,
            newClass,
            perEffectiveDelta,
            targetProgress,
            coreLossPerEffective,
            weightedLossPerEffective,
          };
        })
        .filter((transition) => transition.targetProgress > 1e-9);
    });
    if (!transitions.length) {
      return [];
    }

    const targetKeys = targetChecks.map((target) => target.id);
    const beamWidth = 520;
    const maxIterations = Math.min(18, Math.max(8, targetKeys.length * 5 + baseClasses.length * 2));
    const stateKey = (state) => [
      targetKeys.map((key) => round(state.remaining[key] || 0, 3)).join("|"),
      baseClasses.map((className) => `${className}:${round(state.capacities[className] || 0, 3)}`).join("|"),
    ].join("::");
    const unmetSum = (remaining) => targetKeys.reduce((sum, key) => sum + Math.max(0, remaining[key] || 0), 0);
    const objectiveSort = (a, b) => (
      a.weightedLoss - b.weightedLoss
      || unmetSum(a.remaining) - unmetSum(b.remaining)
      || a.effectiveChanged - b.effectiveChanged
    );
    const initialState = {
      remaining: Object.assign({}, initialRemaining),
      capacities: Object.assign({}, initialCapacities),
      weightedLoss: 0,
      effectiveChanged: 0,
      coreLoss: zeroVector(),
      delta: zeroVector(),
      allocations: {},
    };
    let beam = [initialState];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const next = [...beam];
      let added = false;
      beam.forEach((state) => {
        transitions.forEach((transition) => {
          const capacity = Number(state.capacities[transition.baseClass]) || 0;
          if (capacity <= 1e-7) return;
          const helpedTargets = targetChecks
            .map((target) => ({
              target,
              delta: transition.perEffectiveDelta[target.stat],
              remaining: Number(state.remaining[target.id]) || 0,
            }))
            .filter((item) => item.remaining > 1e-7 && item.delta > 1e-9);
          if (!helpedTargets.length) return;

          const maxUseful = Math.max(...helpedTargets.map((item) => item.remaining / item.delta));
          const amountChoices = [
            ...helpedTargets.map((item) => item.remaining / item.delta),
            maxUseful,
            capacity,
          ]
            .map((value) => Math.min(capacity, value))
            .filter((value, index, array) => value > 1e-7 && array.findIndex((item) => Math.abs(item - value) <= 1e-7) === index)
            .sort((a, b) => a - b);

          amountChoices.forEach((amount) => {
            const delta = zeroVector();
            const coreLoss = zeroVector();
            stats.forEach((stat) => {
              delta[stat] = transition.perEffectiveDelta[stat] * amount;
              coreLoss[stat] = transition.coreLossPerEffective[stat] * amount;
            });
            const remaining = Object.assign({}, state.remaining);
            targetChecks.forEach((target) => {
              remaining[target.id] = Math.max(0, (remaining[target.id] || 0) - delta[target.stat]);
            });
            const totalCoreLoss = cloneVector(state.coreLoss);
            const totalDelta = cloneVector(state.delta);
            stats.forEach((stat) => {
              totalCoreLoss[stat] += coreLoss[stat];
              totalDelta[stat] += delta[stat];
            });
            const capacities = Object.assign({}, state.capacities);
            capacities[transition.baseClass] = Math.max(0, capacity - amount);
            const allocations = Object.assign({}, state.allocations);
            const previous = allocations[transition.key] || {
              baseClass: transition.baseClass,
              newClass: transition.newClass,
              effectiveLevels: 0,
              delta: zeroVector(),
            };
            const allocationDelta = cloneVector(previous.delta);
            addInto(allocationDelta, delta);
            allocations[transition.key] = {
              baseClass: transition.baseClass,
              newClass: transition.newClass,
              effectiveLevels: previous.effectiveLevels + amount,
              delta: allocationDelta,
            };
            next.push({
              remaining,
              capacities,
              weightedLoss: state.weightedLoss + transition.weightedLossPerEffective * amount,
              effectiveChanged: state.effectiveChanged + amount,
              coreLoss: totalCoreLoss,
              delta: totalDelta,
              allocations,
            });
            added = true;
          });
        });
      });
      if (!added) break;

      const bestByKey = new Map();
      next.sort(objectiveSort);
      next.forEach((state) => {
        const key = stateKey(state);
        if (!bestByKey.has(key)) bestByKey.set(key, state);
      });
      const candidates = [...bestByKey.values()];
      const lowLoss = [...candidates]
        .sort(objectiveSort)
        .slice(0, Math.ceil(beamWidth / 2));
      const nearTarget = [...candidates]
        .sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b))
        .slice(0, Math.floor(beamWidth / 2));
      const merged = new Map();
      [...lowLoss, ...nearTarget].forEach((state) => {
        const key = `${stateKey(state)}:${round(state.weightedLoss, 4)}:${round(state.effectiveChanged, 3)}`;
        if (!merged.has(key)) merged.set(key, state);
      });
      beam = [...merged.values()].slice(0, beamWidth);
    }

    const metStates = beam
      .filter((state) => unmetSum(state.remaining) <= 1e-7)
      .sort(objectiveSort);
    const fallbackStates = metStates.length
      ? selectPlannerStates(metStates, objectiveSort)
      : beam.sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b)).slice(0, 3);

    return fallbackStates.map((state) => {
      const targetResults = targetChecks.map((target) => {
        const projectedInside = target.normalInside + state.delta[target.stat];
        const projectedValue = projectedInside * target.multiplier;
        return Object.assign({}, target, {
          value: projectedValue,
          deficit: Math.max(0, target.required - projectedValue),
          insideDeficit: Math.max(0, target.required / target.multiplier - projectedInside),
        });
      });
      return {
        title: "自动匹配",
        displayGroup: state.displayGroup || "other",
        reachable: targetResults.every((target) => target.deficit <= 1e-7),
        alreadyMet: false,
        weightedLoss: state.weightedLoss,
        coreLossSum: state.weightedLoss,
        replacementCount: aggregatePlannerAllocations(state.allocations).length,
        effectiveChanged: state.effectiveChanged,
        coreLoss: state.coreLoss,
        delta: state.delta,
        targetResults,
        allocations: state.allocations,
        requirements: aggregatePlannerAllocations(state.allocations),
      };
    });
  }

  function planSkillThreshold(input, plannerConfig) {
    const data = global.RULE_DATA;
    const config = plannerConfig || {};
    const targets = normalizePlannerTargets(config.targets);
    const gearSets = normalizeGearSets(config.gearSets);
    const growthClasses = Object.keys(data.classGrowth);
    const warnings = [];

    if (!targets.length) warnings.push("尚未设置有效技能门槛。");
    if (!gearSets.length) warnings.push("尚未填写属性套装，无法自动匹配学习状态。");

    targets.forEach((target) => {
      if (gearSets.length && !gearSets.some((gearSet) => gearSetSupportsStat(gearSet, target.stat))) {
        warnings.push(`${target.name || data.statLabels[target.stat]} 需要${data.statLabels[target.stat]}，但当前没有套装提供该属性。`);
      }
    });
    gearSets.forEach((gearSet) => {
      const compatibleClasses = Object.keys(data.classValues).filter((className) => classCanUseGear(className, gearSet));
      if (!compatibleClasses.length) {
        warnings.push(`${gearSet.name} 没有匹配的可用职业，请检查武器与护甲类型。`);
      }
    });

    const targetGroups = groupPlannerTargets(targets);
    const checks = targetGroups.map((group) => bestThresholdCheck(input, group, gearSets));
    checks.forEach((check) => {
      if (!check.compatible) {
        warnings.push(`${check.label} 没有可用的套装 + 职业组合。`);
      }
    });
    const meetsCurrent = checks.length > 0 && checks.every((check) => check.met);
    const displayGroupRank = { best: 0, combo: 1, single: 2, other: 3 };
    const plans = targets.length && checks.every((check) => check.compatible)
      ? optimizeThresholdPlan(input, config, checks, growthClasses)
        .sort((a, b) => (
          (displayGroupRank[a.displayGroup] ?? 3) - (displayGroupRank[b.displayGroup] ?? 3)
          || Number(!a.reachable) - Number(!b.reachable)
          || a.weightedLoss - b.weightedLoss
          || a.replacementCount - b.replacementCount
        ))
        .slice(0, 6)
      : [];

    return {
      targets,
      gearSets,
      targetGroups,
      coreStats: stats.filter((stat) => Number(coreStatVector(config)[stat]) > 0),
      checks,
      meetsCurrent,
      plans,
      warnings,
    };
  }

  function normalizedLimitWeights(config) {
    const result = zeroVector();
    stats.forEach((stat) => {
      result[stat] = Math.max(0, Number(config?.targetWeights?.[stat]) || 0);
    });
    if (!stats.some((stat) => result[stat] > 0)) {
      result.technique = 1;
      result.agility = 1;
    }
    return result;
  }

  function limitWeightSum(weights) {
    return stats.reduce((sum, stat) => sum + (Number(weights[stat]) || 0), 0);
  }

  function scoreStatVector(vector, weights) {
    return stats.reduce((sum, stat) => sum + (Number(vector?.[stat]) || 0) * (Number(weights?.[stat]) || 0), 0);
  }

  function createRng(seed) {
    let state = Math.max(1, Math.floor(Number(seed) || 1)) % 2147483647;
    return () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
  }

  function combinations(items, maxSize) {
    const result = [[]];
    const limit = Math.min(maxSize, items.length);
    function walk(start, picked) {
      if (picked.length) result.push([...picked]);
      if (picked.length >= limit) return;
      for (let i = start; i < items.length; i += 1) {
        picked.push(items[i]);
        walk(i + 1, picked);
        picked.pop();
      }
    }
    walk(0, []);
    return result;
  }

  function traitsHavePartConflict(traits) {
    const seen = new Set();
    for (const trait of traits) {
      const part = String(trait.part || "").trim();
      if (!part) continue;
      if (seen.has(part)) return true;
      seen.add(part);
    }
    return false;
  }

  function traitSearchScore(traits, weights, level) {
    const flat = vectorSum(traits, "flatStats");
    const multiplier = vectorSum(traits, "multiplierStats");
    const potential = vectorSum(traits, "potentialBonus");
    const divine = vectorSum(traits.filter((item) => item.type === "divine_skill"), "divineCombatValue");
    return stats.reduce((sum, stat) => {
      const weight = Number(weights[stat]) || 0;
      return sum
        + weight * (flat[stat] + potential[stat] * 40 + divine[stat] * (Number(level) || 0) + multiplier[stat] * 120);
    }, 0);
  }

  function traitIdsLabel(ids) {
    const data = global.RULE_DATA;
    return ids
      .map((id) => data.traits.find((trait) => trait.id === id)?.name)
      .filter(Boolean)
      .join("，");
  }

  function generateTraitCombosForBuild(input, config, weights) {
    const data = global.RULE_DATA;
    const level = Number(config.level) || Number(input.level) || 1;
    const maxTraitCombos = Math.max(1, Math.min(80, Number(config.maxTraitCombos) || 8));
    const availableSkillRaces = availableDivineRaces(input);
    const skillTraits = data.traits.filter((trait) => (
      trait.type === "divine_skill" && availableSkillRaces.includes(trait.race)
    ));
    const skillChoices = skillTraits.length ? skillTraits : [null];
    const mortalPool = data.traits.filter((trait) => (
      trait.type === "mortal_trait" && allowedMortalRaces(input).includes(trait.race)
    ));
    const mortalCombos = combinations(mortalPool, 3)
      .filter((items) => !traitsHavePartConflict(items));
    const candidates = [];

    skillChoices.forEach((skill) => {
      const dependentType = skill?.race === "圣子" ? "saint_trait" : "divine_trait";
      const dependentPool = skill
        ? data.traits.filter((trait) => trait.type === dependentType && trait.race === skill.race)
        : [];
      const dependentCombos = combinations(dependentPool, 2)
        .filter((items) => !traitsHavePartConflict(items));
      dependentCombos.forEach((dependent) => {
        mortalCombos.forEach((mortal) => {
          const traits = [skill, ...dependent, ...mortal].filter(Boolean);
          if (traitsHavePartConflict(traits)) return;
          candidates.push({
            traitIds: traits.map((trait) => trait.id),
            label: traitIdsLabel(traits.map((trait) => trait.id)) || "无神子特性",
            score: traitSearchScore(traits, weights, level),
          });
        });
      });
    });

    return candidates
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "zh-CN"))
      .slice(0, maxTraitCombos);
  }

  function bloodlineKey(rows) {
    return rows
      .map((row) => `${row.race}:${row.percent}`)
      .join("|");
  }

  function generateBloodlineCombos(config) {
    const data = global.RULE_DATA;
    const allowed = (Array.isArray(config.bloodlineRaces) && config.bloodlineRaces.length
      ? config.bloodlineRaces
      : Object.keys(data.races).filter((race) => race !== data.commonerRace))
      .filter((race, index, array) => data.races[race] && race !== data.commonerRace && array.indexOf(race) === index);
    const step = Math.max(10, Math.min(50, Number(config.bloodlineStep) || 10));
    const maxCombos = Math.max(1, Math.min(120, Number(config.maxBloodlineCombos) || 18));
    const rows = [];

    allowed.forEach((race) => {
      rows.push([{ race, percent: 100 }]);
      rows.push([{ race, percent: 90 }]);
      rows.push([{ race, percent: 80 }]);
    });

    if (config.allowMixedBloodlines !== false) {
      for (let i = 0; i < allowed.length; i += 1) {
        for (let j = i + 1; j < allowed.length; j += 1) {
          for (let percent = step; percent < 100; percent += step) {
            rows.push([
              { race: allowed[i], percent },
              { race: allowed[j], percent: 100 - percent },
            ]);
          }
        }
      }
    }

    const seen = new Set();
    return rows.filter((combo) => {
      const key = bloodlineKey(combo);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxCombos);
  }

  function limitStatPriorities(config, weights, plannerConfig) {
    const result = zeroVector();
    const maxWeight = Math.max(...stats.map((stat) => Number(weights[stat]) || 0), 0.000001);
    stats.forEach((stat) => {
      result[stat] = Math.max(result[stat], Math.min(1, (Number(weights[stat]) || 0) / maxWeight));
    });
    if (Number(config.equipmentWeight) > 0) {
      result.constitution = Math.max(result.constitution, 0.72);
    }
    normalizePlannerTargets(plannerConfig?.targets || []).forEach((target) => {
      result[target.stat] = Math.max(result[target.stat], 0.62);
    });
    return result;
  }

  function samplePotential(potentialLimit, priorities, rng, ideal) {
    const result = zeroVector();
    stats.forEach((stat) => {
      const upper = Math.max(0, (Number(potentialLimit[stat]) || 0) - 0.02);
      const priority = Math.max(0, Math.min(1, Number(priorities[stat]) || 0));
      const lower = Math.min(upper, upper * (0.16 + priority * 0.52));
      if (ideal) {
        result[stat] = upper;
      } else {
        const roll = rng();
        const biasedRoll = priority > 0.45 ? Math.max(roll, rng() * priority) : roll;
        result[stat] = lower + (upper - lower) * biasedRoll;
      }
    });
    return result;
  }

  function bestLearningSupport(target, gearSets) {
    const data = global.RULE_DATA;
    let best = null;
    gearSets.forEach((gearSet) => {
      const gearStats = gearSetStats(gearSet);
      Object.keys(data.classValues).forEach((className) => {
        if (!classCanUseGear(className, gearSet)) return;
        const support = (Number(gearStats[target.stat]) || 0) + (Number(data.classValues[className]?.[target.stat]) || 0);
        if (!best || support > best.support) {
          best = {
            support,
            gearSetName: gearSet.name,
            className,
          };
        }
      });
    });
    return best || { support: 0, gearSetName: "无套装", className: "无职业", missing: gearSets.length > 0 };
  }

  function buildRouteRequirements(config, plannerConfig, constants, warnings) {
    const requirements = zeroVector();
    const details = [];
    const level = Number(config.level) || 1;
    const equipmentWeight = Number(config.equipmentWeight) || 0;
    if (equipmentWeight > 0) {
      const requiredCombatConstitution = equipmentWeight / 3.5;
      const multiplier = Math.max(0.000001, 1 + constants.traitMultiplierBonus.constitution);
      const requiredInside = requiredCombatConstitution / multiplier;
      const fixedInside = level * constants.divineCombatValue.constitution
        + constants.traitFlat.constitution
        + (Number(config.equipmentStats?.constitution) || 0)
        + constants.finalClassValue.constitution;
      const neededGrowth = requiredInside - fixedInside;
      requirements.constitution = Math.max(requirements.constitution, neededGrowth);
      details.push({
        label: "最终负重",
        stat: "constitution",
        required: requiredCombatConstitution,
        growthRequired: Math.max(0, neededGrowth),
      });
    }

    const targets = config.usePlannerTargets === false
      ? []
      : normalizePlannerTargets(plannerConfig?.targets || []);
    const gearSets = normalizeGearSets(plannerConfig?.gearSets || []);
    targets.forEach((target) => {
      const support = bestLearningSupport(target, gearSets);
      if (support.missing) {
        warnings.push(`${target.name || global.RULE_DATA.statLabels[target.stat]} 没有可匹配的学习套装与职业，暂按无外部支持估算。`);
      }
      const multiplier = Math.max(0.000001, 1 + constants.traitMultiplierBonus[target.stat]);
      const requiredInside = target.value / multiplier;
      const fixedInside = constants.traitFlat[target.stat] + support.support;
      const neededGrowth = requiredInside - fixedInside;
      requirements[target.stat] = Math.max(requirements[target.stat], neededGrowth);
      details.push({
        label: target.name || global.RULE_DATA.statLabels[target.stat],
        stat: target.stat,
        required: target.value,
        growthRequired: Math.max(0, neededGrowth),
        gearSetName: support.gearSetName,
        className: support.className,
      });
    });
    return { requirements, details };
  }

  function routeAllocationsText(allocations) {
    return Object.entries(allocations)
      .filter(([, value]) => Number(value) > 1e-6)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .map(([className, value]) => ({ className, effectiveLevels: value }));
  }

  function optimizeLimitRoute(context) {
    const data = global.RULE_DATA;
    const totalEffectiveLevels = effectiveLevels(1, context.level).total;
    const classNames = Object.keys(data.classGrowth);
    const rates = {};
    const scoreRates = {};
    classNames.forEach((className) => {
      rates[className] = zeroVector();
      stats.forEach((stat) => {
        rates[className][stat] = context.finalCharacterPotential[stat] + (Number(data.classGrowth[className]?.[stat]) || 0);
      });
      scoreRates[className] = scoreStatVector(rates[className], context.combatScoreWeights);
    });

    function evaluate(allocations) {
      const growth = zeroVector();
      Object.entries(allocations).forEach(([className, amount]) => {
        stats.forEach((stat) => {
          growth[stat] += rates[className][stat] * amount;
        });
      });
      const normalStats = zeroVector();
      const combatStats = zeroVector();
      stats.forEach((stat) => {
        const multiplier = 1 + context.traitMultiplierBonus[stat];
        const fixedNormal = context.traitFlat[stat]
          + (Number(context.equipmentStats?.[stat]) || 0)
          + context.finalClassValue[stat];
        const fixedCombat = fixedNormal + context.level * context.divineCombatValue[stat];
        normalStats[stat] = multiplier * (growth[stat] + fixedNormal);
        combatStats[stat] = multiplier * (growth[stat] + fixedCombat);
      });
      const deficits = zeroVector();
      stats.forEach((stat) => {
        deficits[stat] = Math.max(0, (Number(context.requirements[stat]) || 0) - growth[stat]);
      });
      const deficitSum = stats.reduce((sum, stat) => sum + deficits[stat], 0);
      return {
        allocations,
        allocationList: routeAllocationsText(allocations),
        growth,
        normalStats,
        combatStats,
        score: scoreStatVector(combatStats, context.targetWeights),
        met: deficitSum <= 1e-6,
        deficits,
        deficitSum,
      };
    }

    function repair(startClass) {
      const allocations = Object.fromEntries(classNames.map((className) => [className, 0]));
      allocations[startClass] = totalEffectiveLevels;
      let current = evaluate(allocations);
      for (let iteration = 0; iteration < 16 && !current.met; iteration += 1) {
        let bestMove = null;
        Object.entries(allocations).forEach(([fromClass, amount]) => {
          if (amount <= 1e-6) return;
          classNames.forEach((toClass) => {
            if (toClass === fromClass) return;
            const delta = zeroVector();
            let progress = 0;
            let maxUseful = amount;
            stats.forEach((stat) => {
              delta[stat] = rates[toClass][stat] - rates[fromClass][stat];
              if (current.deficits[stat] > 1e-6 && delta[stat] > 1e-9) {
                progress += Math.min(current.deficits[stat], delta[stat]);
                maxUseful = Math.min(maxUseful, current.deficits[stat] / delta[stat]);
              }
            });
            if (progress <= 1e-9 || maxUseful <= 1e-9) return;
            const amountToMove = Math.max(0.000001, Math.min(amount, maxUseful));
            const scoreLoss = Math.max(0, (scoreRates[fromClass] - scoreRates[toClass]) * amountToMove);
            const ratio = scoreLoss / (progress * amountToMove);
            if (!bestMove || ratio < bestMove.ratio) {
              bestMove = { fromClass, toClass, amount: amountToMove, ratio };
            }
          });
        });
        if (!bestMove) break;
        allocations[bestMove.fromClass] -= bestMove.amount;
        allocations[bestMove.toClass] += bestMove.amount;
        current = evaluate(allocations);
      }
      return current;
    }

    const orderedStarts = [...classNames]
      .sort((a, b) => scoreRates[b] - scoreRates[a])
      .slice(0, Math.min(18, classNames.length));
    stats.forEach((stat) => {
      const bestForStat = [...classNames].sort((a, b) => rates[b][stat] - rates[a][stat])[0];
      if (bestForStat && !orderedStarts.includes(bestForStat)) orderedStarts.push(bestForStat);
    });

    return orderedStarts
      .map((className) => repair(className))
      .sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score || a.deficitSum - b.deficitSum)[0];
  }

  function percentile(sortedValues, pct) {
    if (!sortedValues.length) return 0;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * pct) - 1));
    return sortedValues[index];
  }

  function aggregateLimitStats(results) {
    const sortedScores = results.map((item) => item.score).sort((a, b) => a - b);
    const passCount = results.filter((item) => item.met).length;
    const average = sortedScores.reduce((sum, value) => sum + value, 0) / Math.max(1, sortedScores.length);
    return {
      average,
      median: percentile(sortedScores, 0.5),
      p90: percentile(sortedScores, 0.9),
      p95: percentile(sortedScores, 0.95),
      passRate: passCount / Math.max(1, results.length),
    };
  }

  function evaluateOneLimitBuild(baseInput, traitIds, config, plannerConfig, rng, priorities) {
    const data = global.RULE_DATA;
    const level = Number(config.level) || 1;
    const selectedTraits = traitIds.map((id) => data.traits.find((trait) => trait.id === id)).filter(Boolean);
    const traitPotentialBonus = vectorSum(selectedTraits, "potentialBonus");
    const constants = {
      traitFlat: vectorSum(selectedTraits, "flatStats"),
      traitMultiplierBonus: vectorSum(selectedTraits, "multiplierStats"),
      divineCombatValue: vectorSum(selectedTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue"),
      finalClassValue: data.classValues[config.finalClass] || zeroVector(),
    };
    const warnings = [];
    const requirements = buildRouteRequirements(config, plannerConfig, constants, warnings);
    const potentialLimit = calculateBasePotential(baseInput);
    const sampleCount = Math.max(1, Math.min(200, Number(config.sampleCount) || 16));
    const weights = normalizedLimitWeights(config);
    const combatScoreWeights = zeroVector();
    stats.forEach((stat) => {
      combatScoreWeights[stat] = weights[stat] * (1 + constants.traitMultiplierBonus[stat]);
    });

    function runSample(characterPotential, ideal) {
      const finalCharacterPotential = zeroVector();
      stats.forEach((stat) => {
        finalCharacterPotential[stat] = characterPotential[stat] + traitPotentialBonus[stat];
      });
      const route = optimizeLimitRoute({
        level,
        finalCharacterPotential,
        traitFlat: constants.traitFlat,
        traitMultiplierBonus: constants.traitMultiplierBonus,
        divineCombatValue: constants.divineCombatValue,
        finalClassValue: constants.finalClassValue,
        equipmentStats: config.equipmentStats || zeroVector(),
        requirements: requirements.requirements,
        targetWeights: weights,
        combatScoreWeights,
      });
      return Object.assign(route, { characterPotential, ideal });
    }

    const theory = runSample(samplePotential(potentialLimit, priorities, rng, true), true);
    const samples = [];
    for (let i = 0; i < sampleCount; i += 1) {
      samples.push(runSample(samplePotential(potentialLimit, priorities, rng, false), false));
    }
    const aggregate = aggregateLimitStats(samples);
    const bestSample = [...samples].sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score)[0];
    return {
      traitIds,
      traitLabel: traitIdsLabel(traitIds),
      theory,
      bestSample,
      samples,
      aggregate,
      requirementDetails: requirements.details,
      warnings,
    };
  }

  function evaluateBuildLimits(config, plannerConfig) {
    const weights = normalizedLimitWeights(config);
    const warnings = [];
    if (limitWeightSum(weights) <= 0) warnings.push("未设置目标权重，已按技巧/敏捷各 1 计算。");
    const rng = createRng(config.seed || 20260623);
    const priorities = limitStatPriorities(config, weights, plannerConfig);
    const bloodlines = Array.isArray(config.bloodlines) && config.bloodlines.length
      ? config.bloodlines
      : [];
    const traitIds = Array.isArray(config.traitIds)
      ? config.traitIds.filter((id, index, array) => array.indexOf(id) === index)
      : [];
    const baseInput = {
      sex: config.sex || "女",
      level: Number(config.level) || 1,
      bloodlines,
      traitIds,
      growthSegments: [],
      equipmentStats: config.equipmentStats || zeroVector(),
      finalClass: config.finalClass,
    };
    const evaluated = [];
    if (!bloodlines.length) {
      warnings.push("当前未指定血脉，系统会按 100% 平民血脉评估。");
    }
    if (!traitIds.length) {
      warnings.push("当前未选择特性，本轮会按无特性构筑评估。");
    }
    const result = evaluateOneLimitBuild(baseInput, traitIds, config, plannerConfig, rng, priorities);
    result.bloodlines = bloodlines;
    result.bloodlineLabel = bloodlineSummary({ bloodlines })
      .map((row) => `${row.race}${row.percent}%${row.autoFilled ? "(自动)" : ""}`)
      .join(" + ");
    result.warnings.forEach((warning) => {
      if (!warnings.includes(warning)) warnings.push(warning);
    });
    evaluated.push(result);

    return {
      generatedBloodlineCount: 1,
      evaluatedBuildCount: evaluated.length,
      sampleCount: Math.max(1, Math.min(200, Number(config.sampleCount) || 16)),
      seed: config.seed || 20260623,
      targetWeights: weights,
      priorities,
      results: evaluated,
      warnings,
    };
  }

  global.GrowthCalc = {
    calculateGrowth,
    planSkillThreshold,
    evaluateBuildLimits,
    calculateBasePotential,
    bloodlineSummary,
    bloodlineTotal,
    availableDivineRaces,
    allowedMortalRaces,
    traitRaceForBloodline,
    effectiveLevels,
    round,
    formatNumber,
  };
})(typeof window !== "undefined" ? window : globalThis);
