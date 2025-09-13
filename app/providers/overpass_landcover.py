import httpx
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.ops import unary_union
from pyproj import Transformer
from app.config import settings
from typing import Tuple

LANDUSE_QUERY_TEMPLATE = """
[out:json][timeout:25];
(
  way(around:{radius},{lat},{lon})["landuse"="forest"];
  relation(around:{radius},{lat},{lon})["landuse"="forest"];
  way(around:{radius},{lat},{lon})["natural"="wood"];
  relation(around:{radius},{lat},{lon})["natural"="wood"];
  way(around:{radius},{lat},{lon})["landuse"="residential"];
  relation(around:{radius},{lat},{lon})["landuse"="residential"];
  way(around:{radius},{lat},{lon})["landuse"="industrial"];
  relation(around:{radius},{lat},{lon})["landuse"="industrial"];
  way(around:{radius},{lat},{lon})["landuse"="farmland"];
  relation(around:{radius},{lat},{lon})["landuse"="farmland"];
  way(around:{radius},{lat},{lon})["natural"="wetland"];
  relation(around:{radius},{lat},{lon})["natural"="wetland"];
  way(around:{radius},{lat},{lon})["natural"="coastline"];
);
out body; >; out skel qt;
"""

COASTLINE_QUERY_TEMPLATE = """
[out:json][timeout:25];
(
  way(around:{radius},{lat},{lon})["natural"="coastline"];
);
out body; >; out skel qt;
"""

async def fetch_overpass(ql: str):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(settings.OVERPASS_URL, data={"data": ql})
        r.raise_for_status()
        return r.json()


def _assemble_geometries(osm_json):
    nodes = {n["id"]: (n["lon"], n["lat"]) for n in osm_json.get("elements", []) if n["type"] == "node"}
    geoms = []
    for el in osm_json.get("elements", []):
        if el["type"] == "way" and "nodes" in el:
            coords = [nodes[nid] for nid in el["nodes"] if nid in nodes]
            if len(coords) >= 3:
                try:
                    poly = Polygon(coords)
                    if poly.is_valid:
                        geoms.append(poly)
                except Exception:
                    pass
    if not geoms:
        return None
    return unary_union(geoms)

async def compute_landcover_fractions(lat: float, lon: float, radius_m: int = 2000) -> dict:
    ql = LANDUSE_QUERY_TEMPLATE.format(radius=radius_m, lat=lat, lon=lon)
    js = await fetch_overpass(ql)
    geom = _assemble_geometries(js)
    classes = {
        "forest": "(way(around:{r},{lat},{lon})[\"landuse\"=\"forest\"];relation(around:{r},{lat},{lon})[\"landuse\"=\"forest\"];way(around:{r},{lat},{lon})[\"natural\"=\"wood\"];relation(around:{r},{lat},{lon})[\"natural\"=\"wood\"];);",
        "urban": "(way(around:{r},{lat},{lon})[\"landuse\"=\"residential\"];relation(around:{r},{lat},{lon})[\"landuse\"=\"residential\"];way(around:{r},{lat},{lon})[\"landuse\"=\"industrial\"];relation(around:{r},{lat},{lon})[\"landuse\"=\"industrial\"];);",
        "farmland": "(way(around:{r},{lat},{lon})[\"landuse\"=\"farmland\"];relation(around:{r},{lat},{lon})[\"landuse\"=\"farmland\"];);",
        "wetland": "(way(around:{r},{lat},{lon})[\"natural\"=\"wetland\"];relation(around:{r},{lat},{lon})[\"natural\"=\"wetland\"];);",
    }
    areas = {}
    for k, expr in classes.items():
        ql_k = f"[out:json][timeout:25];{expr}out body;>;out skel qt;".format(r=radius_m, lat=lat, lon=lon)
        js_k = await fetch_overpass(ql_k)
        geom_k = _assemble_geometries(js_k)
        if geom_k is None or geom_k.is_empty:
            areas[k] = 0.0
        else:
            areas[k] = 0.0
    return {
        "forest_frac": 1.0 if areas.get("forest", 0) > 0 else 0.0,
        "urban_frac": 1.0 if areas.get("urban", 0) > 0 else 0.0,
        "wetland_frac": 1.0 if areas.get("wetland", 0) > 0 else 0.0,
    }

async def estimate_coast_distance_km(lat: float, lon: float, search_radius_m: int = 50000) -> float | None:
    ql = COASTLINE_QUERY_TEMPLATE.format(radius=search_radius_m, lat=lat, lon=lon)
    js = await fetch_overpass(ql)
    nodes = {n["id"]: (n["lon"], n["lat"]) for n in js.get("elements", []) if n["type"] == "node"}
    min_d = None
    for el in js.get("elements", []):
        if el["type"] == "way" and "nodes" in el:
            for nid in el["nodes"]:
                if nid in nodes:
                    x, y = nodes[nid]
                    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
                    ax, ay = transformer.transform(lon, lat)
                    bx, by = transformer.transform(x, y)
                    d = ((ax - bx)**2 + (ay - by)**2) ** 0.5
                    if min_d is None or d < min_d:
                        min_d = d
    return (min_d / 1000.0) if min_d is not None else None
