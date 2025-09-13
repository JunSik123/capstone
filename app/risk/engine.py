import yaml
from typing import List
from app.models import GeoContext, ForecastDaily, AirQuality, PollenRisk, HazardScore, Advice

with open("app/risk/rules.yaml", "r", encoding="utf-8") as f:
    RULES = yaml.safe_load(f)


def _add_score(from_rules, value, why_list):
    score = 0.0
    if isinstance(from_rules, list):
        for cond in from_rules:
            ok = True
            if "gte" in cond and (value is None or value < cond["gte"]):
                ok = False
            if "lte" in cond and (value is None or value > cond["lte"]):
                ok = False
            if ok:
                score += cond.get("add", 0.0)
                if cond.get("why"): why_list.append(cond["why"])
    elif isinstance(from_rules, dict):
        if value in from_rules:
            cond = from_rules[value]
            score += cond.get("add", 0.0)
            if cond.get("why"): why_list.append(cond["why"])
    return score


def calc_hazards(geo: GeoContext, fc: ForecastDaily, air: AirQuality | None, pollen: PollenRisk | None) -> List[HazardScore]:
    out = []
    for hz, spec in RULES.get("hazards", {}).items():
        s = 0.0
        why = []
        base = spec.get("base", {})
        for k, rule in base.items():
            val = getattr(fc, k, None)
            if hz == "pm25" and k == "category" and air:
                val = air.category
            if hz == "pollen" and k in ("oak", "pine", "weed") and pollen:
                val = getattr(pollen, k, None)
            s += _add_score(rule, val, why)
        geo_rules = spec.get("geo", {})
        for gk, gr in geo_rules.items():
            gval = getattr(geo, gk, None)
            if gval is None:
                continue
            cond_ok = True
            if "gte" in gr and gval < gr["gte"]: cond_ok = False
            if "lte" in gr and gval > gr["lte"]: cond_ok = False
            if cond_ok:
                s += gr.get("add", 0.0)
                if gr.get("why"): why.append(gr["why"])
        s = max(0.0, min(1.0, s))
        out.append(HazardScore(type=hz, score=s, why=why))
    return out


def map_advice(hazards: List[HazardScore]) -> List[Advice]:
    adv = []
    adv_map = RULES.get("advice", {})
    for hz in hazards:
        if hz.score >= 0.5 and hz.type in adv_map:
            for it in adv_map[hz.type]:
                adv.append(Advice(**it))
    return adv


def pick_ingredients(hazards: List[HazardScore]) -> list[dict]:
    ing_map = RULES.get("ingredients", {})
    picks = []
    for hz in sorted(hazards, key=lambda x: x.score, reverse=True):
        if hz.score < 0.5:
            continue
        for it in ing_map.get(hz.type, []):
            picks.append({
                "ingredient_kor": it.get("kor"),
                "ingredient_eng": it.get("eng"),
                "reason": f"{hz.type}:{it.get('reason')}"
            })
    seen = set(); uniq = []
    for p in picks:
        k = p["ingredient_kor"]
        if k in seen: continue
        seen.add(k); uniq.append(p)
    return uniq[:10]
