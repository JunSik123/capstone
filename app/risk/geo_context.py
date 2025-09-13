from app.models import GeoContext
from app.providers.overpass_landcover import compute_landcover_fractions, estimate_coast_distance_km

async def build_geo_context(lat: float, lon: float) -> GeoContext:
    land = await compute_landcover_fractions(lat, lon, radius_m=2000)
    coast_km = await estimate_coast_distance_km(lat, lon, search_radius_m=50000)
    return GeoContext(
        coast_dist_km=coast_km,
        forest_frac=land.get("forest_frac", 0.0),
        urban_frac=land.get("urban_frac", 0.0),
        wetland_frac=land.get("wetland_frac", 0.0),
    )
