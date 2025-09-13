from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.ops import unary_union
import shapely.ops
from pyproj import Transformer
from typing import List, Dict

# EPSG:4326 (WGS84) -> EPSG:3857 (meters) for area/distance approx
_wgs84_to_m = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
_m_to_wgs84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def project_geom(geom):
    if geom.is_empty:
        return geom
    if geom.geom_type in {"Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point", "MultiPoint"}:
        return shapely_transform(geom)
    return geom


def shapely_transform(geom):
    # manual transform to avoid dependency on shapely.ops.transform signature changes
    def _xy(x, y, z=None):
        x2, y2 = _wgs84_to_m.transform(x, y)
        return (x2, y2) if z is None else (x2, y2, z)
    return shapely.ops.transform(lambda x, y, z=None: _xy(x, y, z), geom)


def area_m2(geom):
    g = shapely.ops.transform(lambda x, y: _wgs84_to_m.transform(x, y), geom)
    return g.area


def distance_m(a_lon, a_lat, b_lon, b_lat):
    ax, ay = _wgs84_to_m.transform(a_lon, a_lat)
    bx, by = _wgs84_to_m.transform(b_lon, b_lat)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
