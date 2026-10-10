var ZhushenCoreBundle = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region \0rolldown/runtime.js
	var __defProp = Object.defineProperty;
	var __exportAll = (all, no_symbols) => {
		let target = {};
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
		if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
		return target;
	};
	//#endregion
	//#region packages/core/src/types/stat.ts
	const statKeys = [
		"strength",
		"technique",
		"agility",
		"perception",
		"will",
		"constitution"
	];
	const statLabels = {
		strength: "力量",
		technique: "技巧",
		agility: "敏捷",
		perception: "感知",
		will: "意志",
		constitution: "体质"
	};
	//#endregion
	//#region packages/core/src/rules/rule-data.ts
	function traitRaceForBloodline(data, race) {
		return data.bloodlineTraitRaceMap?.[race] || race;
	}
	//#endregion
	//#region packages/core/src/rules/data.ts
	const ruleStats = [
		"strength",
		"technique",
		"agility",
		"perception",
		"will",
		"constitution"
	];
	function v(values) {
		return Object.assign({
			strength: 0,
			technique: 0,
			agility: 0,
			perception: 0,
			will: 0,
			constitution: 0
		}, values || {});
	}
	const ruleStatLabels = {
		strength: "力量",
		technique: "技巧",
		agility: "敏捷",
		perception: "感知",
		will: "意志",
		constitution: "体质"
	};
	const races = {
		"塞宁王族": {
			"男": v({
				strength: 1.1,
				technique: 1.1,
				agility: .6,
				constitution: .9,
				perception: .4,
				will: .4
			}),
			"女": v({
				strength: 1,
				technique: 1.2,
				agility: .7,
				constitution: .8,
				perception: .5,
				will: .3
			})
		},
		"希尔王族": {
			"男": v({
				strength: .8,
				technique: 1,
				agility: .4,
				constitution: 1.2,
				perception: .4,
				will: .4
			}),
			"女": v({
				strength: .7,
				technique: 1.1,
				agility: .5,
				constitution: 1.1,
				perception: .5,
				will: .3
			})
		},
		"佩尔弗因王族": {
			"男": v({
				strength: 1,
				technique: 1.3,
				agility: .4,
				constitution: .6,
				perception: .8,
				will: .4
			}),
			"女": v({
				strength: .9,
				technique: 1.4,
				agility: .4,
				constitution: .5,
				perception: .8,
				will: .5
			})
		},
		"切瓦利王族": {
			"男": v({
				strength: 1.2,
				technique: .8,
				agility: .4,
				constitution: 1,
				perception: .4,
				will: .4
			}),
			"女": v({
				strength: 1.1,
				technique: .9,
				agility: .5,
				constitution: .9,
				perception: .5,
				will: .3
			})
		},
		"弗莱德里王族": {
			"男": v({
				strength: 1.1,
				technique: .6,
				agility: .4,
				constitution: 1.3,
				perception: .4,
				will: .4
			}),
			"女": v({
				strength: 1,
				technique: .7,
				agility: .5,
				constitution: 1.2,
				perception: .5,
				will: .3
			})
		},
		"法拉希尔血裔": {
			"男": v({
				strength: .6,
				technique: 1.2,
				agility: 1,
				constitution: .4,
				perception: .7,
				will: .4
			}),
			"女": v({
				strength: .5,
				technique: 1.3,
				agility: 1.1,
				constitution: .3,
				perception: .8,
				will: .3
			})
		},
		"高等精灵": {
			"男": v({
				strength: .4,
				technique: .6,
				agility: .8,
				constitution: .4,
				perception: 1.3,
				will: 1
			}),
			"女": v({
				strength: .3,
				technique: .7,
				agility: .9,
				constitution: .3,
				perception: 1.4,
				will: .9
			})
		},
		"古特雅尔": {
			"男": v({
				strength: 1.3,
				technique: .4,
				agility: 1,
				constitution: .8,
				perception: .4,
				will: .6
			}),
			"女": v({
				strength: 1.2,
				technique: .5,
				agility: 1.1,
				constitution: .7,
				perception: .5,
				will: .5
			})
		},
		"玛夏审判军": {
			"男": v({
				strength: .9,
				technique: .4,
				agility: .4,
				constitution: 1.1,
				perception: .4,
				will: 1.3
			}),
			"女": v({
				strength: .8,
				technique: .5,
				agility: .5,
				constitution: 1,
				perception: .5,
				will: 1.2
			})
		},
		"祖扎尔达王国": {
			"男": v({
				strength: .4,
				technique: .8,
				agility: 1.3,
				constitution: .4,
				perception: .4,
				will: .4
			}),
			"女": v({
				strength: .3,
				technique: .9,
				agility: 1.4,
				constitution: .3,
				perception: .5,
				will: .3
			})
		},
		"宏朝贵胄": {
			"男": v({
				strength: .8,
				technique: 1.1,
				agility: 1.2,
				constitution: .4,
				perception: .6,
				will: .4
			}),
			"女": v({
				strength: .7,
				technique: 1.2,
				agility: 1.3,
				constitution: .3,
				perception: .7,
				will: .3
			})
		},
		"平民血脉": {
			"男": v({
				strength: .3,
				technique: .3,
				agility: .3,
				constitution: .3,
				perception: .3,
				will: .3
			}),
			"女": v({
				strength: .2,
				technique: .4,
				agility: .4,
				constitution: .2,
				perception: .4,
				will: .2
			})
		}
	};
	const commonerRace = "平民血脉";
	const bloodlineTraitRaceMap = {
		"塞宁王族": "塞宁",
		"希尔王族": "希尔",
		"佩尔弗因王族": "佩尔",
		"切瓦利王族": "切瓦",
		"弗莱德里王族": "弗莱",
		"法拉希尔血裔": "法拉",
		"高等精灵": "精灵",
		"古特雅尔": "古特",
		"玛夏审判军": "玛夏",
		"祖扎尔达王国": "祖扎",
		"宏朝贵胄": "宏朝",
		"平民血脉": "平民"
	};
	const classGrowth = {
		"皇家骑兵": v({
			strength: .78,
			technique: .97,
			agility: .25,
			constitution: .58
		}),
		"掠袭骑兵": v({
			strength: .71,
			technique: .39,
			agility: .97,
			constitution: .51
		}),
		"重装骑兵": v({
			strength: 1.1,
			technique: .39,
			agility: .19,
			constitution: .9
		}),
		"统御骑士": v({
			strength: .58,
			technique: .78,
			agility: .13,
			constitution: .64,
			will: .45
		}),
		"恐惧骑士": v({
			strength: 1.03,
			technique: .26,
			agility: .51,
			constitution: .78
		}),
		"天启骑士": v({
			strength: 0,
			technique: 0,
			agility: 0,
			constitution: .84,
			perception: .45,
			will: 1.29
		}),
		"翼骑兵": v({
			strength: 1.1,
			technique: .19,
			agility: .26,
			constitution: 1.03
		}),
		"曙光骑兵": v({
			strength: .97,
			technique: .9,
			agility: .26,
			constitution: .45
		}),
		"长弓手": v({
			strength: .84,
			technique: 1.1,
			agility: .39,
			constitution: .26
		}),
		"游侠": v({
			strength: .45,
			technique: 1.03,
			agility: .84,
			constitution: .26
		}),
		"盾弩手": v({
			strength: .58,
			technique: .97,
			agility: .26,
			constitution: .78
		}),
		"重弩手": v({
			strength: .71,
			technique: .78,
			agility: .19,
			constitution: .9
		}),
		"丛林猎手": v({
			strength: .52,
			technique: .9,
			agility: 1.1,
			constitution: .19
		}),
		"魔弓手": v({
			agility: .26,
			constitution: .19,
			perception: 1.23,
			will: .9
		}),
		"狂战士": v({
			strength: 1.03,
			technique: .26,
			agility: .71,
			constitution: .58
		}),
		"大剑士": v({
			strength: .97,
			technique: .78,
			agility: .32,
			constitution: .51
		}),
		"刺客": v({
			strength: .26,
			technique: .97,
			agility: 1.1,
			constitution: .26
		}),
		"剑圣": v({
			strength: .78,
			technique: .58,
			agility: 1.03,
			constitution: .19
		}),
		"决斗士": v({
			strength: .58,
			technique: 1.03,
			agility: .64,
			constitution: .32
		}),
		"暗影刀客": v({
			strength: .58,
			agility: .64,
			constitution: .23,
			perception: 1.13
		}),
		"王室禁卫": v({
			strength: .58,
			technique: .84,
			agility: .19,
			constitution: .97
		}),
		"铁甲军士": v({
			strength: .84,
			technique: .45,
			agility: .19,
			constitution: 1.1
		}),
		"重甲僧侣": v({
			strength: .32,
			technique: .19,
			agility: .19,
			constitution: .84,
			perception: .39,
			will: .64
		}),
		"圣堂铁卫": v({
			strength: .78,
			technique: .32,
			agility: .19,
			constitution: .84,
			will: .45
		}),
		"神鹰侍卫": v({
			strength: .45,
			technique: .97,
			agility: .48,
			constitution: .68
		}),
		"勇士精英": v({
			strength: .71,
			technique: .9,
			agility: .07,
			constitution: .9
		}),
		"大德鲁伊": v({
			agility: .32,
			constitution: .19,
			perception: 1.29,
			will: .78
		}),
		"主教": v({
			agility: .13,
			constitution: .26,
			perception: .9,
			will: 1.29
		}),
		"炼金术师": v({
			technique: .58,
			agility: .19,
			constitution: .39,
			perception: .51,
			will: .9
		}),
		"吟游诗人": v({
			agility: .58,
			constitution: .26,
			perception: 1.29,
			will: .45
		}),
		"帝国密使": v({
			constitution: .32,
			perception: 1.13,
			will: 1.13
		}),
		"内宗剑圣": v({
			technique: .9,
			agility: 1.03,
			constitution: .13,
			perception: .51
		}),
		"誓约骑士": v({
			agility: .19,
			constitution: .13,
			perception: 1.23,
			will: 1.03
		})
	};
	const classValues = {
		"皇家骑兵": v({
			strength: 8,
			technique: 10,
			agility: 2,
			constitution: 5
		}),
		"掠袭骑兵": v({
			strength: 7,
			technique: 3,
			agility: 10,
			constitution: 5
		}),
		"重装骑兵": v({
			strength: 11,
			technique: 3,
			agility: 1,
			constitution: 9
		}),
		"统御骑士": v({
			strength: 5,
			technique: 8,
			constitution: 6,
			will: 5
		}),
		"恐惧骑士": v({
			strength: 11,
			technique: 2,
			agility: 5,
			constitution: 8
		}),
		"天启骑士": v({
			constitution: 8,
			perception: 5,
			will: 15
		}),
		"翼骑兵": v({
			strength: 11,
			technique: 1,
			agility: 2,
			constitution: 11
		}),
		"曙光骑兵": v({
			strength: 9,
			technique: 9,
			agility: 1,
			constitution: 4
		}),
		"长弓手": v({
			strength: 8,
			technique: 11,
			agility: 3,
			constitution: 2
		}),
		"游侠": v({
			strength: 4,
			technique: 11,
			agility: 8,
			constitution: 2
		}),
		"盾弩手": v({
			strength: 5,
			technique: 10,
			agility: 2,
			constitution: 8
		}),
		"重弩手": v({
			strength: 7,
			technique: 8,
			agility: 1,
			constitution: 9
		}),
		"丛林猎手": v({
			strength: 5,
			technique: 9,
			agility: 10,
			constitution: 1
		}),
		"魔弓手": v({
			agility: 2,
			constitution: 1,
			perception: 14,
			will: 10
		}),
		"狂战士": v({
			strength: 12,
			technique: 1,
			agility: 7,
			constitution: 4
		}),
		"大剑士": v({
			strength: 12,
			technique: 7,
			agility: 2,
			constitution: 4
		}),
		"刺客": v({
			strength: 1,
			technique: 10,
			agility: 12,
			constitution: 1
		}),
		"剑圣": v({
			strength: 8,
			technique: 4,
			agility: 12
		}),
		"决斗士": v({
			strength: 4,
			technique: 12,
			agility: 7,
			constitution: 2
		}),
		"暗影刀客": v({
			strength: 7,
			technique: -1,
			agility: 5,
			constitution: 1,
			perception: 12
		}),
		"王室禁卫": v({
			strength: 5,
			technique: 7,
			agility: 1,
			constitution: 12
		}),
		"铁甲军士": v({
			strength: 7,
			technique: 3,
			agility: 1,
			constitution: 13
		}),
		"重甲僧侣": v({
			strength: 2,
			technique: 1,
			agility: 1,
			constitution: 10,
			perception: 4,
			will: 6
		}),
		"圣堂铁卫": v({
			strength: 7,
			technique: 2,
			agility: 1,
			constitution: 10,
			will: 4
		}),
		"神鹰侍卫": v({
			strength: 3,
			technique: 10,
			agility: 5,
			constitution: 7
		}),
		"勇士精英": v({
			strength: 7,
			technique: 9,
			agility: -1,
			constitution: 9
		}),
		"大德鲁伊": v({
			perception: 15,
			will: 9
		}),
		"主教": v({
			strength: 0,
			technique: 0,
			agility: 0,
			constitution: 1,
			perception: 10,
			will: 15
		}),
		"炼金术师": v({
			technique: 6,
			constitution: 2,
			perception: 5,
			will: 11
		}),
		"吟游诗人": v({
			agility: 5,
			constitution: 2,
			perception: 15,
			will: 5
		}),
		"帝国密使": v({
			constitution: 2,
			perception: 12,
			will: 13
		}),
		"内宗剑圣": v({
			strength: -1,
			technique: 9,
			agility: 11,
			perception: 6
		}),
		"誓约骑士": v({
			agility: 0,
			constitution: 0,
			perception: 14,
			will: 12
		})
	};
	const classEquipment = {
		"皇家骑兵": {
			weapons: [
				"单手剑",
				"战旗",
				"枪"
			],
			armor: "链甲"
		},
		"掠袭骑兵": {
			weapons: [
				"刀",
				"枪",
				"短弓"
			],
			armor: "皮甲"
		},
		"重装骑兵": {
			weapons: ["骑枪", "枪"],
			armor: "板甲"
		},
		"统御骑士": {
			weapons: [
				"单手剑",
				"刺剑",
				"弩"
			],
			armor: "板甲"
		},
		"恐惧骑士": {
			weapons: [
				"长柄",
				"单手剑",
				"单手斧",
				"双手剑",
				"双手斧"
			],
			armor: "链甲"
		},
		"天启骑士": {
			weapons: ["权杖", "战旗"],
			armor: "板甲"
		},
		"翼骑兵": {
			weapons: [
				"刀",
				"单手剑",
				"单手锤",
				"枪"
			],
			armor: "板甲"
		},
		"曙光骑兵": {
			weapons: ["单手剑", "枪"],
			armor: "链甲"
		},
		"长弓手": {
			weapons: ["长弓"],
			armor: "布甲"
		},
		"游侠": {
			weapons: ["短弓"],
			armor: "皮甲"
		},
		"盾弩手": {
			weapons: ["弩"],
			armor: "链甲"
		},
		"重弩手": {
			weapons: ["重弩"],
			armor: "链甲"
		},
		"丛林猎手": {
			weapons: ["短弓"],
			armor: "布甲"
		},
		"魔弓手": {
			weapons: ["短弓"],
			armor: "布甲"
		},
		"狂战士": {
			weapons: ["单手斧", "双手斧"],
			armor: "皮甲"
		},
		"大剑士": {
			weapons: ["双手剑"],
			armor: "皮甲"
		},
		"刺客": {
			weapons: ["匕首"],
			armor: "布甲"
		},
		"剑圣": {
			weapons: [
				"单手剑",
				"双手剑",
				"刀"
			],
			armor: "布甲"
		},
		"决斗士": {
			weapons: ["刺剑", "匕首"],
			armor: "皮甲"
		},
		"暗影刀客": {
			weapons: ["刀", "匕首"],
			armor: "布甲"
		},
		"王室禁卫": {
			weapons: ["枪", "单手剑"],
			armor: "链甲"
		},
		"铁甲军士": {
			weapons: [
				"枪",
				"长柄",
				"单手锤",
				"链锤"
			],
			armor: "板甲"
		},
		"重甲僧侣": {
			weapons: [
				"单手锤",
				"链锤",
				"权杖"
			],
			armor: "板甲"
		},
		"圣堂铁卫": {
			weapons: [
				"单手剑",
				"单手锤",
				"链锤"
			],
			armor: "板甲"
		},
		"神鹰侍卫": {
			weapons: ["枪", "单手剑"],
			armor: "链甲"
		},
		"勇士精英": {
			weapons: [
				"枪",
				"单手剑",
				"单手斧",
				"单手锤"
			],
			armor: "链甲"
		},
		"大德鲁伊": {
			weapons: ["双手杖"],
			armor: "布甲"
		},
		"主教": {
			weapons: ["权杖"],
			armor: "布甲"
		},
		"炼金术师": {
			weapons: ["瓶子"],
			armor: "布甲"
		},
		"吟游诗人": {
			weapons: ["琴"],
			armor: "布甲"
		},
		"帝国密使": {
			weapons: ["权杖"],
			armor: "布甲"
		},
		"内宗剑圣": {
			weapons: ["单手剑", "刀"],
			armor: "布甲"
		},
		"誓约骑士": {
			weapons: ["权杖"],
			armor: "布甲"
		}
	};
	function trait(id, name, type, race, part, flatStats, multiplierStats, potentialBonus, divineCombatValue) {
		return {
			id,
			name,
			type,
			race: race || "",
			part: part || "",
			flatStats: v(flatStats),
			multiplierStats: v(multiplierStats),
			potentialBonus: v(potentialBonus),
			divineCombatValue: v(divineCombatValue)
		};
	}
	const traits = [
		trait("divine-per", "佩尔之技", "divine_skill", "佩尔", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			technique: 1.8,
			strength: 1.2,
			perception: .6
		}),
		trait("divine-per-curse", "诅咒之技", "divine_skill", "佩尔", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			technique: 1.8,
			strength: 1.2,
			perception: .6
		}),
		trait("divine-frey", "弗莱之技", "divine_skill", "弗莱", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			constitution: 1.8,
			strength: 1.4,
			technique: .5
		}),
		trait("divine-fala", "法拉之技", "divine_skill", "法拉", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			technique: 1.7,
			agility: 1.5,
			strength: .5
		}),
		trait("divine-chewa", "切瓦之技", "divine_skill", "切瓦", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			strength: 1.7,
			constitution: 1.4,
			technique: .6
		}),
		trait("divine-sea", "海族之技", "divine_skill", "切瓦", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {}),
		trait("divine-gut", "古特之技", "divine_skill", "古特", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			strength: 1.8,
			agility: 1.4,
			constitution: .4
		}),
		trait("divine-hill", "希尔之技", "divine_skill", "希尔", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			constitution: 1.7,
			technique: 1.4,
			strength: .6
		}),
		trait("divine-senin", "塞宁之技", "divine_skill", "塞宁", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			strength: 1.6,
			technique: 1.5,
			constitution: .6
		}),
		trait("divine-day", "永昼之技", "divine_skill", "塞宁", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			strength: 1.6,
			technique: 1.5,
			constitution: .6
		}),
		trait("divine-elf", "奈莎之技", "divine_skill", "精灵", "神子之技", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			perception: 1.8,
			will: 1,
			agility: .8
		}),
		trait("fala-wind", "席卷之风", "divine_trait", "法拉", "眉毛", {}, {
			technique: .1,
			agility: .05
		}, { agility: .2 }, {}),
		trait("fala-skill", "巧技", "divine_trait", "法拉", "眼睛", {
			technique: 24,
			agility: 16
		}, {}, {
			technique: .2,
			agility: .1
		}, {}),
		trait("fala-forest-heir", "森林后裔", "divine_trait", "法拉", "发色", {
			strength: 10,
			technique: 20,
			agility: 15
		}, {}, {
			technique: .2,
			agility: .1
		}, {}),
		trait("fala-bird", "林中鸟", "divine_trait", "法拉", "脸型", {}, { technique: .1 }, {
			technique: .2,
			agility: .1
		}, {}),
		trait("fala-dancer", "舞蹈者", "divine_trait", "法拉", "眉毛", {}, {
			technique: .05,
			agility: .1
		}, { agility: .2 }, {}),
		trait("fala-nature-child", "自然之子", "divine_trait", "法拉", "嘴巴", {
			strength: 10,
			technique: 30
		}, {}, {
			technique: .2,
			agility: .1
		}, {}),
		trait("frey-blood", "瓦斯提亚血裔", "divine_trait", "弗莱", "鼻子", {}, {
			constitution: .1,
			will: .05
		}, {
			constitution: .1,
			will: .1
		}, {}),
		trait("frey-mountain", "山川之子", "divine_trait", "弗莱", "脸型++", {
			strength: 24,
			constitution: 16
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("frey-stigma", "真·弗莱德里王族圣痕", "divine_trait", "弗莱", "圣痕+", {
			strength: 15,
			constitution: 20,
			will: 10
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("frey-majesty", "威严", "divine_trait", "弗莱", "嘴巴", {
			strength: 16,
			will: 24
		}, {}, {
			strength: .2,
			will: .1
		}, {}),
		trait("frey-confidence", "索弗利夫的自信", "divine_trait", "弗莱", "嘴巴+", {}, {
			strength: .1,
			constitution: .05
		}, { strength: .2 }, {}),
		trait("frey-sun-eye", "太阳之眼", "divine_trait", "弗莱", "眼睛++", {
			strength: 16,
			constitution: 24
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("frey-plateau", "台地之王（超人体格）希尔", "divine_trait", "弗莱", "肤色", {}, { constitution: .1 }, {
			strength: .1,
			technique: .2
		}, {}),
		trait("frey-strength", "非凡力量（高地人的自傲）希尔", "divine_trait", "弗莱", "脸型++", {
			strength: 24,
			constitution: 16
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("frey-smell", "危险嗅觉（审判之眼）玛夏", "divine_trait", "弗莱", "鼻子", {}, {
			constitution: .05,
			will: .1
		}, {
			constitution: .1,
			will: .1
		}, {}),
		trait("chewa-wave-child", "波涛之子", "divine_trait", "切瓦", "脸型", {}, { strength: .1 }, {
			strength: .2,
			technique: .1
		}, {}),
		trait("chewa-stigma", "真·切瓦利王族圣痕", "divine_trait", "切瓦", "圣痕+", {
			strength: 20,
			technique: 15,
			constitution: 10
		}, {}, {
			strength: .2,
			constitution: .1
		}, {}),
		trait("chewa-noble", "贵族气度", "divine_trait", "切瓦", "鼻子++", {
			strength: 16,
			constitution: 24
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("chewa-sense", "幻语感应", "divine_trait", "切瓦", "耳朵", {
			technique: 24,
			constitution: 16
		}, {}, {
			technique: .2,
			constitution: .1
		}, {}),
		trait("chewa-sea-family", "海之一族", "divine_trait", "切瓦", "圣痕+", {
			strength: 20,
			technique: 15,
			constitution: 10
		}, {}, {
			strength: .2,
			constitution: .1
		}, {}),
		trait("chewa-water-spirit", "水之灵", "divine_trait", "切瓦", "耳朵", {}, {
			strength: .05,
			technique: .1
		}, { technique: .2 }, {}),
		trait("chewa-tide", "浪潮之涡（同类相食）古特", "divine_trait", "切瓦", "眉毛++", {
			strength: 16,
			constitution: 24
		}, {}, { constitution: .2 }, {}),
		trait("chewa-blue-shadow", "魅蓝之影（邪神之血）古特", "divine_trait", "切瓦", "发色+", {}, {
			strength: .05,
			constitution: .1
		}, {
			strength: .1,
			constitution: .1
		}, {}),
		trait("hill-snow", "雪山之子", "divine_trait", "希尔", "脸型", {}, {
			technique: .05,
			constitution: .1
		}, {
			technique: .1,
			constitution: .1
		}, {}),
		trait("hill-stigma", "真·希尔王族圣痕", "divine_trait", "希尔", "圣痕", {
			strength: 10,
			technique: 15,
			constitution: 20
		}, {}, {
			technique: .1,
			constitution: .2
		}, {}),
		trait("hill-will", "坚固意志", "divine_trait", "希尔", "嘴巴", {
			technique: 24,
			constitution: 16
		}, {}, {
			technique: .2,
			constitution: .1
		}, {}),
		trait("hill-guardian", "守护者", "divine_trait", "希尔", "鼻子", {
			strength: 16,
			constitution: 24
		}, {}, {
			strength: .1,
			constitution: .2
		}, {}),
		trait("hill-tenacity", "瓦提肯的坚毅", "divine_trait", "希尔", "发色", {}, { constitution: .1 }, {
			technique: .1,
			constitution: .2
		}, {}),
		trait("hill-clear-eye", "澄净之眼", "divine_trait", "希尔", "眼睛", {}, { technique: .1 }, {
			technique: .2,
			constitution: .1
		}, {}),
		trait("hill-creation", "创造之赐（瓦斯提亚后裔）牛头", "divine_trait", "希尔", "发色", {}, {
			technique: .05,
			constitution: .1
		}, { constitution: .2 }, {}),
		trait("senin-stigma", "真·塞宁王族圣痕", "divine_trait", "塞宁", "圣痕", {
			strength: 20,
			technique: 20,
			constitution: 5
		}, {}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("senin-gold-fire", "烈火镕金", "divine_trait", "塞宁", "发色", {}, {
			strength: .05,
			technique: .1
		}, {
			strength: .1,
			technique: .1
		}, {}),
		trait("senin-undying", "不灭之志", "divine_trait", "塞宁", "眼睛", {}, { technique: .1 }, {
			strength: .1,
			technique: .2
		}, {}),
		trait("senin-leader", "引领者", "divine_trait", "塞宁", "眉毛", {
			technique: 16,
			constitution: 24
		}, {}, {
			technique: .1,
			constitution: .2
		}, {}),
		trait("senin-fearless", "无畏", "divine_trait", "塞宁", "耳朵", {}, {
			strength: .05,
			technique: .05,
			constitution: .05
		}, {
			technique: .1,
			constitution: .1
		}, {}),
		trait("senin-pale-blood", "苍白之血", "divine_trait", "塞宁", "圣痕", {
			strength: 22,
			technique: 22
		}, {}, {
			strength: .2,
			technique: .1
		}, {}),
		trait("senin-afterglow", "寂灭余晖", "divine_trait", "塞宁", "发色", {}, {
			strength: .1,
			technique: .05
		}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("senin-faded-eye", "褪色之眼", "divine_trait", "塞宁", "眼睛", {}, { strength: .1 }, {
			strength: .2,
			technique: .1
		}, {}),
		trait("senin-white-night", "白夜帷幕", "divine_trait", "塞宁", "眉毛", {
			strength: 24,
			constitution: 16
		}, {}, {
			strength: .2,
			constitution: .1
		}, {}),
		trait("elf-forest-guide", "森之指引", "divine_trait", "精灵", "眉毛", {
			agility: 10,
			perception: 20,
			will: 15
		}, {}, {
			perception: .2,
			will: .1
		}, {}),
		trait("elf-soul-singer", "灵魂颂者", "divine_trait", "精灵", "耳朵", {}, { perception: .15 }, {
			perception: .1,
			will: .1
		}, {}),
		trait("elf-heart-eye", "心之锐目", "divine_trait", "精灵", "眼睛", {
			perception: 24,
			will: 16
		}, {}, {
			perception: .2,
			will: .1
		}, {}),
		trait("elf-grace", "恩泽圣颜", "divine_trait", "精灵", "脸型", {}, {
			perception: .1,
			will: .05
		}, {
			perception: .1,
			will: .1
		}, {}),
		trait("elf-breath", "生灵吐息", "divine_trait", "精灵", "鼻子", {
			agility: 10,
			perception: 15,
			will: 20
		}, {}, {
			perception: .2,
			will: .1
		}, {}),
		trait("elf-true-word", "真言之口", "divine_trait", "精灵", "嘴巴", {}, {
			perception: .05,
			will: .1
		}, {
			perception: .1,
			will: .1
		}, {}),
		trait("per-will", "科内塔的意志", "divine_trait", "佩尔", "眉毛", {}, { technique: .1 }, {
			technique: .2,
			agility: .1
		}, {}),
		trait("per-wild", "野性", "divine_trait", "佩尔", "嘴巴", {
			strength: 16,
			technique: 24
		}, {}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("per-stigma", "真·佩尔弗因圣痕", "divine_trait", "佩尔", "圣痕", {
			strength: 15,
			technique: 20,
			constitution: 10
		}, {}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("per-insight", "科内塔的洞察", "divine_trait", "佩尔", "眼睛", {}, {
			strength: .1,
			technique: .05
		}, { strength: .2 }, {}),
		trait("per-night-kiss", "夜之吻", "divine_trait", "佩尔", "嘴巴", {
			strength: 24,
			technique: 16
		}, {}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("per-eclipse", "日蚀之印", "divine_trait", "佩尔", "圣痕", {
			strength: 15,
			technique: 20,
			constitution: 10
		}, {}, {
			strength: .1,
			technique: .2
		}, {}),
		trait("per-heterochromia", "异色瞳（同类相食）古特", "divine_trait", "佩尔", "眼睛", {}, {
			strength: .1,
			technique: .05
		}, { strength: .2 }, {}),
		trait("per-temptation", "夜之诱惑（海神诅咒）古特", "divine_trait", "佩尔", "耳朵", {}, { constitution: .1 }, {
			technique: .2,
			constitution: .1
		}, {}),
		trait("gut-fang", "獠牙", "divine_trait", "古特", "嘴巴", {}, {
			strength: .1,
			agility: .05
		}, {
			strength: .1,
			agility: .1
		}, {}),
		trait("gut-conqueror", "北境征服者", "divine_trait", "古特", "脸型", {
			strength: 20,
			agility: 15,
			constitution: 10
		}, {}, {
			strength: .2,
			agility: .1
		}, {}),
		trait("gut-lizard", "蜥蜴皮肤", "divine_trait", "古特", "肤色", {}, {
			strength: .05,
			constitution: .1
		}, {
			strength: .1,
			constitution: .1
		}, {}),
		trait("gut-shark", "鲨之眼", "divine_trait", "古特", "眼睛", {}, { strength: .1 }, {
			strength: .2,
			agility: .1
		}, {}),
		trait("gut-king", "古特之王", "divine_trait", "古特", "鼻子", {
			strength: 24,
			agility: 16
		}, {}, {
			strength: .2,
			agility: .1
		}, {}),
		trait("gut-north", "北地之子", "divine_trait", "古特", "眉毛", {}, {
			agility: .1,
			constitution: .05
		}, {
			agility: .1,
			constitution: .1
		}, {}),
		trait("gut-demon-eye", "恶魔之眼（雄狮之力）", "divine_trait", "古特", "眼睛", {}, { strength: .1 }, {
			strength: .2,
			agility: .1
		}, {}),
		trait("gut-flame", "复仇烈焰（欧里克的神力）", "divine_trait", "古特", "鼻子", {
			strength: 24,
			agility: 16
		}, {}, {
			strength: .2,
			agility: .1
		}, {}),
		trait("m-fala-forest-child", "森林之子", "mortal_trait", "法拉", "发色", {
			technique: 9,
			agility: 5
		}, {}, {}, {}),
		trait("m-fala-nature-spirit", "自然之灵", "mortal_trait", "法拉", "眉毛", {}, { technique: .1 }, {}, {}),
		trait("m-fala-all-seeing", "洞察万物", "mortal_trait", "法拉", "眼睛", {}, {}, {}, {}),
		trait("m-zuzar-panther", "豹神", "mortal_trait", "祖扎", "眼睛", { agility: 12 }, {}, {}, {}),
		trait("m-zuzar-mark", "猎豹印记", "mortal_trait", "祖扎", "圣痕", {}, { agility: .1 }, {}, {}),
		trait("m-zuzar-night-skin", "夜色肌肤", "mortal_trait", "祖扎", "肤色", {}, {}, {}, {}),
		trait("m-hong-reborn", "天神转世", "mortal_trait", "宏朝", "圣痕", {
			strength: 6,
			technique: 6,
			agility: 6
		}, {}, {}, {}),
		trait("m-hong-luck", "吉人天相", "mortal_trait", "宏朝", "眉毛", {}, {
			agility: .1,
			perception: .05
		}, {}, {}),
		trait("m-hong-face", "福相", "mortal_trait", "宏朝", "脸型", {}, {}, {}, {}),
		trait("m-per-stigma", "佩尔弗因王族圣痕", "mortal_trait", "佩尔", "圣痕", {
			strength: 5,
			technique: 9
		}, {}, {}, {}),
		trait("m-per-fury", "科内塔之怒", "mortal_trait", "佩尔", "眉毛", {}, { technique: .05 }, {}, {}),
		trait("m-per-fang", "虎牙", "mortal_trait", "佩尔", "嘴唇", {}, {}, {}, {}),
		trait("m-frey-stigma", "弗莱德里王族圣痕", "mortal_trait", "弗莱", "圣痕", { constitution: 12 }, {}, {}, {}),
		trait("m-frey-blood", "瓦斯提亚后裔", "mortal_trait", "弗莱", "鼻子", {}, {
			constitution: .1,
			will: .05
		}, {}, {}),
		trait("m-frey-tenacity", "索弗利夫的坚毅", "mortal_trait", "弗莱", "脸型", {}, {}, {}, {}),
		trait("m-chewa-stigma", "切瓦利王族圣痕", "mortal_trait", "切瓦", "圣痕", {
			strength: 9,
			constitution: 5
		}, {}, {}, {}),
		trait("m-chewa-power", "欧里克的神力", "mortal_trait", "切瓦", "脸型", {}, { strength: .1 }, {}, {}),
		trait("m-chewa-lion-power", "雄狮之力", "mortal_trait", "切瓦", "脸型", { strength: 5 }, {}, {}, {}),
		trait("m-chewa-blessing", "欧里克的赐福", "mortal_trait", "切瓦", "鼻子", {}, {}, {}, {}),
		trait("m-hill-stigma", "希尔王族圣痕", "mortal_trait", "希尔", "圣痕", {
			technique: 5,
			constitution: 9
		}, {}, {}, {}),
		trait("m-hill-body", "超人体格", "mortal_trait", "希尔", "脸型", {}, { constitution: .1 }, {}, {}),
		trait("m-hill-pride", "高地人的自傲", "mortal_trait", "希尔", "嘴唇", {}, {}, {}, {}),
		trait("m-senin-stigma", "塞宁王族圣痕", "mortal_trait", "塞宁", "圣痕", {
			strength: 7,
			technique: 7,
			constitution: 3
		}, {}, {}, {}),
		trait("m-senin-sun", "太阳之子", "mortal_trait", "塞宁", "发色", {}, {
			strength: .05,
			technique: .1
		}, {}, {}),
		trait("m-senin-gold-eye", "金眼", "mortal_trait", "塞宁", "眼睛", {}, {}, {}, {}),
		trait("m-elf-resonance", "自然共鸣", "mortal_trait", "精灵", "眉毛", { perception: 12 }, {}, {}, {}),
		trait("m-elf-spirit", "上古灵性", "mortal_trait", "精灵", "耳朵", {}, { perception: .15 }, {}, {}),
		trait("m-elf-focus", "专注之眸", "mortal_trait", "精灵", "眼睛", {
			perception: 7,
			will: 7
		}, {}, {}, {}),
		trait("m-masha-will", "燃烧意志", "mortal_trait", "玛夏", "脸型", {
			constitution: 7,
			will: 9
		}, {}, {}, {}),
		trait("m-masha-eye", "审判之眼", "mortal_trait", "玛夏", "眼睛", {}, {
			constitution: .05,
			will: .1
		}, {}, {}),
		trait("m-masha-hair", "炎发", "mortal_trait", "玛夏", "发色", {}, {}, {}, {}),
		trait("m-gut-bad-face", "烂脸", "mortal_trait", "古特", "脸型", {
			strength: 9,
			agility: 5
		}, {}, {}, {}),
		trait("m-gut-cannibal", "同类相食", "mortal_trait", "古特", "嘴唇", {}, {
			strength: .1,
			agility: .05
		}, {}, {}),
		trait("m-gut-evil-blood", "邪神之血", "mortal_trait", "古特", "眼睛", {}, {}, {}, {}),
		trait("m-gut-sea-curse", "海神诅咒", "mortal_trait", "古特", "", {}, {}, {}, {}),
		trait("saint-justice", "正义誓言", "divine_skill", "圣子", "", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			technique: 1.7,
			strength: 1.3,
			constitution: .6
		}),
		trait("saint-free", "无拘之魂", "divine_skill", "圣子", "", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			strength: 1.7,
			technique: 1.3,
			agility: .6
		}),
		trait("saint-hope", "希望契约", "divine_skill", "圣子", "", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			perception: 1.7,
			will: 1.3,
			agility: .6
		}),
		trait("saint-guard", "同心护佑", "divine_skill", "圣子", "", {}, {}, {
			strength: .1,
			constitution: .1,
			will: .1
		}, {
			will: 1.7,
			perception: 1.3,
			constitution: .6
		}),
		trait("saint-mark-justice", "公正圣印", "saint_trait", "圣子", "", {}, {
			strength: .1,
			technique: .05
		}, {
			strength: .1,
			technique: .1
		}, {}),
		trait("saint-mark-free", "自由圣印", "saint_trait", "圣子", "", {}, {
			strength: .05,
			technique: .1
		}, {
			strength: .1,
			technique: .1
		}, {}),
		trait("saint-mark-peace", "和平圣印", "saint_trait", "圣子", "", {}, {
			perception: .1,
			will: .05
		}, {
			perception: .1,
			will: .1
		}, {}),
		trait("saint-mark-guard", "守护圣印", "saint_trait", "圣子", "", {}, {
			perception: .05,
			will: .1
		}, {
			perception: .1,
			will: .1
		}, {}),
		trait("saint-defender", "捍卫者", "saint_trait", "圣子", "", { technique: 10 }, {
			strength: .05,
			constitution: .05
		}, {
			strength: .1,
			technique: .1,
			constitution: .1
		}, {}),
		trait("saint-pioneer", "先行者", "saint_trait", "圣子", "", { strength: 10 }, {
			technique: .05,
			agility: .05
		}, {
			strength: .1,
			technique: .1,
			agility: .1
		}, {}),
		trait("saint-inheritor", "传承者", "saint_trait", "圣子", "", { will: 10 }, {
			agility: .05,
			perception: .05
		}, {
			agility: .1,
			perception: .1,
			will: .1
		}, {}),
		trait("saint-watcher", "守望者", "saint_trait", "圣子", "", { perception: 10 }, {
			constitution: .05,
			will: .05
		}, {
			constitution: .1,
			perception: .1,
			will: .1
		}, {})
	];
	const traitMetaByName = {
		"法拉之技": {
			effectText: "进入战斗时，力量、技巧、敏捷会暂时提升",
			lifespanText: "最高230"
		},
		"席卷之风": {
			effectText: "技巧+10%。敏捷+5%。命中+10%。偏斜+40%",
			lifespanText: "80"
		},
		"巧技": {
			effectText: "技巧+24。敏捷+16。偏斜+20%。爆击+20%。+15%经验获取",
			lifespanText: "80"
		},
		"森林后裔": {
			effectText: "力量+10。技巧+20。敏捷+15。攻击力+9。+30%经验获取",
			lifespanText: "90"
		},
		"林中鸟": {
			effectText: "技巧+10%。命中+40%。爆击+10%。对异性表白成功率有所提升",
			lifespanText: "80"
		},
		"舞蹈者": {
			effectText: "技巧+5%。敏捷+10%。爆击+25%",
			lifespanText: "80"
		},
		"自然之子": {
			effectText: "力量+10。技巧+30。爆击+20%。攻击力+9",
			lifespanText: "80"
		},
		"森林之子": {
			effectText: "技巧+9、敏捷+5",
			lifespanText: "+15"
		},
		"自然之灵": {
			effectText: "技巧+10%、偏斜+21%",
			lifespanText: "+30"
		},
		"洞察万物": {
			effectText: "远程命中+35%",
			lifespanText: "+20"
		},
		"猎豹印记": {
			effectText: "敏捷+10%、近程偏斜+26%",
			lifespanText: "+15"
		},
		"海神诅咒": {
			effectText: "偏斜-10%，攻击+8",
			lifespanText: "未录入"
		}
	};
	traits.forEach((item) => {
		Object.assign(item, traitMetaByName[item.name] || {});
	});
	const ruleData = {
		stats: [...ruleStats],
		statLabels: ruleStatLabels,
		races,
		commonerRace,
		bloodlineTraitRaceMap,
		classGrowth,
		classValues,
		classEquipment,
		traits
	};
	//#endregion
	//#region packages/core/src/rules/class-categories.ts
	const classCategories = [
		{
			id: "cavalry",
			label: "骑兵",
			color: "red",
			classes: [
				"皇家骑兵",
				"掠袭骑兵",
				"重装骑兵",
				"统御骑士",
				"恐惧骑士",
				"天启骑士",
				"翼骑兵",
				"曙光骑兵"
			]
		},
		{
			id: "archer",
			label: "射手",
			color: "green",
			classes: [
				"长弓手",
				"游侠",
				"盾弩手",
				"重弩手",
				"丛林猎手",
				"魔弓手"
			]
		},
		{
			id: "light_infantry",
			label: "轻步兵",
			color: "blue",
			classes: [
				"狂战士",
				"大剑士",
				"刺客",
				"剑圣",
				"决斗士",
				"暗影刀客"
			]
		},
		{
			id: "heavy_infantry",
			label: "重步兵",
			color: "yellow",
			classes: [
				"王室禁卫",
				"铁甲军士",
				"重甲僧侣",
				"圣堂铁卫",
				"神鹰侍卫",
				"勇士精英"
			]
		},
		{
			id: "special",
			label: "特殊",
			color: "purple",
			classes: []
		}
	];
	function getClassCategories() {
		return classCategories;
	}
	function getClassCategory(className) {
		return classCategories.find((category) => category.classes.includes(className)) || classCategories[classCategories.length - 1];
	}
	function groupClassesByCategory(classNames) {
		const itemSet = new Set(classNames);
		return classCategories.map((category) => ({
			...category,
			availableClasses: category.classes.length ? category.classes.filter((className) => itemSet.has(className)) : classNames.filter((className) => getClassCategory(className).id === category.id)
		})).filter((category) => category.availableClasses.length > 0);
	}
	//#endregion
	//#region packages/core/src/utils/vector.ts
	function zeroVector() {
		return Object.fromEntries(statKeys.map((stat) => [stat, 0]));
	}
	function hasAnyStat(vector) {
		return statKeys.some((stat) => Math.abs(Number(vector?.[stat]) || 0) > 1e-9);
	}
	function vectorHasStat(source, stat) {
		return Math.abs(Number(source?.[stat]) || 0) > 1e-9;
	}
	function addInto(target, source, scale = 1) {
		statKeys.forEach((stat) => {
			target[stat] += (Number(source?.[stat]) || 0) * scale;
		});
		return target;
	}
	function cloneVector(source) {
		return Object.assign(zeroVector(), source || {});
	}
	function vectorSum(items, key) {
		const result = zeroVector();
		items.forEach((item) => addInto(result, item[key]));
		return result;
	}
	//#endregion
	//#region packages/core/src/growth/potential.ts
	function getBloodlineRows(input) {
		if (Array.isArray(input.bloodlines) && input.bloodlines.length) return input.bloodlines.map((row) => ({
			race: row.race,
			percent: Number(row.percent) || 0
		})).filter((row) => row.race && row.percent > 0);
		if (input.race) return [{
			race: input.race,
			percent: 100
		}];
		return [];
	}
	function bloodlineTotal(input) {
		return getBloodlineRows(input).reduce((sum, row) => sum + row.percent, 0);
	}
	function bloodlineSummary(data, input) {
		const rows = getBloodlineRows(input);
		const total = rows.reduce((sum, row) => sum + row.percent, 0);
		if (total < 100) return [...rows, {
			race: data.commonerRace,
			percent: 100 - total,
			autoFilled: true
		}];
		return rows;
	}
	function calculateBasePotential(data, input) {
		const result = zeroVector();
		const sex = input.sex || "女";
		bloodlineSummary(data, input).forEach((row) => {
			const racePotential = data.races[row.race]?.[sex];
			if (!racePotential) return;
			addInto(result, racePotential, row.percent / 100);
		});
		return result;
	}
	//#endregion
	//#region packages/core/src/utils/number.ts
	function round(value, digits = 2) {
		const factor = 10 ** digits;
		return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
	}
	function formatNumber(value, digits = 4) {
		return String(round(value, digits));
	}
	function effectiveLevels(fromLevel, toLevel) {
		const from = Number(fromLevel);
		const to = Number(toLevel);
		if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return {
			total: 0,
			before60: 0,
			after60: 0
		};
		const before60 = Math.max(0, Math.min(to, 60) - from + 1);
		const after60 = Math.max(0, to - Math.max(from, 61) + 1);
		return {
			total: before60 + after60 * .35,
			before60,
			after60
		};
	}
	//#endregion
	//#region packages/core/src/validation/trait-availability.ts
	function parseHybridTraitName(name) {
		const match = String(name || "").match(/^(.+?)（(.+?)）([^（）]*)$/);
		if (!match) return null;
		return {
			displayName: match[1],
			prerequisiteName: match[2],
			suffixRace: match[3].trim()
		};
	}
	function displayTraitName(trait) {
		return trait.display?.displayName || parseHybridTraitName(trait.name)?.displayName || trait.name;
	}
	function traitPrerequisites(data, trait) {
		if (trait.prerequisites?.length) return trait.prerequisites;
		if (trait.type !== "divine_trait") return [];
		const parsed = parseHybridTraitName(trait.name);
		if (!parsed) return [];
		const mortal = data.traits.find((item) => item.type === "mortal_trait" && item.name === parsed.prerequisiteName);
		if (!mortal) return [{
			kind: "trait",
			traitId: `missing:${parsed.prerequisiteName}`
		}];
		const requirements = [{
			kind: "trait",
			traitId: mortal.id
		}];
		if (mortal.race || parsed.suffixRace) requirements.push({
			kind: "bloodlineRace",
			race: mortal.race || parsed.suffixRace
		});
		return requirements;
	}
	function hasBloodlineTraitRace(data, input, race) {
		if (!race) return false;
		return input.bloodlines.some((row) => traitRaceForBloodline(data, row.race) === race);
	}
	function getTraitAvailability(data, input, traitId) {
		const trait = data.traits.find((item) => item.id === traitId);
		if (!trait) return {
			available: false,
			displayName: traitId,
			prerequisites: [],
			reasons: [{
				code: "TRAIT_NOT_FOUND",
				message: `未找到特性：${traitId}`
			}]
		};
		const prerequisites = traitPrerequisites(data, trait);
		const reasons = prerequisites.flatMap((requirement) => {
			if (requirement.kind === "bloodlineRace") return hasBloodlineTraitRace(data, input, requirement.race) ? [] : [{
				code: "MISSING_BLOODLINE_RACE",
				message: `需要${requirement.race}血脉`
			}];
			if (requirement.traitId.startsWith("missing:")) return [{
				code: "PREREQUISITE_TRAIT_NOT_REGISTERED",
				message: `前置特性未录入：${requirement.traitId.slice(8)}`
			}];
			return input.traitIds.includes(requirement.traitId) ? [] : [{
				code: "MISSING_PREREQUISITE_TRAIT",
				message: `需要先选择凡人特性：${traitNameById(data, requirement.traitId)}`
			}];
		});
		return {
			available: reasons.length === 0,
			reasons,
			displayName: displayTraitName(trait),
			prerequisites
		};
	}
	function traitNameById(data, traitId) {
		return data.traits.find((trait) => trait.id === traitId)?.name || traitId;
	}
	//#endregion
	//#region packages/core/src/traits/effective-traits.ts
	function normalizedTraitPart(part) {
		return String(part || "").trim().replace(/\++$/g, "");
	}
	function divineTraitOverridesMortalTrait(divineTrait, mortalTrait) {
		const divinePart = normalizedTraitPart(divineTrait.part);
		const mortalPart = normalizedTraitPart(mortalTrait.part);
		return divineTrait.type === "divine_trait" && mortalTrait.type === "mortal_trait" && Boolean(divinePart) && divinePart === mortalPart;
	}
	function overriddenMortalTraits(selectedTraits) {
		const divineTraits = selectedTraits.filter((trait) => trait.type === "divine_trait");
		return selectedTraits.filter((trait) => trait.type === "mortal_trait" && divineTraits.some((divineTrait) => divineTraitOverridesMortalTrait(divineTrait, trait)));
	}
	function overridingDivineTraitForMortal(selectedTraits, mortalTrait) {
		return selectedTraits.find((trait) => divineTraitOverridesMortalTrait(trait, mortalTrait));
	}
	function effectiveTraitsForCalculation(selectedTraits) {
		const overriddenIds = new Set(overriddenMortalTraits(selectedTraits).map((trait) => trait.id));
		return selectedTraits.filter((trait) => !overriddenIds.has(trait.id));
	}
	function hasBlockingTraitPartConflict(traits) {
		for (let i = 0; i < traits.length; i += 1) {
			const first = traits[i];
			if (first.type === "saint_trait") continue;
			const firstPart = normalizedTraitPart(first.part);
			if (!firstPart) continue;
			for (let j = i + 1; j < traits.length; j += 1) {
				const second = traits[j];
				if (second.type === "saint_trait") continue;
				if (firstPart !== normalizedTraitPart(second.part)) continue;
				if (divineTraitOverridesMortalTrait(first, second) || divineTraitOverridesMortalTrait(second, first)) continue;
				return true;
			}
		}
		return false;
	}
	//#endregion
	//#region packages/core/src/validation/validate-build.ts
	function availableDivineRaces(data, input) {
		const rows = getBloodlineRows(input);
		const hasDivineSkill = (race) => data.traits.some((trait) => trait.type === "divine_skill" && trait.race === race);
		const races = rows.filter((row) => row.percent > 70).map((row) => traitRaceForBloodline(data, row.race)).filter((race) => race && race !== "平民" && hasDivineSkill(race));
		return [.../* @__PURE__ */ new Set([...races, "圣子"])];
	}
	function allowedMortalRaces(data, input) {
		return getBloodlineRows(input).filter((row) => traitRaceForBloodline(data, row.race) !== "平民").sort((a, b) => b.percent - a.percent).slice(0, 2).map((row) => traitRaceForBloodline(data, row.race));
	}
	function saintTraitGroup(data, trait) {
		if (trait.type !== "saint_trait") return "";
		return getSaintTraitGroups(data).find((group) => group.traitIds.includes(trait.id))?.label || "";
	}
	function getSaintTraitGroups(data) {
		const saintTraits = data.traits.filter((item) => item.type === "saint_trait" && item.race === "圣子");
		return [{
			id: "mark",
			label: "圣印",
			maxSelected: 1,
			traitIds: saintTraits.slice(0, 4).map((trait) => trait.id)
		}, {
			id: "role",
			label: "身份",
			maxSelected: 1,
			traitIds: saintTraits.slice(4, 8).map((trait) => trait.id)
		}];
	}
	function getTraitSelectionAvailability(data, input, traitId) {
		const trait = data.traits.find((item) => item.id === traitId);
		const base = getTraitAvailability(data, input, traitId);
		if (!trait) return base;
		const selectedIds = new Set(input.traitIds || []);
		const selectedTraits = (input.traitIds || []).map((id) => data.traits.find((item) => item.id === id)).filter((item) => Boolean(item));
		const selected = selectedIds.has(trait.id);
		const reasons = [...base.reasons];
		const warnings = [...base.warnings || []];
		if (!selected && trait.type === "divine_skill") {
			if (selectedTraits.filter((item) => item.type === "divine_skill").length > 0) reasons.push({
				code: "DIVINE_SKILL_LIMIT",
				message: "只能选择一个神技"
			});
			if (!availableDivineRaces(data, input).includes(trait.race)) reasons.push({
				code: "DIVINE_SKILL_RACE_UNAVAILABLE",
				message: `${trait.race}神技当前不可选`
			});
		}
		if (!selected && trait.type === "divine_trait") {
			if (selectedTraits.filter((item) => item.type === "divine_trait" && item.race === trait.race).length >= 2) reasons.push({
				code: "DIVINE_TRAIT_LIMIT",
				message: "神子特性最多选择两个"
			});
			const selectedSkill = selectedTraits.find((item) => item.type === "divine_skill");
			if (selectedSkill && selectedSkill.race !== trait.race) reasons.push({
				code: "DIVINE_TRAIT_RACE_MISMATCH",
				message: `需要先选择${trait.race}神技`
			});
		}
		if (!selected && trait.type === "saint_trait") {
			const group = getSaintTraitGroups(data).find((item) => item.traitIds.includes(trait.id));
			if (group) {
				if (selectedTraits.filter((item) => group.traitIds.includes(item.id)).length >= group.maxSelected) reasons.push({
					code: "SAINT_TRAIT_GROUP_LIMIT",
					message: `${group.label}只能选择一个`
				});
			}
			const selectedSkill = selectedTraits.find((item) => item.type === "divine_skill");
			if (selectedSkill && selectedSkill.race !== "圣子") reasons.push({
				code: "SAINT_TRAIT_SKILL_MISMATCH",
				message: "需要先选择圣子神技"
			});
		}
		if (!selected && trait.type === "mortal_trait") {
			if (selectedTraits.filter((item) => item.type === "mortal_trait").length >= 3) reasons.push({
				code: "MORTAL_TRAIT_LIMIT",
				message: "凡人特性最多选择三个"
			});
			if (!allowedMortalRaces(data, input).includes(trait.race)) reasons.push({
				code: "MORTAL_TRAIT_RACE_UNAVAILABLE",
				message: `${trait.race}凡人特性当前不可选`
			});
		}
		if (trait.part && trait.type !== "saint_trait") {
			const part = normalizedTraitPart(trait.part);
			const occupiedTraits = selectedTraits.filter((item) => item.id !== trait.id && item.type !== "saint_trait" && normalizedTraitPart(item.part) === part);
			for (const occupied of occupiedTraits) if (divineTraitOverridesMortalTrait(trait, occupied)) warnings.push({
				code: "MORTAL_TRAIT_WILL_BE_OVERRIDDEN",
				message: `选择后会覆盖凡人特性：${occupied.name}`
			});
			else if (divineTraitOverridesMortalTrait(occupied, trait)) warnings.push({
				code: "MORTAL_TRAIT_OVERRIDDEN_BY_DIVINE",
				message: `会被神子特性${occupied.name}覆盖，计算时不生效`
			});
			else if (!selected) reasons.push({
				code: "TRAIT_PART_CONFLICT",
				message: `${trait.part}部位已被${occupied.name}占用`
			});
		}
		return {
			available: reasons.length === 0,
			reasons,
			warnings,
			displayName: base.displayName,
			prerequisites: base.prerequisites
		};
	}
	function validateBuild(data, input, selectedTraits) {
		const messages = validateBuildMessages(data, input, selectedTraits).map((message) => ({
			severity: "warning",
			code: "BUILD_RULE_WARNING",
			message
		}));
		return {
			messages,
			valid: messages.every((message) => message.severity !== "error")
		};
	}
	function validateBuildMessages(data, input, selectedTraits) {
		const warnings = [];
		const bloodlines = getBloodlineRows(input);
		const totalBloodline = bloodlineTotal(input);
		if (!bloodlines.length) warnings.push("尚未填写血脉，系统会按 100% 平民血脉计算。");
		if (totalBloodline > 100) warnings.push(`血脉合计为 ${totalBloodline}%，超过 100%。`);
		const seenBloodlines = /* @__PURE__ */ new Set();
		bloodlines.forEach((row, index) => {
			if (!data.races[row.race]) warnings.push(`第 ${index + 1} 条血脉未找到：${row.race}。`);
			if (row.percent % 10 !== 0) warnings.push(`${row.race} 血脉为 ${row.percent}%，不是 10% 的倍数。`);
			if (seenBloodlines.has(row.race)) warnings.push(`${row.race} 血脉重复填写。`);
			seenBloodlines.add(row.race);
		});
		const potentialLimit = calculateBasePotential(data, input);
		const actualPotential = input.characterPotential || potentialLimit;
		statKeys.forEach((stat) => {
			const actual = Number(actualPotential[stat]) || 0;
			if (actual > potentialLimit[stat] + 1e-9) warnings.push(`${data.statLabels[stat]}潜力 ${actual} 超过血脉加权上限 ${round(potentialLimit[stat], 4)}。`);
		});
		const divineSkills = selectedTraits.filter((item) => item.type === "divine_skill");
		const availableSkills = availableDivineRaces(data, input);
		if (divineSkills.length === 0) warnings.push("尚未选择神技，战斗属性不会获得神技战斗值。");
		if (divineSkills.length > 1) warnings.push("选择了多个神技；规则要求有且仅有一个神技。当前会把神技战斗值相加，建议修正。");
		divineSkills.forEach((skill) => {
			if (!hasAnyStat(skill.divineCombatValue)) warnings.push(`${skill.name} 尚未录入神技战斗值，因此只会应用成长列。`);
			if (!availableSkills.includes(skill.race)) warnings.push(`${skill.name} 需要 ${skill.race} 血脉大于 70%；圣子神技不受血脉限制。`);
		});
		const divineRace = divineSkills[0]?.race || "";
		const divineTraits = selectedTraits.filter((item) => item.type === "divine_trait");
		if (divineTraits.length > 2) warnings.push("神子特性超过两个。");
		divineTraits.forEach((item) => {
			if (divineRace && item.race !== divineRace) warnings.push(`${item.name} 属于${item.race}神子特性，但当前神技属于${divineRace}。`);
			getTraitAvailability(data, input, item.id).reasons.forEach((reason) => warnings.push(`${item.name} ${reason.message}。`));
		});
		const saintTraits = selectedTraits.filter((item) => item.type === "saint_trait");
		const saintMarkCount = saintTraits.filter((item) => saintTraitGroup(data, item) === "圣印").length;
		const saintRoleCount = saintTraits.filter((item) => saintTraitGroup(data, item) === "身份").length;
		if (saintMarkCount > 1) warnings.push("圣子前四个圣印特性只能选择一个。");
		if (saintRoleCount > 1) warnings.push("圣子后四个身份特性只能选择一个。");
		saintTraits.forEach((item) => {
			if (divineRace && divineRace !== "圣子") warnings.push(`${item.name} 属于圣子特性，但当前神技属于${divineRace}。`);
		});
		const mortalTraits = selectedTraits.filter((item) => item.type === "mortal_trait");
		if (mortalTraits.length > 3) warnings.push("凡人特性超过三个。");
		const allowedMortals = allowedMortalRaces(data, input);
		const mortalRaces = [...new Set(mortalTraits.map((item) => item.race).filter(Boolean))];
		if (mortalRaces.length > 2) warnings.push(`凡人特性涉及 ${mortalRaces.length} 个种族，超过两个：${mortalRaces.join("、")}。`);
		mortalTraits.forEach((item) => {
			if (!allowedMortals.includes(item.race)) warnings.push(`${item.name} 不属于当前血脉最高的前两个种族凡人特性。`);
		});
		overriddenMortalTraits(selectedTraits).forEach((trait) => {
			const divine = selectedTraits.find((item) => divineTraitOverridesMortalTrait(item, trait));
			if (divine) warnings.push(`${trait.name} 被神子特性 ${divine.name} 覆盖，计算属性时不生效。`);
		});
		const reportedPartConflicts = /* @__PURE__ */ new Set();
		for (let i = 0; i < selectedTraits.length; i += 1) {
			const first = selectedTraits[i];
			if (!first.part || first.type === "saint_trait") continue;
			for (let j = i + 1; j < selectedTraits.length; j += 1) {
				const second = selectedTraits[j];
				if (!second.part || second.type === "saint_trait") continue;
				const part = normalizedTraitPart(first.part);
				if (!part || part !== normalizedTraitPart(second.part)) continue;
				if (divineTraitOverridesMortalTrait(first, second) || divineTraitOverridesMortalTrait(second, first)) continue;
				const key = `${part}:${first.id}:${second.id}`;
				if (reportedPartConflicts.has(key)) continue;
				reportedPartConflicts.add(key);
				warnings.push(`${part} 部位冲突：${first.name} 与 ${second.name}。`);
			}
		}
		validateLevelsAndClasses(data, input, warnings);
		return warnings;
	}
	function validateLevelsAndClasses(data, input, warnings) {
		const level = Number(input.level) || 0;
		if (level < 1) warnings.push("目标等级必须大于等于 1。");
		const currentEnabled = Boolean(input.currentState?.enabled);
		const currentLevel = currentEnabled ? Number(input.currentState?.currentLevel) || 1 : 0;
		const minGrowthLevel = currentLevel > 0 ? currentLevel + 1 : 1;
		if (currentEnabled) {
			if (currentLevel < 1) warnings.push("当前等级必须大于等于 1。");
			if (currentLevel >= level) warnings.push(`当前等级 ${currentLevel} 必须低于目标等级 ${level}。`);
			if (input.currentState?.className && !data.classValues[input.currentState.className]) warnings.push(`当前职业未在职业值表中找到：${input.currentState.className}。`);
		}
		const covered = /* @__PURE__ */ new Map();
		input.growthSegments.forEach((segment, index) => {
			const from = Number(segment.fromLevel);
			const to = Number(segment.toLevel);
			if (!data.classGrowth[segment.className]) warnings.push(`第 ${index + 1} 段成长职业未在职业潜力表中找到：${segment.className}。`);
			if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) warnings.push(`第 ${index + 1} 段成长等级范围无效。`);
			if (from < minGrowthLevel || to > level) warnings.push(`第 ${index + 1} 段成长范围 ${from}-${to} 超出 ${minGrowthLevel}-${level}。`);
			for (let current = Math.max(minGrowthLevel, from); current <= Math.min(level, to); current += 1) {
				if (covered.has(current)) warnings.push(`等级 ${current} 被多个成长区间覆盖。`);
				covered.set(current, index);
			}
		});
		const expectedCovered = Math.max(0, level - minGrowthLevel + 1);
		if (expectedCovered > 0 && covered.size < expectedCovered) warnings.push(`成长路线只覆盖 ${covered.size}/${expectedCovered} 个可规划等级，未覆盖等级不会产生职业成长。`);
		if (!data.classValues[input.finalClass]) warnings.push(`最终职业未在职业值表中找到：${input.finalClass}。`);
	}
	//#endregion
	//#region packages/core/src/growth/calculate-growth.ts
	function currentStateEnabled(input) {
		return Boolean(input.currentState?.enabled);
	}
	function deriveCurrentGrowth(data, input, traitFlat, traitMultiplierBonus) {
		const currentState = input.currentState || void 0;
		if (!currentStateEnabled(input) || !currentState) return zeroVector();
		const currentClassValue = data.classValues[currentState.className] || zeroVector();
		const result = zeroVector();
		statKeys.forEach((stat) => {
			const multiplier = Math.max(1e-6, 1 + (Number(traitMultiplierBonus[stat]) || 0));
			result[stat] = (Number(currentState.stats?.[stat]) || 0) / multiplier - traitFlat[stat] - currentClassValue[stat];
		});
		return result;
	}
	function calculateGrowth(data, input) {
		const selectedTraits = input.traitIds.map((id) => data.traits.find((trait) => trait.id === id)).filter((trait) => Boolean(trait));
		const effectiveTraits = effectiveTraitsForCalculation(selectedTraits);
		const overriddenTraits = overriddenMortalTraits(selectedTraits);
		const warnings = validateBuildMessages(data, input, selectedTraits);
		const level = Number(input.level) || 0;
		const traitPotentialBonus = vectorSum(effectiveTraits, "potentialBonus");
		const traitFlat = vectorSum(effectiveTraits, "flatStats");
		const traitMultiplierBonus = vectorSum(effectiveTraits, "multiplierStats");
		const divineCombatValue = vectorSum(effectiveTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue");
		const finalClassValue = data.classValues[input.finalClass] || zeroVector();
		const potentialLimit = calculateBasePotential(data, input);
		const basePotential = cloneVector(input.characterPotential || potentialLimit);
		const finalCharacterPotential = zeroVector();
		statKeys.forEach((stat) => {
			finalCharacterPotential[stat] = basePotential[stat] + traitPotentialBonus[stat];
		});
		const currentGrowth = deriveCurrentGrowth(data, input, traitFlat, traitMultiplierBonus);
		const ordinaryGrowth = cloneVector(currentGrowth);
		let routeEffectiveGrowthLevels = 0;
		const routePotentialGrowth = zeroVector();
		const minGrowthLevel = currentStateEnabled(input) ? (Number(input.currentState?.currentLevel) || 0) + 1 : 1;
		const segmentBreakdowns = input.growthSegments.map((segment) => {
			const classPotential = data.classGrowth[segment.className] || zeroVector();
			const adjustedFromLevel = Math.max(Number(segment.fromLevel) || 1, minGrowthLevel);
			const adjustedToLevel = Math.min(Number(segment.toLevel) || 0, level);
			const levels = effectiveLevels(adjustedFromLevel, adjustedToLevel);
			routeEffectiveGrowthLevels += levels.total;
			const contribution = zeroVector();
			statKeys.forEach((stat) => {
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
				contribution
			};
		});
		const normalStats = zeroVector();
		const combatStats = zeroVector();
		const weightedFinalPotential = zeroVector();
		const breakdown = {};
		statKeys.forEach((stat) => {
			weightedFinalPotential[stat] = routeEffectiveGrowthLevels > 0 ? routePotentialGrowth[stat] / routeEffectiveGrowthLevels : finalCharacterPotential[stat];
			const multiplier = 1 + traitMultiplierBonus[stat];
			const divineCombatAdd = level * divineCombatValue[stat];
			const equipment = Number(input.equipmentStats?.[stat]) || 0;
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
				combatFormula: `${formatNumber(multiplier)} * (${formatNumber(ordinaryGrowth[stat])} + ${level} * ${formatNumber(divineCombatValue[stat])} + ${formatNumber(traitFlat[stat])} + ${formatNumber(equipment)} + ${formatNumber(classValue)})`
			};
		});
		return {
			input,
			selectedTraits,
			effectiveTraits,
			overriddenMortalTraits: overriddenTraits,
			bloodlineSummary: bloodlineSummary(data, input),
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
			warnings
		};
	}
	//#endregion
	//#region packages/core/src/heirloom/calculate-heirloom.ts
	function clampLevel(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return 0;
		return Math.max(0, Math.min(120, number));
	}
	function calculateHeirloomAttributes(data, input) {
		const level = clampLevel(input.level);
		const selectedCount = level < 20 ? 2 : 3;
		const classGrowth = data.classGrowth[input.className] || zeroVector();
		const characterPotential = cloneVector(input.characterPotential);
		const warnings = [];
		if (!data.classGrowth[input.className]) warnings.push(`未找到职业成长：${input.className || "未选择"}`);
		const totalGrowth = zeroVector();
		statKeys.forEach((stat) => {
			totalGrowth[stat] = (Number(characterPotential[stat]) || 0) + (Number(classGrowth[stat]) || 0);
		});
		const rankedStats = [...statKeys].sort((a, b) => {
			const delta = totalGrowth[b] - totalGrowth[a];
			return Math.abs(delta) > 1e-9 ? delta : statKeys.indexOf(a) - statKeys.indexOf(b);
		});
		const selectedStats = new Set(rankedStats.slice(0, selectedCount));
		const totalWeight = [...selectedStats].reduce((sum, stat) => {
			return sum + Math.max(0, Number(totalGrowth[stat]) || 0);
		}, 0);
		if (level > 0 && totalWeight <= 0) warnings.push("被选中的成长值合计不大于 0，无法分配传家宝属性。");
		const statValues = zeroVector();
		const allocations = statKeys.map((stat) => {
			const selected = selectedStats.has(stat);
			const positiveGrowth = Math.max(0, Number(totalGrowth[stat]) || 0);
			const weight = selected && totalWeight > 0 ? positiveGrowth / totalWeight : 0;
			const value = level * weight;
			statValues[stat] = value;
			return {
				stat,
				characterPotential: Number(characterPotential[stat]) || 0,
				classGrowth: Number(classGrowth[stat]) || 0,
				totalGrowth: Number(totalGrowth[stat]) || 0,
				selected,
				weight,
				value
			};
		});
		return {
			className: input.className,
			level,
			selectedCount,
			totalWeight,
			totalGrowth,
			statValues,
			allocations,
			selectedAllocations: allocations.filter((item) => item.selected).sort((a, b) => b.totalGrowth - a.totalGrowth || statKeys.indexOf(a.stat) - statKeys.indexOf(b.stat)),
			warnings
		};
	}
	//#endregion
	//#region packages/core/src/planner/skill-threshold.ts
	function isStat(value) {
		return statKeys.includes(String(value));
	}
	function normalizePlannerTargets(targets) {
		return (Array.isArray(targets) ? targets : []).map((target, index) => {
			const row = target;
			return {
				id: row.id || `target-${index + 1}`,
				name: String(row.name || "").trim(),
				stat: isStat(row.stat) ? row.stat : "strength",
				value: Number(row.value) || 0,
				groupId: String(row.groupId || "").trim()
			};
		}).filter((target) => target.value > 0);
	}
	function normalizeGearSets(gearSets) {
		return (Array.isArray(gearSets) ? gearSets : []).map((gear, index) => {
			const row = gear;
			return {
				id: row.id || `gear-${index + 1}`,
				name: String(row.name || `套装 ${index + 1}`).trim(),
				primaryStats: (Array.isArray(row.primaryStats) ? row.primaryStats : []).filter((stat, itemIndex, array) => isStat(stat) && array.indexOf(stat) === itemIndex).slice(0, 2),
				weapon: {
					type: String(row.weapon?.type || "").trim(),
					stats: cloneVector(row.weapon?.stats)
				},
				armor: {
					type: String(row.armor?.type || "").trim(),
					stats: cloneVector(row.armor?.stats)
				}
			};
		}).filter((gear) => gear.name);
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
	function classCanUseGear(data, className, gearSet) {
		const equipment = data.classEquipment?.[className];
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
	function groupPlannerTargets(data, targets) {
		const byKey = /* @__PURE__ */ new Map();
		targets.forEach((target) => {
			const key = targetGroupKey(target);
			if (!byKey.has(key)) byKey.set(key, []);
			byKey.get(key).push(target);
		});
		return [...byKey.entries()].map(([key, items]) => {
			const first = items[0];
			return {
				key,
				label: items.length > 1 ? `检查组 ${key}` : first.name || data.statLabels[first.stat] || first.stat,
				targets: items
			};
		});
	}
	function classEffectiveCapacities(data, input) {
		const maxLevel = Number(input.level) || 0;
		const minLevel = currentStateEnabled(input) ? (Number(input.currentState?.currentLevel) || 0) + 1 : 1;
		const covered = /* @__PURE__ */ new Set();
		const capacities = /* @__PURE__ */ new Map();
		(input.growthSegments || []).forEach((segment) => {
			const from = Math.max(minLevel, Number(segment.fromLevel) || 1);
			const to = Math.min(maxLevel, Number(segment.toLevel) || 0);
			if (from > to || !data.classGrowth[segment.className]) return;
			for (let level = from; level <= to; level += 1) {
				if (covered.has(level)) continue;
				covered.add(level);
				const effective = level <= 60 ? 1 : .35;
				capacities.set(segment.className, (capacities.get(segment.className) || 0) + effective);
			}
		});
		return Object.fromEntries([...capacities.entries()]);
	}
	function targetCheckFromResult(data, result, target) {
		const breakdown = result.breakdown[target.stat];
		const multiplier = Math.max(1e-6, Number(breakdown.multiplier) || 1);
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
			multiplier
		};
	}
	function fallbackThresholdCheck(data, input, group) {
		const result = calculateGrowth(data, Object.assign({}, input, {
			equipmentStats: zeroVector(),
			finalClass: input.finalClass
		}));
		const targetChecks = group.targets.map((target) => targetCheckFromResult(data, result, target));
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
			deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0)
		};
	}
	function thresholdCheckForState(data, input, group, gearSet, className) {
		const gearStats = gearSetStats(gearSet);
		const result = calculateGrowth(data, Object.assign({}, input, {
			equipmentStats: gearStats,
			finalClass: className
		}));
		const targetChecks = group.targets.map((target) => targetCheckFromResult(data, result, target));
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
			deficitSum: targetChecks.reduce((sum, target) => sum + target.insideDeficit, 0)
		};
	}
	function bestThresholdCheck(data, input, group, gearSets) {
		const candidates = [];
		Object.keys(data.classValues).forEach((className) => {
			gearSets.forEach((gearSet) => {
				if (!classCanUseGear(data, className, gearSet)) return;
				candidates.push(thresholdCheckForState(data, input, group, gearSet, className));
			});
		});
		if (!candidates.length) return Object.assign(fallbackThresholdCheck(data, input, group), { alternatives: [] });
		candidates.sort((a, b) => a.deficitSum - b.deficitSum || Number(!a.met) - Number(!b.met) || b.targetChecks.reduce((sum, target) => sum + target.value, 0) - a.targetChecks.reduce((sum, target) => sum + target.value, 0));
		return Object.assign(candidates[0], { alternatives: candidates.slice(1, 4) });
	}
	function aggregatePlannerAllocations(allocations) {
		return Object.values(allocations || {}).filter((item) => item.effectiveLevels > 1e-7).sort((a, b) => b.effectiveLevels - a.effectiveLevels || a.newClass.localeCompare(b.newClass, "zh-CN"));
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
			gearSetName: check.gearSetName
		})));
	}
	function coreStatVector(config) {
		const result = zeroVector();
		if (Array.isArray(config.coreStats)) {
			config.coreStats.forEach((stat) => {
				if (isStat(stat)) result[stat] = 1;
			});
			return result;
		}
		statKeys.forEach((stat) => {
			result[stat] = Number(config.coreWeights?.[stat]) > 0 ? 1 : 0;
		});
		return result;
	}
	function optimizeThresholdPlan(data, input, config, checks, growthClasses) {
		const coreStats = coreStatVector(config);
		const targetChecks = flattenTargetChecks(checks);
		const initialRemaining = {};
		targetChecks.forEach((target) => {
			initialRemaining[target.id] = Math.max(0, target.insideDeficit || 0);
		});
		if (Object.values(initialRemaining).every((value) => value <= 1e-7)) return [{
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
			requirements: []
		}];
		const initialCapacities = classEffectiveCapacities(data, input);
		const baseClasses = Object.keys(initialCapacities).filter((className) => initialCapacities[className] > 1e-7);
		if (!baseClasses.length || !growthClasses.length) return [];
		const transitions = baseClasses.flatMap((baseClass) => {
			const baseGrowth = data.classGrowth[baseClass] || zeroVector();
			return growthClasses.filter((newClass) => newClass !== baseClass).map((newClass) => {
				const newGrowth = data.classGrowth[newClass] || zeroVector();
				const perEffectiveDelta = zeroVector();
				statKeys.forEach((stat) => {
					perEffectiveDelta[stat] = newGrowth[stat] - baseGrowth[stat];
				});
				const targetProgress = targetChecks.reduce((sum, target) => sum + Math.max(0, perEffectiveDelta[target.stat]), 0);
				const coreLossPerEffective = zeroVector();
				let weightedLossPerEffective = 0;
				statKeys.forEach((stat) => {
					coreLossPerEffective[stat] = Number(coreStats[stat]) > 0 ? Math.max(0, -perEffectiveDelta[stat]) : 0;
					weightedLossPerEffective += coreLossPerEffective[stat];
				});
				return {
					key: `${baseClass}->${newClass}`,
					baseClass,
					newClass,
					perEffectiveDelta,
					targetProgress,
					coreLossPerEffective,
					weightedLossPerEffective
				};
			}).filter((transition) => transition.targetProgress > 1e-9);
		});
		if (!transitions.length) return [];
		const targetKeys = targetChecks.map((target) => target.id);
		const beamWidth = 520;
		const maxIterations = Math.min(18, Math.max(8, targetKeys.length * 5 + baseClasses.length * 2));
		const stateKey = (state) => [targetKeys.map((key) => round(state.remaining[key] || 0, 3)).join("|"), baseClasses.map((className) => `${className}:${round(state.capacities[className] || 0, 3)}`).join("|")].join("::");
		const unmetSum = (remaining) => targetKeys.reduce((sum, key) => sum + Math.max(0, remaining[key] || 0), 0);
		const objectiveSort = (a, b) => a.weightedLoss - b.weightedLoss || unmetSum(a.remaining) - unmetSum(b.remaining) || a.effectiveChanged - b.effectiveChanged;
		let beam = [{
			remaining: Object.assign({}, initialRemaining),
			capacities: Object.assign({}, initialCapacities),
			weightedLoss: 0,
			effectiveChanged: 0,
			coreLoss: zeroVector(),
			delta: zeroVector(),
			allocations: {}
		}];
		for (let iteration = 0; iteration < maxIterations; iteration += 1) {
			const next = [...beam];
			let added = false;
			beam.forEach((state) => {
				transitions.forEach((transition) => {
					const capacity = Number(state.capacities[transition.baseClass]) || 0;
					if (capacity <= 1e-7) return;
					const helpedTargets = targetChecks.map((target) => ({
						target,
						delta: transition.perEffectiveDelta[target.stat],
						remaining: Number(state.remaining[target.id]) || 0
					})).filter((item) => item.remaining > 1e-7 && item.delta > 1e-9);
					if (!helpedTargets.length) return;
					const maxUseful = Math.max(...helpedTargets.map((item) => item.remaining / item.delta));
					[
						...helpedTargets.map((item) => item.remaining / item.delta),
						maxUseful,
						capacity
					].map((value) => Math.min(capacity, value)).filter((value, index, array) => value > 1e-7 && array.findIndex((item) => Math.abs(item - value) <= 1e-7) === index).sort((a, b) => a - b).forEach((amount) => {
						const delta = zeroVector();
						const coreLoss = zeroVector();
						statKeys.forEach((stat) => {
							delta[stat] = transition.perEffectiveDelta[stat] * amount;
							coreLoss[stat] = transition.coreLossPerEffective[stat] * amount;
						});
						const remaining = Object.assign({}, state.remaining);
						targetChecks.forEach((target) => {
							remaining[target.id] = Math.max(0, (remaining[target.id] || 0) - delta[target.stat]);
						});
						const totalCoreLoss = cloneVector(state.coreLoss);
						const totalDelta = cloneVector(state.delta);
						statKeys.forEach((stat) => {
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
							delta: zeroVector()
						};
						const allocationDelta = cloneVector(previous.delta);
						addInto(allocationDelta, delta);
						allocations[transition.key] = {
							baseClass: transition.baseClass,
							newClass: transition.newClass,
							effectiveLevels: previous.effectiveLevels + amount,
							delta: allocationDelta
						};
						next.push({
							remaining,
							capacities,
							weightedLoss: state.weightedLoss + transition.weightedLossPerEffective * amount,
							effectiveChanged: state.effectiveChanged + amount,
							coreLoss: totalCoreLoss,
							delta: totalDelta,
							allocations
						});
						added = true;
					});
				});
			});
			if (!added) break;
			const bestByKey = /* @__PURE__ */ new Map();
			next.sort(objectiveSort);
			next.forEach((state) => {
				const key = stateKey(state);
				if (!bestByKey.has(key)) bestByKey.set(key, state);
			});
			const candidates = [...bestByKey.values()];
			const lowLoss = [...candidates].sort(objectiveSort).slice(0, Math.ceil(beamWidth / 2));
			const nearTarget = [...candidates].sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b)).slice(0, Math.floor(beamWidth / 2));
			const merged = /* @__PURE__ */ new Map();
			[...lowLoss, ...nearTarget].forEach((state) => {
				const key = `${stateKey(state)}:${round(state.weightedLoss, 4)}:${round(state.effectiveChanged, 3)}`;
				if (!merged.has(key)) merged.set(key, state);
			});
			beam = [...merged.values()].slice(0, beamWidth);
		}
		const metStates = beam.filter((state) => unmetSum(state.remaining) <= 1e-7).sort(objectiveSort);
		return (metStates.length ? selectPlannerStates(metStates, objectiveSort) : beam.sort((a, b) => unmetSum(a.remaining) - unmetSum(b.remaining) || objectiveSort(a, b)).slice(0, 3)).map((state) => {
			const targetResults = targetChecks.map((target) => {
				const projectedInside = target.normalInside + state.delta[target.stat];
				const projectedValue = projectedInside * target.multiplier;
				return Object.assign({}, target, {
					value: projectedValue,
					deficit: Math.max(0, target.required - projectedValue),
					insideDeficit: Math.max(0, target.required / target.multiplier - projectedInside)
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
				requirements: aggregatePlannerAllocations(state.allocations)
			};
		});
	}
	function planSkillThreshold(data, input, plannerConfig) {
		const config = plannerConfig || {};
		const targets = normalizePlannerTargets(config.targets || []);
		const gearSets = normalizeGearSets(config.gearSets || []);
		const growthClasses = Object.keys(data.classGrowth);
		const warnings = [];
		if (!targets.length) warnings.push("尚未设置有效技能门槛。");
		if (!gearSets.length) warnings.push("尚未填写属性套装，无法自动匹配学习状态。");
		targets.forEach((target) => {
			if (gearSets.length && !gearSets.some((gearSet) => gearSetSupportsStat(gearSet, target.stat))) warnings.push(`${target.name || data.statLabels[target.stat]} 需要${data.statLabels[target.stat]}，但当前没有套装提供该属性。`);
		});
		gearSets.forEach((gearSet) => {
			if (!Object.keys(data.classValues).filter((className) => classCanUseGear(data, className, gearSet)).length) warnings.push(`${gearSet.name} 没有匹配的可用职业，请检查武器与护甲类型。`);
		});
		const targetGroups = groupPlannerTargets(data, targets);
		const checks = targetGroups.map((group) => bestThresholdCheck(data, input, group, gearSets));
		checks.forEach((check) => {
			if (!check.compatible) warnings.push(`${check.label} 没有可用的套装 + 职业组合。`);
		});
		const meetsCurrent = checks.length > 0 && checks.every((check) => check.met);
		const displayGroupRank = {
			best: 0,
			combo: 1,
			single: 2,
			other: 3
		};
		const plans = targets.length && checks.every((check) => check.compatible) ? optimizeThresholdPlan(data, input, config, checks, growthClasses).sort((a, b) => (displayGroupRank[a.displayGroup] ?? 3) - (displayGroupRank[b.displayGroup] ?? 3) || Number(!a.reachable) - Number(!b.reachable) || a.weightedLoss - b.weightedLoss || a.replacementCount - b.replacementCount).slice(0, 6) : [];
		return {
			targets,
			gearSets,
			targetGroups,
			coreStats: statKeys.filter((stat) => Number(coreStatVector(config)[stat]) > 0),
			checks,
			meetsCurrent,
			plans,
			warnings
		};
	}
	//#endregion
	//#region packages/core/src/optimizer/build-limit.ts
	function normalizedLimitWeights(config) {
		const result = zeroVector();
		statKeys.forEach((stat) => {
			result[stat] = Math.max(0, Number(config?.targetWeights?.[stat]) || 0);
		});
		if (!statKeys.some((stat) => result[stat] > 0)) {
			result.technique = 1;
			result.agility = 1;
		}
		return result;
	}
	function normalizeLimitConstraints(input) {
		return (Array.isArray(input) ? input : []).map((item, index) => {
			const row = item;
			const stat = statKeys.includes(row.stat) ? row.stat : "will";
			return {
				id: String(row.id || `constraint-${index}`),
				stat,
				value: Math.max(0, Number(row.value) || 0),
				label: String(row.label || row.name || "").trim()
			};
		}).filter((item) => item.value > 0);
	}
	function limitWeightSum(weights) {
		return statKeys.reduce((sum, stat) => sum + (Number(weights[stat]) || 0), 0);
	}
	function scoreStatVector(vector, weights) {
		return statKeys.reduce((sum, stat) => sum + (Number(vector?.[stat]) || 0) * (Number(weights?.[stat]) || 0), 0);
	}
	function createRng(seed) {
		let state = Math.max(1, Math.floor(Number(seed) || 1)) % 2147483647;
		return () => {
			state = state * 48271 % 2147483647;
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
		return hasBlockingTraitPartConflict(traits);
	}
	function traitSearchScore(traits, weights, level) {
		const effectiveTraits = effectiveTraitsForCalculation(traits);
		const flat = vectorSum(effectiveTraits, "flatStats");
		const multiplier = vectorSum(effectiveTraits, "multiplierStats");
		const potential = vectorSum(effectiveTraits, "potentialBonus");
		const divine = vectorSum(effectiveTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue");
		return statKeys.reduce((sum, stat) => {
			return sum + (Number(weights[stat]) || 0) * (flat[stat] + potential[stat] * 40 + divine[stat] * (Number(level) || 0) + multiplier[stat] * 120);
		}, 0);
	}
	function traitIdsLabel(data, ids) {
		return ids.map((id) => data.traits.find((trait) => trait.id === id)?.name).filter(Boolean).join("，");
	}
	function generateTraitCombosForBuild(data, input, config, weights) {
		const level = Number(config.level) || Number(input.level) || 1;
		const maxTraitCombos = Math.max(1, Math.min(80, Number(config.maxTraitCombos) || 8));
		const availableSkillRaces = availableDivineRaces(data, input);
		const skillTraits = data.traits.filter((trait) => trait.type === "divine_skill" && availableSkillRaces.includes(trait.race));
		const skillChoices = skillTraits.length ? skillTraits : [null];
		const mortalCombos = combinations(data.traits.filter((trait) => trait.type === "mortal_trait" && allowedMortalRaces(data, input).includes(trait.race)), 3).filter((items) => !traitsHavePartConflict(items));
		const candidates = [];
		skillChoices.forEach((skill) => {
			const dependentType = skill?.race === "圣子" ? "saint_trait" : "divine_trait";
			const dependentPool = skill ? data.traits.filter((trait) => trait.type === dependentType && trait.race === skill.race) : [];
			(skill?.race === "圣子" ? dependentPool.slice(0, 4).flatMap((first) => dependentPool.slice(4, 8).map((second) => [first, second])) : combinations(dependentPool, 2).filter((items) => !traitsHavePartConflict(items))).forEach((dependent) => {
				mortalCombos.forEach((mortal) => {
					const traits = [
						skill,
						...dependent,
						...mortal
					].filter(Boolean);
					if (traitsHavePartConflict(traits)) return;
					const traitIds = traits.map((trait) => trait.id);
					candidates.push({
						traitIds,
						label: traitIdsLabel(data, traitIds) || "无神子特性",
						score: traitSearchScore(traits, weights, level)
					});
				});
			});
		});
		return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "zh-CN")).slice(0, maxTraitCombos);
	}
	function limitStatPriorities(config, weights) {
		const result = zeroVector();
		const maxWeight = Math.max(...statKeys.map((stat) => Number(weights[stat]) || 0), 1e-6);
		statKeys.forEach((stat) => {
			result[stat] = Math.max(result[stat], Math.min(1, (Number(weights[stat]) || 0) / maxWeight));
		});
		if (Number(config.equipmentWeight) > 0) result.constitution = Math.max(result.constitution, .72);
		normalizeLimitConstraints(config.constraints || []).forEach((constraint) => {
			result[constraint.stat] = Math.max(result[constraint.stat], .62);
		});
		return result;
	}
	function samplePotential(potentialLimit, priorities, rng, ideal) {
		const result = zeroVector();
		statKeys.forEach((stat) => {
			const upper = Math.max(0, (Number(potentialLimit[stat]) || 0) - .02);
			const priority = Math.max(0, Math.min(1, Number(priorities[stat]) || 0));
			const lower = Math.min(upper, upper * (.16 + priority * .52));
			if (ideal) result[stat] = upper;
			else {
				const roll = rng();
				const biasedRoll = priority > .45 ? Math.max(roll, rng() * priority) : roll;
				result[stat] = lower + (upper - lower) * biasedRoll;
			}
		});
		return result;
	}
	function buildRouteRequirements(data, config, constants, warnings) {
		const requirements = zeroVector();
		const details = [];
		const level = Number(config.level) || 1;
		const equipmentWeight = Number(config.equipmentWeight) || 0;
		if (equipmentWeight > 0) {
			const requiredCombatConstitution = equipmentWeight / 3.5;
			const neededGrowth = requiredCombatConstitution / Math.max(1e-6, 1 + constants.traitMultiplierBonus.constitution) - (level * constants.divineCombatValue.constitution + constants.traitFlat.constitution + (Number(config.equipmentStats?.constitution) || 0) + constants.finalClassValue.constitution);
			requirements.constitution = Math.max(requirements.constitution, neededGrowth);
			details.push({
				label: "最终负重",
				stat: "constitution",
				required: requiredCombatConstitution,
				growthRequired: Math.max(0, neededGrowth)
			});
		}
		normalizeLimitConstraints(config.constraints || []).forEach((constraint) => {
			const multiplier = Math.max(1e-6, 1 + constants.traitMultiplierBonus[constraint.stat]);
			const neededGrowth = constraint.value / multiplier - (level * constants.divineCombatValue[constraint.stat] + constants.traitFlat[constraint.stat] + (Number(config.equipmentStats?.[constraint.stat]) || 0) + constants.finalClassValue[constraint.stat]);
			requirements[constraint.stat] = Math.max(requirements[constraint.stat], neededGrowth);
			details.push({
				label: constraint.label || data.statLabels[constraint.stat],
				stat: constraint.stat,
				required: constraint.value,
				growthRequired: Math.max(0, neededGrowth)
			});
		});
		return {
			requirements,
			details
		};
	}
	function routeAllocationsText(allocations) {
		return Object.entries(allocations).filter(([, value]) => Number(value) > 1e-6).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([className, value]) => ({
			className,
			effectiveLevels: value
		}));
	}
	function optimizeLimitRoute(data, context) {
		const totalEffectiveLevels = effectiveLevels(1, context.level).total;
		const classNames = Object.keys(data.classGrowth);
		const rates = {};
		const scoreRates = {};
		classNames.forEach((className) => {
			rates[className] = zeroVector();
			statKeys.forEach((stat) => {
				rates[className][stat] = context.finalCharacterPotential[stat] + (Number(data.classGrowth[className]?.[stat]) || 0);
			});
			scoreRates[className] = scoreStatVector(rates[className], context.combatScoreWeights);
		});
		function evaluate(allocations) {
			const growth = zeroVector();
			Object.entries(allocations).forEach(([className, amount]) => {
				statKeys.forEach((stat) => {
					growth[stat] += rates[className][stat] * amount;
				});
			});
			const normalStats = zeroVector();
			const combatStats = zeroVector();
			statKeys.forEach((stat) => {
				const multiplier = 1 + context.traitMultiplierBonus[stat];
				const fixedNormal = context.traitFlat[stat] + (Number(context.equipmentStats?.[stat]) || 0) + context.finalClassValue[stat];
				const fixedCombat = fixedNormal + context.level * context.divineCombatValue[stat];
				normalStats[stat] = multiplier * (growth[stat] + fixedNormal);
				combatStats[stat] = multiplier * (growth[stat] + fixedCombat);
			});
			const deficits = zeroVector();
			statKeys.forEach((stat) => {
				deficits[stat] = Math.max(0, (Number(context.requirements[stat]) || 0) - growth[stat]);
			});
			const deficitSum = statKeys.reduce((sum, stat) => sum + deficits[stat], 0);
			return {
				allocations,
				allocationList: routeAllocationsText(allocations),
				growth,
				normalStats,
				combatStats,
				score: scoreStatVector(combatStats, context.targetWeights),
				met: deficitSum <= 1e-6,
				deficits,
				deficitSum
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
						statKeys.forEach((stat) => {
							delta[stat] = rates[toClass][stat] - rates[fromClass][stat];
							if (current.deficits[stat] > 1e-6 && delta[stat] > 1e-9) {
								progress += Math.min(current.deficits[stat], delta[stat]);
								maxUseful = Math.min(maxUseful, current.deficits[stat] / delta[stat]);
							}
						});
						if (progress <= 1e-9 || maxUseful <= 1e-9) return;
						const amountToMove = Math.max(1e-6, Math.min(amount, maxUseful));
						const ratio = Math.max(0, (scoreRates[fromClass] - scoreRates[toClass]) * amountToMove) / (progress * amountToMove);
						if (!bestMove || ratio < bestMove.ratio) bestMove = {
							fromClass,
							toClass,
							amount: amountToMove,
							ratio
						};
					});
				});
				const move = bestMove;
				if (!move) break;
				allocations[move.fromClass] = (allocations[move.fromClass] || 0) - move.amount;
				allocations[move.toClass] = (allocations[move.toClass] || 0) + move.amount;
				current = evaluate(allocations);
			}
			return current;
		}
		const orderedStarts = [...classNames].sort((a, b) => scoreRates[b] - scoreRates[a]).slice(0, Math.min(18, classNames.length));
		statKeys.forEach((stat) => {
			const bestForStat = [...classNames].sort((a, b) => rates[b][stat] - rates[a][stat])[0];
			if (bestForStat && !orderedStarts.includes(bestForStat)) orderedStarts.push(bestForStat);
		});
		return orderedStarts.map((className) => repair(className)).sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score || a.deficitSum - b.deficitSum)[0] || {};
	}
	function percentile(sortedValues, pct) {
		if (!sortedValues.length) return 0;
		return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * pct) - 1))] || 0;
	}
	function aggregateLimitStats(results) {
		const sortedScores = results.map((item) => item.score).sort((a, b) => a - b);
		const passCount = results.filter((item) => item.met).length;
		return {
			average: sortedScores.reduce((sum, value) => sum + value, 0) / Math.max(1, sortedScores.length),
			median: percentile(sortedScores, .5),
			p90: percentile(sortedScores, .9),
			p95: percentile(sortedScores, .95),
			passRate: passCount / Math.max(1, results.length)
		};
	}
	function evaluateOneLimitBuild(data, baseInput, traitIds, config, rng, priorities) {
		const level = Number(config.level) || 1;
		const effectiveTraits = effectiveTraitsForCalculation(traitIds.map((id) => data.traits.find((trait) => trait.id === id)).filter(Boolean));
		const traitPotentialBonus = vectorSum(effectiveTraits, "potentialBonus");
		const constants = {
			traitFlat: vectorSum(effectiveTraits, "flatStats"),
			traitMultiplierBonus: vectorSum(effectiveTraits, "multiplierStats"),
			divineCombatValue: vectorSum(effectiveTraits.filter((item) => item.type === "divine_skill"), "divineCombatValue"),
			finalClassValue: data.classValues[config.finalClass || ""] || zeroVector()
		};
		const warnings = [];
		const requirements = buildRouteRequirements(data, config, constants, warnings);
		const potentialLimit = calculateBasePotential(data, baseInput);
		const sampleCount = Math.max(1, Math.min(200, Number(config.sampleCount) || 16));
		const weights = normalizedLimitWeights(config);
		const combatScoreWeights = zeroVector();
		statKeys.forEach((stat) => {
			combatScoreWeights[stat] = weights[stat] * (1 + constants.traitMultiplierBonus[stat]);
		});
		function runSample(characterPotential, ideal) {
			const finalCharacterPotential = zeroVector();
			statKeys.forEach((stat) => {
				finalCharacterPotential[stat] = characterPotential[stat] + traitPotentialBonus[stat];
			});
			const route = optimizeLimitRoute(data, {
				level,
				finalCharacterPotential,
				traitFlat: constants.traitFlat,
				traitMultiplierBonus: constants.traitMultiplierBonus,
				divineCombatValue: constants.divineCombatValue,
				finalClassValue: constants.finalClassValue,
				equipmentStats: config.equipmentStats || zeroVector(),
				requirements: requirements.requirements,
				targetWeights: weights,
				combatScoreWeights
			});
			return Object.assign(route, {
				characterPotential,
				ideal
			});
		}
		const theory = runSample(samplePotential(potentialLimit, priorities, rng, true), true);
		const samples = [];
		for (let i = 0; i < sampleCount; i += 1) samples.push(runSample(samplePotential(potentialLimit, priorities, rng, false), false));
		const aggregate = aggregateLimitStats(samples);
		const bestSample = [...samples].sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score)[0];
		return {
			traitIds,
			traitLabel: traitIdsLabel(data, traitIds),
			theory,
			bestSample,
			samples,
			aggregate,
			requirementDetails: requirements.details,
			warnings
		};
	}
	function evaluateBuildLimits(data, config, plannerConfig) {
		const weights = normalizedLimitWeights(config);
		const warnings = [];
		if (limitWeightSum(weights) <= 0) warnings.push("未设置目标权重，已按技巧/敏捷各 1 计算。");
		const seed = config.seed || 20260623;
		const rng = createRng(seed);
		const priorities = limitStatPriorities(config, weights);
		const bloodlines = Array.isArray(config.bloodlines) && config.bloodlines.length ? config.bloodlines : [];
		const traitIds = Array.isArray(config.traitIds) ? config.traitIds.filter((id, index, array) => array.indexOf(id) === index) : [];
		const baseInput = {
			sex: config.sex || "女",
			level: Number(config.level) || 1,
			bloodlines,
			traitIds,
			characterPotential: zeroVector(),
			growthSegments: [],
			equipmentStats: config.equipmentStats || zeroVector(),
			finalClass: config.finalClass || ""
		};
		const evaluated = [];
		if (!bloodlines.length) warnings.push("当前未指定血脉，系统会按 100% 平民血脉评估。");
		if (!traitIds.length) warnings.push("当前未选择特性，本轮会按无特性构筑评估。");
		const result = evaluateOneLimitBuild(data, baseInput, traitIds, config, rng, priorities);
		result.bloodlines = bloodlines;
		result.bloodlineLabel = bloodlineSummary(data, { bloodlines }).map((row) => `${row.race}${row.percent}%${row.autoFilled ? "(自动)" : ""}`).join(" + ");
		result.warnings.forEach((warning) => {
			if (!warnings.includes(warning)) warnings.push(warning);
		});
		evaluated.push(result);
		return {
			generatedBloodlineCount: 1,
			evaluatedBuildCount: evaluated.length,
			sampleCount: Math.max(1, Math.min(200, Number(config.sampleCount) || 16)),
			seed,
			constraints: normalizeLimitConstraints(config.constraints || []),
			targetWeights: weights,
			priorities,
			results: evaluated,
			warnings
		};
	}
	//#endregion
	//#region packages/core/src/index.ts
	var src_exports = /* @__PURE__ */ __exportAll({
		addInto: () => addInto,
		allowedMortalRaces: () => allowedMortalRaces,
		availableDivineRaces: () => availableDivineRaces,
		bloodlineSummary: () => bloodlineSummary,
		bloodlineTotal: () => bloodlineTotal,
		bloodlineTraitRaceMap: () => bloodlineTraitRaceMap,
		calculateBasePotential: () => calculateBasePotential,
		calculateGrowth: () => calculateGrowth,
		calculateHeirloomAttributes: () => calculateHeirloomAttributes,
		classCanUseGear: () => classCanUseGear,
		classCategories: () => classCategories,
		classEquipment: () => classEquipment,
		classGrowth: () => classGrowth,
		classValues: () => classValues,
		cloneVector: () => cloneVector,
		commonerRace: () => commonerRace,
		currentStateEnabled: () => currentStateEnabled,
		deriveCurrentGrowth: () => deriveCurrentGrowth,
		displayTraitName: () => displayTraitName,
		divineTraitOverridesMortalTrait: () => divineTraitOverridesMortalTrait,
		effectiveLevels: () => effectiveLevels,
		effectiveTraitsForCalculation: () => effectiveTraitsForCalculation,
		evaluateBuildLimits: () => evaluateBuildLimits,
		formatNumber: () => formatNumber,
		gearSetStats: () => gearSetStats,
		generateTraitCombosForBuild: () => generateTraitCombosForBuild,
		getBloodlineRows: () => getBloodlineRows,
		getClassCategories: () => getClassCategories,
		getClassCategory: () => getClassCategory,
		getSaintTraitGroups: () => getSaintTraitGroups,
		getTraitAvailability: () => getTraitAvailability,
		getTraitSelectionAvailability: () => getTraitSelectionAvailability,
		groupClassesByCategory: () => groupClassesByCategory,
		hasAnyStat: () => hasAnyStat,
		hasBlockingTraitPartConflict: () => hasBlockingTraitPartConflict,
		hasBloodlineTraitRace: () => hasBloodlineTraitRace,
		normalizeGearSets: () => normalizeGearSets,
		normalizePlannerTargets: () => normalizePlannerTargets,
		normalizedTraitPart: () => normalizedTraitPart,
		overriddenMortalTraits: () => overriddenMortalTraits,
		overridingDivineTraitForMortal: () => overridingDivineTraitForMortal,
		parseHybridTraitName: () => parseHybridTraitName,
		planSkillThreshold: () => planSkillThreshold,
		races: () => races,
		round: () => round,
		ruleData: () => ruleData,
		ruleStatLabels: () => ruleStatLabels,
		ruleStats: () => ruleStats,
		saintTraitGroup: () => saintTraitGroup,
		statKeys: () => statKeys,
		statLabels: () => statLabels,
		traitPrerequisites: () => traitPrerequisites,
		traitRaceForBloodline: () => traitRaceForBloodline,
		traits: () => traits,
		validateBuild: () => validateBuild,
		validateBuildMessages: () => validateBuildMessages,
		vectorHasStat: () => vectorHasStat,
		vectorSum: () => vectorSum,
		zeroVector: () => zeroVector
	});
	//#endregion
	//#region packages/core/src/browser.ts
	if (typeof window !== "undefined") window.ZhushenCore = src_exports;
	//#endregion
	exports.addInto = addInto;
	exports.allowedMortalRaces = allowedMortalRaces;
	exports.availableDivineRaces = availableDivineRaces;
	exports.bloodlineSummary = bloodlineSummary;
	exports.bloodlineTotal = bloodlineTotal;
	exports.bloodlineTraitRaceMap = bloodlineTraitRaceMap;
	exports.calculateBasePotential = calculateBasePotential;
	exports.calculateGrowth = calculateGrowth;
	exports.calculateHeirloomAttributes = calculateHeirloomAttributes;
	exports.classCanUseGear = classCanUseGear;
	exports.classCategories = classCategories;
	exports.classEquipment = classEquipment;
	exports.classGrowth = classGrowth;
	exports.classValues = classValues;
	exports.cloneVector = cloneVector;
	exports.commonerRace = commonerRace;
	exports.currentStateEnabled = currentStateEnabled;
	exports.deriveCurrentGrowth = deriveCurrentGrowth;
	exports.displayTraitName = displayTraitName;
	exports.divineTraitOverridesMortalTrait = divineTraitOverridesMortalTrait;
	exports.effectiveLevels = effectiveLevels;
	exports.effectiveTraitsForCalculation = effectiveTraitsForCalculation;
	exports.evaluateBuildLimits = evaluateBuildLimits;
	exports.formatNumber = formatNumber;
	exports.gearSetStats = gearSetStats;
	exports.generateTraitCombosForBuild = generateTraitCombosForBuild;
	exports.getBloodlineRows = getBloodlineRows;
	exports.getClassCategories = getClassCategories;
	exports.getClassCategory = getClassCategory;
	exports.getSaintTraitGroups = getSaintTraitGroups;
	exports.getTraitAvailability = getTraitAvailability;
	exports.getTraitSelectionAvailability = getTraitSelectionAvailability;
	exports.groupClassesByCategory = groupClassesByCategory;
	exports.hasAnyStat = hasAnyStat;
	exports.hasBlockingTraitPartConflict = hasBlockingTraitPartConflict;
	exports.hasBloodlineTraitRace = hasBloodlineTraitRace;
	exports.normalizeGearSets = normalizeGearSets;
	exports.normalizePlannerTargets = normalizePlannerTargets;
	exports.normalizedTraitPart = normalizedTraitPart;
	exports.overriddenMortalTraits = overriddenMortalTraits;
	exports.overridingDivineTraitForMortal = overridingDivineTraitForMortal;
	exports.parseHybridTraitName = parseHybridTraitName;
	exports.planSkillThreshold = planSkillThreshold;
	exports.races = races;
	exports.round = round;
	exports.ruleData = ruleData;
	exports.ruleStatLabels = ruleStatLabels;
	exports.ruleStats = ruleStats;
	exports.saintTraitGroup = saintTraitGroup;
	exports.statKeys = statKeys;
	exports.statLabels = statLabels;
	exports.traitPrerequisites = traitPrerequisites;
	exports.traitRaceForBloodline = traitRaceForBloodline;
	exports.traits = traits;
	exports.validateBuild = validateBuild;
	exports.validateBuildMessages = validateBuildMessages;
	exports.vectorHasStat = vectorHasStat;
	exports.vectorSum = vectorSum;
	exports.zeroVector = zeroVector;
	return exports;
})({});
