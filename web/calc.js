(function (global) {
  const data = global.RULE_DATA;
  const core = global.ZhushenCore;

  if (!data || !core) {
    throw new Error("GrowthCalc requires RULE_DATA and ZhushenCore to be loaded first.");
  }

  function calculateGrowth(input) {
    return core.calculateGrowth(data, input);
  }

  function planSkillThreshold(input, plannerConfig) {
    return core.planSkillThreshold(data, input, plannerConfig);
  }

  function evaluateBuildLimits(config, plannerConfig) {
    return core.evaluateBuildLimits(data, config, plannerConfig);
  }

  function calculateBasePotential(input) {
    return core.calculateBasePotential(data, input);
  }

  function calculateHeirloomAttributes(input) {
    return core.calculateHeirloomAttributes(data, input);
  }

  function bloodlineSummary(input) {
    return core.bloodlineSummary(data, input);
  }

  function bloodlineTotal(input) {
    return core.bloodlineTotal(input);
  }

  function availableDivineRaces(input) {
    return core.availableDivineRaces(data, input);
  }

  function allowedMortalRaces(input) {
    return core.allowedMortalRaces(data, input);
  }

  function traitRaceForBloodline(race) {
    return core.traitRaceForBloodline(data, race);
  }

  global.GrowthCalc = {
    calculateGrowth,
    planSkillThreshold,
    evaluateBuildLimits,
    calculateBasePotential,
    calculateHeirloomAttributes,
    bloodlineSummary,
    bloodlineTotal,
    availableDivineRaces,
    allowedMortalRaces,
    traitRaceForBloodline,
    effectiveLevels: core.effectiveLevels,
    round: core.round,
    formatNumber: core.formatNumber,
  };
})(typeof window !== "undefined" ? window : globalThis);
