import httpx
from statistics import mean
from fastapi import HTTPException

BASE = "https://kma.open-meteo.com/v1/forecast"


def _c_to_f(c: float) -> float:
    return c * 9.0 / 5.0 + 32.0


def _f_to_c(f: float) -> float:
    return (f - 32.0) * 5.0 / 9.0


def _heat_index_c(t_c: float, rh: float) -> float:
    t_f = _c_to_f(t_c)
    R = rh
    c1 = -42.379; c2 = 2.04901523; c3 = 10.14333127
    c4 = -0.22475541; c5 = -6.83783e-3; c6 = -5.481717e-2
    c7 = 1.22874e-3; c8 = 8.5282e-4; c9 = -1.99e-6
    hi_f = (c1 + c2*t_f + c3*R + c4*t_f*R + c5*(t_f**2) + c6*(R**2)
             + c7*(t_f**2)*R + c8*t_f*(R**2) + c9*(t_f**2)*(R**2))
    return _f_to_c(hi_f)


def _wind_chill_c(t_c: float, v_kmh: float) -> float:
    return 13.12 + 0.6215*t_c - 11.37*(v_kmh**0.16) + 0.3965*t_c*(v_kmh**0.16)


async def get_daily_summary(lat: float, lon: float, target_date: str):
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": [
            "temperature_2m",
            "relative_humidity_2m",
            "uv_index",
            "precipitation",
            "wind_speed_10m",
        ],
        "daily": [
            "uv_index_max",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "windspeed_10m_max"
        ],
        "timezone": "Asia/Seoul",
        "start_date": target_date,
        "end_date": target_date,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.get(BASE, params=params)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail="KMA forecast API error") from exc
        js = r.json()

    daily = js.get("daily", {})
    hourly = js.get("hourly", {})

    def _first(k):
        v = daily.get(k)
        return v[0] if isinstance(v, list) and v else None

    rh = hourly.get("relative_humidity_2m") or []
    temp = hourly.get("temperature_2m") or []
    wind = hourly.get("wind_speed_10m") or []

    rh_vals = [x for x in rh if x is not None]
    temp_vals = [x for x in temp if x is not None]
    wind_vals = [x for x in wind if x is not None]

    rh_mean = round(mean(rh_vals), 1) if rh_vals else None
    rh_min = round(min(rh_vals), 1) if rh_vals else None

    hi_list = []
    for t, h in zip(temp_vals, rh_vals):
        if t is None or h is None:
            continue
        if t >= 26.7 and h >= 40:
            hi_list.append(_heat_index_c(t, h))
    hi_max = round(max(hi_list), 1) if hi_list else None

    wc_list = []
    for t, v in zip(temp_vals, wind_vals):
        if t is None or v is None:
            continue
        if t <= 10.0 and v >= 4.8:
            wc_list.append(_wind_chill_c(t, v))
    wind_chill_min = round(min(wc_list), 1) if wc_list else None

    return {
        "date": target_date,
        "tmax": _first("temperature_2m_max"),
        "tmin": _first("temperature_2m_min"),
        "uv_max": _first("uv_index_max"),
        "precip_mm": _first("precipitation_sum"),
        "wind_max": _first("windspeed_10m_max"),
        "rh_mean": rh_mean,
        "rh_min": rh_min,
        "hi_max": hi_max,
        "wind_chill_min": wind_chill_min,
    }
