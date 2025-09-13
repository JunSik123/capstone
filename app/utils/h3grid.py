from h3 import h3

def latlon_to_h3(lat: float, lon: float, res: int = 7) -> str:
    return h3.geo_to_h3(lat, lon, res)
