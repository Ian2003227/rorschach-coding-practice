// Static Rorschach Comprehensive System code tables (standard terminology, not from the
// copyrighted item bank) used to build the coding form and the glossary reference page.

const DETERMINANTS = [
  { code: "M", ap: true, zh: "人類運動" },
  { code: "FM", ap: true, zh: "動物運動" },
  { code: "m", ap: true, zh: "無生命運動" },
  { code: "FC", zh: "形狀為主的彩色" },
  { code: "CF", zh: "彩色為主的形狀" },
  { code: "C", zh: "純彩色" },
  { code: "Cn", zh: "色彩命名" },
  { code: "FC'", zh: "形狀為主的無彩色" },
  { code: "C'F", zh: "無彩色為主的形狀" },
  { code: "C'", zh: "純無彩色" },
  { code: "FT", zh: "形狀為主的材質" },
  { code: "TF", zh: "材質為主的形狀" },
  { code: "T", zh: "純材質" },
  { code: "FV", zh: "形狀為主的立體/深度" },
  { code: "VF", zh: "立體為主的形狀" },
  { code: "V", zh: "純立體/深度" },
  { code: "FY", zh: "形狀為主的陰影" },
  { code: "YF", zh: "陰影為主的形狀" },
  { code: "Y", zh: "純陰影" },
  { code: "FD", zh: "形狀為主的深度線索" },
  { code: "F", zh: "純形狀" },
  { code: "Fr", zh: "自身反射(形狀為主)" },
  { code: "rF", zh: "反射為主的形狀" },
];

const CONTENTS = [
  ["H", "完整人類"], ["(H)", "虛構/非真實人類"], ["Hd", "不完整人類"], ["(Hd)", "虛構的不完整人類"],
  ["Hx", "人類經驗/情緒"], ["A", "完整動物"], ["(A)", "虛構動物"], ["Ad", "不完整動物"], ["(Ad)", "虛構的不完整動物"],
  ["An", "解剖"], ["Art", "藝術"], ["Ay", "人類學/考古"], ["Bl", "血液"], ["Bt", "植物"], ["Cg", "衣物"],
  ["Cl", "雲"], ["Ex", "爆炸"], ["Fd", "食物"], ["Fi", "火"], ["Ge", "地圖"], ["Hh", "居家用品"],
  ["Ls", "風景"], ["Na", "自然"], ["Sc", "科學"], ["Sx", "性"], ["Xy", "X光"], ["Id", "自創/獨特內容"],
];

const SPECIALS = [
  ["DV", "怪異措辭 (第1級)"], ["DV2", "怪異措辭 (第2級)"],
  ["INC", "不合邏輯結合 (第1級)"], ["INC2", "不合邏輯結合 (第2級)"],
  ["DR", "偏離反應 (第1級)"], ["DR2", "偏離反應 (第2級)"],
  ["FAB", "虛談結合 (第1級)"], ["FAB2", "虛談結合 (第2級)"],
  ["ALOG", "不合理推論"], ["CONTAM", "汙染反應"],
  ["AB", "抽象內容"], ["AG", "攻擊性運動"], ["COP", "合作性運動"],
  ["MOR", "病態內容"], ["PER", "個人化"], ["PSV", "重複反應"], ["CP", "色彩投射"],
  ["GHR", "良好人類表徵"], ["PHR", "不良人類表徵"],
];

const ADJACENT_PAIRS = [
  ["FC", "CF"], ["CF", "C"],
  ["FC'", "C'F"], ["C'F", "C'"],
  ["FT", "TF"], ["TF", "T"],
  ["FV", "VF"], ["VF", "V"],
  ["FY", "YF"], ["YF", "Y"],
];

const SPECIAL_LEVEL_PAIRS = [
  ["DV", "DV2"], ["INC", "INC2"], ["DR", "DR2"], ["FAB", "FAB2"],
];

const DQ_OPTIONS = ["+", "o", "v/+", "v"];
const FQ_OPTIONS = ["+", "o", "u", "-"];
const CARDS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

window.RorConst = { DETERMINANTS, CONTENTS, SPECIALS, ADJACENT_PAIRS, SPECIAL_LEVEL_PAIRS, DQ_OPTIONS, FQ_OPTIONS, CARDS };
