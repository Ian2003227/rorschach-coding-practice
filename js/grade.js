// Compares a user's coding answer against the item's key across 9 fields.
// Result per field: "correct" | "lenient" (reasonable disagreement per Exner) | "wrong"

function sameSet(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function detCodeList(dets) {
  // dets: [{code,ap}] -> comparable strings, e.g. "Ma", "FC"
  return dets.map(d => d.code + (d.ap ? d.ap : ""));
}

function isLenientDeterminantDiff(userDets, keyDets) {
  const u = detCodeList(userDets);
  const k = detCodeList(keyDets);
  if (u.length !== k.length) return false;
  // find symmetric difference
  const uOnly = u.filter(x => !k.includes(x));
  const kOnly = k.filter(x => !u.includes(x));
  if (uOnly.length !== 1 || kOnly.length !== 1) return false;
  return window.RorConst.ADJACENT_PAIRS.some(
    ([a, b]) => (uOnly[0] === a && kOnly[0] === b) || (uOnly[0] === b && kOnly[0] === a)
  );
}

function isLenientSpecialDiff(userSpecials, keySpecials) {
  const uOnly = userSpecials.filter(x => !keySpecials.includes(x));
  const kOnly = keySpecials.filter(x => !userSpecials.includes(x));
  if (uOnly.length !== 1 || kOnly.length !== 1) return false;
  return window.RorConst.SPECIAL_LEVEL_PAIRS.some(
    ([a, b]) => (uOnly[0] === a && kOnly[0] === b) || (uOnly[0] === b && kOnly[0] === a)
  );
}

function gradeItem(user, key) {
  const result = {};

  // location: base + space + loc_num
  const locOk = user.location_base === key.location_base &&
    !!user.space === !!key.space &&
    (key.location_base === "W" || user.loc_num === key.loc_num);
  result.location = locOk ? "correct" : "wrong";

  result.dq = user.dq === key.dq ? "correct" : "wrong";

  if (sameSet(detCodeList(user.determinants || []), detCodeList(key.determinants || []))) {
    result.determinants = "correct";
  } else if (isLenientDeterminantDiff(user.determinants || [], key.determinants || [])) {
    result.determinants = "lenient";
  } else {
    result.determinants = "wrong";
  }

  result.fq = (user.fq || null) === (key.fq || null) ? "correct" : "wrong";
  result.pair = !!user.pair === !!key.pair ? "correct" : "wrong";
  result.contents = sameSet(user.contents || [], key.contents || []) ? "correct" : "wrong";
  result.popular = !!user.popular === !!key.popular ? "correct" : "wrong";
  result.z = (user.z ?? null) === (key.z ?? null) ? "correct" : "wrong";

  if (sameSet(user.special || [], key.special || [])) {
    result.special = "correct";
  } else if (isLenientSpecialDiff(user.special || [], key.special || [])) {
    result.special = "lenient";
  } else {
    result.special = "wrong";
  }

  const fields = Object.values(result);
  const allCorrect = fields.every(v => v === "correct");
  const allOkOrLenient = fields.every(v => v !== "wrong");
  return { fields: result, allCorrect, allOkOrLenient };
}

window.RorGrade = { gradeItem, sameSet, detCodeList };
